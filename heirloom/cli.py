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
    s, spec = config.load(), line_spec(line, tip, kind)
    if spec.kind == "release":
        _check_fork(s, spec)
    raise typer.Exit(_report(execute(s, cve_id, spec)))


def _check_fork(s: config.Settings, spec: LineSpec) -> None:
    """Fail before any model spend when the fork cannot be reached or lacks the base."""
    from heirloom.git_ops import GitError

    try:
        out = git(s.django_repo, "ls-remote", s.fork_remote, f"refs/heads/{spec.base_branch}",
                  timeout=60)  # fmt: skip
    except GitError as exc:
        msg = f"fork remote {s.fork_remote!r} ({s.fork}) unreachable: {exc}"
        raise typer.BadParameter(msg) from None
    if not out.strip():
        raise typer.BadParameter(f"fork {s.fork} has no branch {spec.base_branch!r}")


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
def backtest(
    set_name: str = typer.Option("django-4.2-2026", "--set"),
    pipeline: str = typer.Option("v2", help="v2 (full Heirloom) or v1 (naive baseline)."),
    cve_ids: list[str] | None = typer.Option(None, "--cve", help="Only these CVEs (repeatable)."),
    kinds: list[str] | None = typer.Option(None, "--kind", help="positive/negative/extra."),
    v1_budget: float = typer.Option(0.5, help="Per-case model budget for v1 conflict resolution."),
    rerun: bool = typer.Option(False, help="Re-run cases that already have a result row."),
) -> None:
    """E1 backtest against the fellows' real 4.2 patches; results -> evals/results.json."""
    from heirloom import backtest as bt

    if set_name != bt.SET:
        raise typer.BadParameter(f"unknown set {set_name!r}")
    s = config.load()
    out = s.root / "evals" / "results.json"
    todo = [
        c
        for c in bt.cases(s.django_repo)
        if (not cve_ids or c.cve in cve_ids) and (not kinds or c.kind in kinds)
    ]
    done = json.loads(out.read_text()).get("runs", {}).get(pipeline, {}) if out.exists() else {}
    if not rerun:
        todo = [
            c for c in todo if done.get(f"{c.cve}:{c.kind}", {}).get("verdict") in (None, "SKIPPED")
        ]
    # Positives first: negatives reuse their calibrated probes.
    todo.sort(key=lambda c: {"positive": 0, "extra": 1, "negative": 2}[c.kind])
    for c in todo:
        typer.echo(f"{pipeline} {c.cve} {c.kind} L={c.tip[:10]} truth={c.truth} ...")
        result = bt.run_v2(s, c) if pipeline == "v2" else bt.run_v1(s, c, v1_budget)
        row = bt.record(out, pipeline, c, result)
        typer.echo(
            f"  -> {row['verdict']} ({row.get('reason')}) correct={row['correct']} "
            f"fellows_test={row.get('fellows_test_passes')} ${row['cost_usd']} "
            f"{row['minutes']} min"
        )
        if pipeline == "v2" and c.truth == "AFFECTED" and row["verdict"] == "NOT_AFFECTED_PROVEN":
            typer.echo("STOP: false NOT_AFFECTED in v2")
            raise typer.Exit(4)
    summary = json.loads(out.read_text())["summary"].get(pipeline)
    typer.echo(json.dumps(summary, indent=1))


@app.command()
def detections(
    create: bool = typer.Option(False, help="Create the five §5 conditional detections."),
    delete_s4: bool = typer.Option(False, help="Delete the two S4 test detections."),
    report: bool = typer.Option(True, help="Write hits/trends + local mirror to evals/."),
) -> None:
    """neatlogs detections: create, clean up, and report (with the ledger's local mirror)."""
    import time

    from heirloom.integrations import neatlogs_api as api

    s = config.load()
    client = api.Api(s)
    if create:
        existing = {d["displayName"] for d in client.detections()}
        for name, d in api.definitions().items():
            if name in existing:
                typer.echo(f"exists: {name}")
                continue
            code, _ = client.create(name, d["rules"], d["runOn"])
            typer.echo(f"create {name}: {code}")
    if delete_s4:
        for det in api.S4_TEST_DETECTIONS:
            code, _ = client.delete(det)
            typer.echo(f"delete {det}: {code}")
    if report:
        now = time.time()
        start = time.strftime("%Y-%m-%dT%H:00:00Z", time.gmtime(now - 86400))
        end = time.strftime("%Y-%m-%dT%H:00:00Z", time.gmtime(now + 3600))
        remote = {
            d["displayName"]: {
                "id": d["id"],
                "hits": client.hits(d["id"]),
                "trends": client.trends(d["id"], start, end),
            }
            for d in client.detections()
            if d["displayName"] in api.definitions()
        }
        ledger = Ledger(s.ledger_path)
        local: dict[str, int] = {}
        for h in ledger.hits():
            local[h["detection"]] = local.get(h["detection"], 0) + 1
        ledger.close()
        out = {
            "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "condition": {"runOn": "span_name heirloom.flag.<predicate>", **api.FLAG_CONDITION},
            "neatlogs": remote,
            "local_mirror": {name: local.get(name, 0) for name in api.definitions()},
        }
        path = s.root / "evals" / "detections.json"
        path.write_text(json.dumps(out, indent=2) + "\n")
        typer.echo(
            json.dumps(
                {
                    "neatlogs_hits": {k: v["hits"] for k, v in remote.items()},
                    "local_mirror": out["local_mirror"],
                }
            )
        )


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


@app.command()
def campaign(
    line: str = "4.2",
    replay: bool = typer.Option(False, help="Replay the security archive commit by commit."),
    workers: int = typer.Option(2, help="Parallel worker processes."),
    cap: float = typer.Option(18.0, help="Overflow USD this campaign may spend (provider cost)."),
    campaign_id: str | None = typer.Option(None, "--id", help="Continue this campaign."),
    cont: bool = typer.Option(
        False, "--continue", help="Poll answers, then re-queue waiting/blocked events."
    ),
    plan_only: bool = typer.Option(False, help="Write the plan and stop."),
    requeue: list[str] | None = typer.Option(
        None, help="With --continue: also re-run these CVEs' events (after a harness fix)."
    ),
) -> None:
    """E2: every post-EOL advisory on a line; one PR or evidence issue per CVE."""
    import time

    from heirloom import answers
    from heirloom import campaign as cmp

    if not replay:
        raise typer.BadParameter("only --replay campaigns exist (BUILD-BRIEF §10.5)")
    if line not in LINES or not LINES[line].publish:
        raise typer.BadParameter(f"{line!r} is not a publishing line")
    s = config.load()
    path = cmp.state_path(s, campaign_id) if campaign_id else None
    if path is None or not path.exists():
        path = cmp.create(s, line, cap, campaign_id)
        typer.echo(f"planned {path}")
    if cont:
        for a in answers.poll(s):
            typer.echo(f"answer {a.option} on {a.issue} -> precedent {a.precedent}")
        typer.echo(f"re-queued: {cmp.reopen(path, tuple(requeue or ()))}")
    state = json.loads(path.read_text())
    for ev in state["events"]:
        deps = ",".join(ev.get("depends_on") or []) or "-"
        typer.echo(f"  {ev['id']:34} {ev['kind']:8} deps={deps:16} {ev['status']}")
    if plan_only:
        return
    procs = cmp.spawn_workers(path, workers, s.work / cmp.STATE_DIR / state["id"])
    while any(p.poll() is None for p in procs):
        time.sleep(20)
    out = cmp.results(s, path)
    (s.root / "evals" / "results_live.json").write_text(json.dumps(out, indent=2) + "\n")
    typer.echo(json.dumps(out["summary"], indent=1))
    for q in out["summary"]["questions"]:
        typer.echo(f"QUESTION (answer with /heirloom answer <option>): {q}")


@app.command("campaign-worker", hidden=True)
def campaign_worker(path: str, name: str) -> None:
    from pathlib import Path

    from heirloom import campaign as cmp

    cmp.worker(config.load(), Path(path), name, lambda m: typer.echo(m))


@app.command("answers")
def answers_cmd(
    apply: bool = typer.Option(True, help="Record precedents and close issues."),
) -> None:
    """Poll question issues for `/heirloom answer <option>` comments; store precedents."""
    from heirloom import answers

    for a in answers.poll(config.load(), apply=apply):
        typer.echo(f"{a.issue}: {a.kind} on {a.scope} = {a.option} (@{a.author}) {a.precedent}")


@app.command()
def rerender(
    cves: list[str] = typer.Argument(..., metavar="CVE..."),
    campaign_id: str = typer.Option(..., "--id", help="The campaign whose events to replay."),
) -> None:
    """Re-render the PR or evidence-issue body of each CVE's latest campaign event in
    place, replay-only: every other stage must be a ledger cache hit (no model call, no
    commit, no push); a miss aborts that CVE before any work starts."""
    from heirloom import campaign as cmp
    from heirloom.pipeline.context import ReplayMiss

    s = config.load()
    state = json.loads(cmp.state_path(s, campaign_id).read_text())
    for cve_id in cves:
        ev = cmp._outcome(state, cve_id)
        if ev is None or cve_id in cmp.NO_MORE_PRS:
            typer.echo(f"{cve_id}: no finished event to re-render")
            continue
        spec, reuse, done_fixes, note, _ = cmp.prepare(s, state, ev)
        try:
            r = execute(
                s, cve_id, spec, reuse_probe=reuse, campaign_id=state["id"],
                archive_ref=ev["ref"], done_fixes=done_fixes, note=note, replay_only=True,
            )  # fmt: skip
        except ReplayMiss as exc:
            typer.echo(f"{cve_id}: not re-rendered ({exc})")
            continue
        typer.echo(f"{cve_id}: {r.status} {r.pr_url or r.issue_url} (run {r.run_id})")


@app.command()
def relink(
    apply: bool = typer.Option(False, help="Edit the bodies; without it, only report."),
) -> None:
    """Re-render span links in every open campaign PR and evidence issue with
    NEATLOGS_TRACE_URL, in place (same trace and span ids; no new PR or issue)."""
    import tempfile
    from pathlib import Path

    from heirloom.claims import relink as relink_body

    s = config.load()
    live = json.loads((s.root / "evals" / "results_live.json").read_text())["summary"]
    targets = [(s.fork, u, True) for u in live["prs"]]
    targets += [(s.heirloom_repo, u, False) for u in live["evidence_issues"]]
    with guard.publishing(LINES["4.2"]), tempfile.TemporaryDirectory() as tmp:
        for repo, url, is_pr in targets:
            number = int(url.rstrip("/").rsplit("/", 1)[1])
            kind = "pr" if is_pr else "issue"
            view = json.loads(github.gh(kind, "view", str(number), "--repo", repo,
                                        "--json", "state,body"))  # fmt: skip
            if view["state"] != "OPEN":
                typer.echo(f"{url}: {view['state'].lower()}, left as is")
                continue
            body, changed = relink_body(view["body"], s.neatlogs_trace_url)
            typer.echo(f"{url}: {changed} span link(s) to re-render")
            if apply and changed:
                path = Path(tmp) / f"{kind}-{number}.md"
                path.write_text(body)
                if is_pr:
                    github.edit_pr_body(repo, number, path)
                else:
                    github.edit_issue_body(repo, number, path)


@app.command()
def serve(host: str = "127.0.0.1", port: int = 8077) -> None:
    """Read-only JSON API over the ledger and evals/*.json (no UI)."""
    import uvicorn

    from heirloom.api import create_app

    uvicorn.run(create_app(config.load()), host=host, port=port, log_level="warning")


@app.command()
def export(out: str = typer.Option("site/data", help="Directory for the JSON snapshot.")) -> None:
    """Write the read API's documents as static JSON files."""
    from pathlib import Path

    from heirloom.api import export as do_export

    files = do_export(config.load(), Path(out))
    typer.echo(f"wrote {len(files)} files under {out}")


from heirloom.lines import commands as line_commands  # noqa: E402  (Thread B: distro lines)

app.add_typer(line_commands.distro_app, name="distro")
app.command("matrix")(line_commands.matrix_cmd)
app.command("new-probe")(line_commands.new_probe_cmd)


def main() -> None:
    import os

    try:
        app()
    except KeyboardInterrupt:
        sys.exit(130)
    except Exception as exc:  # no stack traces in CLI output; HEIRLOOM_DEBUG=1 shows them
        if os.environ.get("HEIRLOOM_DEBUG"):
            raise
        typer.echo(f"heirloom: error: {type(exc).__name__}: {exc}", err=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
