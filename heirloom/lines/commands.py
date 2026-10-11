"""CLI for distro lines and the line × CVE matrix (registered in heirloom.cli)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated

import typer

from heirloom import config
from heirloom.lines import distro, matrix

DISTRO_RECORD = config.ROOT / "evals" / "distro_lines.json"
MATRIX_OUT = config.ROOT / "evals" / "matrix.json"

distro_app = typer.Typer(add_completion=False, no_args_is_help=True, help="Distro lines.")


@distro_app.command("build")
def distro_build(names: Annotated[list[str], typer.Argument(metavar="NAME...")]) -> None:
    """Build distro/<NAME> in the Django clone and record it in evals/distro_lines.json."""
    s = config.load()
    for name in names:
        if name not in distro.DISTROS:
            raise typer.BadParameter(f"unknown distro line {name!r}; known: {list(distro.DISTROS)}")
    for name in names:
        rec = distro.build(s.django_repo, s.work, distro.DISTROS[name])
        distro.write_record(DISTRO_RECORD, rec)
        typer.echo(
            f"{name}: {len(rec.patches)} patch commits on {rec.upstream_tag}, tip {rec.tip}, "
            f"orig diff django/: {len(rec.orig_diff_django)} entries"
        )


def _split(text: str) -> list[str]:
    return [x.strip() for x in text.split(",") if x.strip()]


def matrix_cmd(
    lines: Annotated[str, typer.Option(help="Comma-separated: tags (eval lines) or distro names.")],
    cves: Annotated[str, typer.Option(help="Comma-separated CVEs (default: 2026 ones).")] = "",
    ledger: Annotated[
        list[Path] | None, typer.Option(help="Another ledger to reuse probes from (read-only).")
    ] = None,
    out: Annotated[Path, typer.Option(help="Where to write the matrix JSON.")] = MATRIX_OUT,
) -> None:
    """PRESENCE for lines × CVEs with each CVE's calibrated probe (no model calls)."""
    s = config.load()
    specs = [matrix.line_spec(s, name, DISTRO_RECORD) for name in _split(lines)]
    wanted = _split(cves) or matrix.default_cves(s)
    ledgers = [s.ledger_path, *(ledger or [])]
    result = matrix.run_matrix(s, specs, wanted, ledgers, log=typer.echo)
    out.write_text(json.dumps(result, indent=2) + "\n")
    typer.echo(f"wrote {out}: {json.dumps(result['summary']['verdicts_by_line'])}")
