"""CLI for distro lines and the line × CVE matrix (registered in heirloom.cli)."""

from __future__ import annotations

from typing import Annotated

import typer

from heirloom import config
from heirloom.lines import distro

DISTRO_RECORD = config.ROOT / "evals" / "distro_lines.json"

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
