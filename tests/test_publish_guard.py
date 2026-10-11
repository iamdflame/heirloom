"""Eval and distro lines can never open an issue or PR, or push (BUILD-BRIEF §10.2)."""

import subprocess
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

from heirloom import config, guard
from heirloom.config import LINES, LineSpec, runtime_line
from heirloom.git_ops import push
from heirloom.integrations import github
from heirloom.integrations.neatlogs import Telemetry
from heirloom.ledger import Ledger
from heirloom.pipeline import (
    adapt,
    behaviour,
    calibrate,
    decide,
    locate,
    probe,
    publish,
    run,
    verify,
)
from heirloom.pipeline.context import Ctx

TIP = "3396992e837d5146270ea8112bb622c83fa4a919"
NON_PUBLISHING = [
    runtime_line("eval-4.2.30", TIP, "eval"),
    runtime_line("ubuntu-noble", TIP, "distro"),
]


@pytest.fixture
def no_subprocess(monkeypatch: pytest.MonkeyPatch) -> list[list[str]]:
    """Record (and refuse) any subprocess a guarded writer might start."""
    calls: list[list[str]] = []

    def fake_run(cmd: list[str], *args: Any, **kwargs: Any) -> subprocess.CompletedProcess[str]:
        calls.append(list(cmd))
        return subprocess.CompletedProcess(cmd, 0, "https://github.com/o/r/pull/1\n", "")

    monkeypatch.setattr(subprocess, "run", fake_run)
    return calls


def writers(tmp_path: Path) -> list[Callable[[], object]]:
    body = tmp_path / "body.md"
    body.write_text("x")
    return [
        lambda: github.create_pr("iamdflame/django", "stable/4.2.x-heirloom", "b", "t", body),
        lambda: github.edit_pr_body("iamdflame/django", 1, body),
        lambda: github.close_pr("iamdflame/django", 1, "c"),
        lambda: github.create_issue("iamdflame/heirloom", "t", body),
        lambda: push(tmp_path, "fork", "HEAD:refs/heads/x"),
        lambda: push(tmp_path, "origin", "--delete", "x"),
    ]


@pytest.mark.parametrize("kind", ["eval", "distro"])
def test_non_release_lines_cannot_be_declared_publishing(kind: str) -> None:
    with pytest.raises(ValueError, match="can never publish"):
        LineSpec(name="x", tip=TIP, upstream="5.2", base_branch="b", kind=kind, publish=True)  # type: ignore[arg-type]
    assert runtime_line("x", TIP, kind).publish is False  # type: ignore[arg-type]


def test_runtime_lines_are_never_release_lines() -> None:
    with pytest.raises(ValueError):
        runtime_line("x", TIP, "release")


@pytest.mark.parametrize("spec", NON_PUBLISHING, ids=lambda s: s.kind)
def test_every_writer_refuses_on_non_publishing_lines(
    spec: LineSpec, tmp_path: Path, no_subprocess: list[list[str]]
) -> None:
    with guard.publishing(spec):
        for write in writers(tmp_path):
            with pytest.raises(guard.PublishForbidden):
                write()
    assert no_subprocess == []


def test_writers_refuse_outside_any_line(tmp_path: Path, no_subprocess: list[list[str]]) -> None:
    for write in writers(tmp_path):
        with pytest.raises(guard.PublishForbidden):
            write()
    assert no_subprocess == []


def test_release_line_may_publish(tmp_path: Path, no_subprocess: list[list[str]]) -> None:
    with guard.publishing(LINES["4.2"]):
        for write in writers(tmp_path):
            write()
    assert len(no_subprocess) == 6
    assert not guard.allowed()  # the permission ends with the context


# The whole pipeline on a non-publishing line ------------------------------------

LOC: dict[str, Any] = {
    "fix": "f" * 40,
    "um": "e" * 40,
    "tip": TIP,
    "base": TIP,
    "subject": "[5.2.x] Fixed CVE-X -- y",
    "message": "Fixed CVE-X",
    "upstream_test_ids": [],
    "test_files": [],
    "fix_files": [],
}
AFFECTED: dict[str, Any] = {
    "verdict": "AFFECTED",
    "reason": None,
    "calibrated": True,
    "detail": "",
    "gates": {},
}


def make_ctx(tmp_path: Path, spec: LineSpec) -> Ctx:
    s = config.load()
    s = config.Settings(**{**s.__dict__, "work": tmp_path})
    return Ctx(s, Ledger(tmp_path / "l.sqlite"), Telemetry(), spec, "CVE-X", spec.name, "r1")


@pytest.mark.parametrize("spec", NON_PUBLISHING, ids=lambda s: s.kind)
def test_pipeline_on_non_publishing_line_stops_before_publish(
    spec: LineSpec, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, no_subprocess: list[list[str]]
) -> None:
    def forbidden(*a: Any, **k: Any) -> Any:
        raise AssertionError("publish stage reached on a non-publishing line")

    monkeypatch.setattr(locate, "run", lambda ctx: LOC)
    monkeypatch.setattr(calibrate, "run_c0", lambda ctx, loc: {"structural": False})
    monkeypatch.setattr(
        probe, "run", lambda ctx, loc, c0, fb, model=None: {"sha": "p", "files": {}}
    )
    monkeypatch.setattr(calibrate, "run", lambda ctx, loc, pr: {"feedback": None})
    monkeypatch.setattr(calibrate, "run_presence", lambda ctx, cal: AFFECTED)
    monkeypatch.setattr(adapt, "run", lambda *a: {"patch_sha": "x", "patch": ""})
    monkeypatch.setattr(verify, "run", lambda *a: {"ok": True})
    monkeypatch.setattr(behaviour, "run", lambda *a: {"same": True, "kind": ""})
    for name in ("commit", "push", "artifacts", "pr"):
        monkeypatch.setattr(publish, name, forbidden)
    monkeypatch.setattr(decide, "ask", forbidden)

    ctx = make_ctx(tmp_path, spec)
    with guard.publishing(spec):
        result = run.pipeline(ctx)
    assert result.status == "evaluated"
    assert result.verdict == "AFFECTED"
    assert no_subprocess == []


@pytest.mark.parametrize("spec", NON_PUBLISHING, ids=lambda s: s.kind)
def test_decide_records_would_ask_instead_of_opening_an_issue(
    spec: LineSpec, tmp_path: Path, no_subprocess: list[list[str]]
) -> None:
    ctx = make_ctx(tmp_path, spec)
    unproven = {"verdict": "UNPROVEN", "reason": "ENV_SKIP", "detail": "", "gates": {}}
    with guard.publishing(spec):
        out = decide.run(ctx, unproven, None, None)
    assert out["decision"] == "would_ask"
    assert out["kind"] == "ENV_SKIP"
    assert no_subprocess == []


def test_reuse_mode_skips_the_porter_and_never_retries(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, no_subprocess: list[list[str]]
) -> None:
    spec = NON_PUBLISHING[0]
    calls: list[str] = []

    def porter(*a: Any) -> Any:
        raise AssertionError("porter called in reuse mode")

    def cal_run(ctx: Ctx, loc: dict[str, Any], pr: dict[str, Any]) -> dict[str, Any]:
        calls.append(pr["sha"])
        return {"feedback": "probe ERRORs on L"}  # would trigger a retry in normal mode

    monkeypatch.setattr(locate, "run", lambda ctx: LOC)
    monkeypatch.setattr(calibrate, "run_c0", lambda ctx, loc: {"structural": False})
    monkeypatch.setattr(probe, "run", porter)
    monkeypatch.setattr(calibrate, "run", cal_run)
    unproven = {"verdict": "UNPROVEN", "reason": "PROBE_ERROR", "detail": "", "gates": {}}
    monkeypatch.setattr(calibrate, "run_presence", lambda ctx, cal: unproven)
    ctx = make_ctx(tmp_path, spec)
    with guard.publishing(spec):
        result = run.pipeline(ctx, reuse_probe={"sha": "calibrated", "files": {}})
    assert calls == ["calibrated"]
    assert (result.status, result.verdict, result.reason) == (
        "evaluated",
        "UNPROVEN",
        "PROBE_ERROR",
    )


def test_an_invalid_cheap_probe_escalates_to_the_stronger_model(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, no_subprocess: list[list[str]]
) -> None:
    from heirloom.pipeline.context import StageFailed

    spec = NON_PUBLISHING[0]
    models: list[str | None] = []

    def porter(ctx: Ctx, loc: Any, c0: Any, fb: Any, model: str | None = None) -> Any:
        models.append(model)
        if len(models) == 1:
            raise StageFailed("porter produced no valid probe: ['tests.py:4: unexpected import']")
        return {"sha": "p", "files": {}}

    monkeypatch.setattr(locate, "run", lambda ctx: LOC)
    monkeypatch.setattr(calibrate, "run_c0", lambda ctx, loc: {"structural": False})
    monkeypatch.setattr(probe, "run", porter)
    monkeypatch.setattr(calibrate, "run", lambda ctx, loc, pr: {"feedback": None})
    unproven = {"verdict": "UNPROVEN", "reason": "NO_REACH", "detail": "", "gates": {}}
    monkeypatch.setattr(calibrate, "run_presence", lambda ctx, cal: unproven)
    ctx = make_ctx(tmp_path, spec)
    with guard.publishing(spec):
        run.pipeline(ctx)
    assert models == [ctx.s.porter_first_model, ctx.s.probe_model]
