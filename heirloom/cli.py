"""heirloom CLI (L0: cve, resume, clean, status)."""

from __future__ import annotations

import json
import shutil
import sys

import typer

from heirloom import config, guard
from heirloom.config import LINES, LineSpec, runtime_line
from heirloom.git_ops import git, git_ok, push
from heirloom.integrations import github
from heirloom.ledger import Ledger
from heirloom.pipeline.run import Result, execute

app = typer.Typer(add_completion=False, no_args_is_help=True)

EXIT = {"published": 0, "no_fix": 0, "evaluated": 0, "waiting_human": 2, "paused": 3}


def line_spec(line: str, tip: str | None, kind: str | None) -> LineSpec:
    """A configured line by name, or a runtime eval/distro line when --tip is given."""
    if tip is None:
        if line not in LINES:
            raise typer.BadParameter(f"unknown line {line!r}; pass --tip and --kind for a new one")
        return LINES[line]
    if kind not in ("eval", "distro"):
        raise typer.BadParameter("runtime lines need --kind eval or --kind distro")
    return runtime_line(line, tip, kind)  # type: ignore[arg-type]


def _report(r: Result) -> int:
    typer.echo(f"{r.cve} on {r.line}: {r.status}")
    typer.echo(f"  verdict     {r.verdict} ({r.reason})")
    typer.echo(f"  run         {r.run_id}")
    typer.echo(f"  cost        ${r.cost_usd:.4f}")
    if r.pr_url:
        typer.echo(f"  PR          {r.pr_url}")
    if r.checkpoint:
        typer.echo(f"  checkpoint  {r.checkpoint}")
    if r.message:
        typer.echo(f"  note        {r.message}")
    return EXIT.get(r.status, 1)


@app.command()
def cve(
    cve_id: str = typer.Argument(..., metavar="CVE"),
    line: str = "4.2",
    tip: str | None = typer.Option(None, help="Tip commit for a runtime (non-publishing) line."),
    kind: str | None = typer.Option(None, help="eval or distro (with --tip)."),
) -> None:
    """Bring one CVE to one line (resumes an unfinished run of the same CVE and line)."""
    raise typer.Exit(_report(execute(config.load(), cve_id, line_spec(line, tip, kind))))


@app.command()
def resume(cve_id: str | None = typer.Argument(None, metavar="[CVE]"), line: str = "4.2") -> None:
    """Continue every unfinished run (or one CVE's), reconciling unknown side effects."""
    s = config.load()
    ledger = Ledger(s.ledger_path)
    runs = [
        r
        for r in ledger.unfinished_runs()
        if r["status"] != "waiting_human" and (cve_id is None or r["cve"] == cve_id)
    ]
    ledger.close()
    if not runs:
        typer.echo("nothing to resume")
        raise typer.Exit(0)
    worst = 0
    for r in runs:
        typer.echo(f"resuming {r['cve']} on {r['line']} (run {r['run_id']}, was {r['status']})")
        spec = (
            LineSpec.from_json(json.loads(r["spec"]))
            if r["spec"]
            else line_spec(r["line"], None, None)
        )
        worst = max(worst, _report(execute(s, r["cve"], spec, run_id=r["run_id"])))
    raise typer.Exit(worst)


@app.command()
def clean(
    cve_id: str = typer.Argument(..., metavar="CVE"),
    line: str = "4.2",
    remote: bool = typer.Option(False, help="Also close the PR and delete the fork branch."),
) -> None:
    """Return a CVE × line to a clean state (run artifacts and checkpoints are kept)."""
    s = config.load()
    branch = f"heirloom/{cve_id.lower()}-{line}"
    if remote and not (line in LINES and LINES[line].publish):
        raise typer.BadParameter(f"--remote only applies to publishing lines, not {line!r}")
    if remote:
        with guard.publishing(LINES[line]):
            _clean_remote(s, cve_id, branch)
    trees = s.cve_dir(cve_id, line) / "trees"
    if trees.exists():
        for t in sorted(trees.iterdir()):
            git(s.django_repo, "worktree", "remove", "--force", str(t), check=False)
    git(s.django_repo, "worktree", "prune")
    if git_ok(s.django_repo, "rev-parse", "--verify", f"refs/heads/{branch}"):
        git(s.django_repo, "branch", "-q", "-D", branch)
    shutil.rmtree(s.cve_dir(cve_id, line), ignore_errors=True)
    ledger = Ledger(s.ledger_path)
    ledger.clear(cve_id, line)
    ledger.close()
    typer.echo(f"clean: {cve_id} on {line}")


def _clean_remote(s: config.Settings, cve_id: str, branch: str) -> None:
    """Close the PR and delete the fork branch (only reachable for publishing lines)."""
    found = github.find_pr(s.fork, branch)
    if found:
        github.close_pr(
            s.fork,
            int(found["number"]),
            "Closed by `heirloom clean --remote` for a clean-state rerun. The commit, its "
            "Entire checkpoint and the run artifacts stay available.",
        )
        typer.echo(f"closed {found['url']}")
    if git(s.django_repo, "ls-remote", s.fork_remote, f"refs/heads/{branch}").strip():
        push(s.django_repo, "-q", s.fork_remote, "--delete", branch)
        typer.echo(f"deleted {s.fork}:{branch}")


@app.command()
def status(cve_id: str = typer.Argument(..., metavar="CVE"), line: str = "4.2") -> None:
    """Show the ledger for a CVE × line."""
    ledger = Ledger(config.load().ledger_path)
    for r in ledger.stages(cve_id, line):
        typer.echo(
            f"{r.key.stage:18} #{r.key.attempt} {r.status:8} ${r.cost_usd:.4f} "
            f"span={r.span_id or '-'} {(r.error or '')[:80]}"
        )
    hits = ledger.hits(cve_id)
    if hits:
        typer.echo("local detection hits: " + ", ".join(h["detection"] for h in hits))


from heirloom.lines import commands as line_commands  # noqa: E402  (Thread B: distro lines)

app.add_typer(line_commands.distro_app, name="distro")
app.command("matrix")(line_commands.matrix_cmd)
app.command("new-probe")(line_commands.new_probe_cmd)


def main() -> None:
    try:
        app()
    except KeyboardInterrupt:
        sys.exit(130)
