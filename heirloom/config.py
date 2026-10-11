"""Settings from the environment (``.env`` via python-dotenv). Secrets never leave here."""

from __future__ import annotations

import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent


LineKind = Literal["release", "eval", "distro"]


@dataclass(frozen=True)
class LineSpec:
    """A target line: a tip commit plus where its upstream fixes come from.

    ``kind`` is ``release`` (the fork's maintained line), ``eval`` (backtest trees)
    or ``distro`` (a distribution's patched tree). Only release lines may publish;
    constructing an eval or distro line with ``publish=True`` is an error.
    """

    name: str
    tip: str  # commit-ish of the line's tip
    upstream: str  # preferred security.txt branch series whose fix we port
    base_branch: str | None = None  # fork branch PRs target (publishing lines only)
    kind: LineKind = "release"
    publish: bool = False
    upstream_fallbacks: tuple[str, ...] = ()
    # Extra regression labels per touched module, on top of the upstream test labels.
    test_labels: dict[str, tuple[str, ...]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.kind not in ("release", "eval", "distro"):
            raise ValueError(f"unknown line kind {self.kind!r}")
        if self.publish and self.kind != "release":
            raise ValueError(f"{self.kind} line {self.name!r} can never publish")
        if self.publish and not self.base_branch:
            raise ValueError(f"publishing line {self.name!r} needs a base_branch")

    @property
    def upstreams(self) -> tuple[str, ...]:
        return tuple(dict.fromkeys((self.upstream, *self.upstream_fallbacks)))

    def to_json(self) -> dict[str, Any]:
        d = asdict(self)
        d["upstream_fallbacks"] = list(self.upstream_fallbacks)
        d["test_labels"] = {k: list(v) for k, v in self.test_labels.items()}
        return d

    @classmethod
    def from_json(cls, d: dict[str, Any]) -> LineSpec:
        return cls(
            **{
                **d,
                "upstream_fallbacks": tuple(d.get("upstream_fallbacks", ())),
                "test_labels": {k: tuple(v) for k, v in d.get("test_labels", {}).items()},
            }
        )


DJANGO_42_LABELS: dict[str, tuple[str, ...]] = {
    "django/forms/models.py": ("model_forms", "model_formsets", "inline_formsets"),
    "django/utils/translation/": ("i18n",),
}

LINES: dict[str, LineSpec] = {
    "4.2": LineSpec(
        name="4.2",
        tip="3396992e837d5146270ea8112bb622c83fa4a919",  # tag 4.2.30
        upstream="5.2",
        upstream_fallbacks=("5.1", "5.0"),
        base_branch="stable/4.2.x-heirloom",
        kind="release",
        publish=True,
        test_labels=DJANGO_42_LABELS,
    )
}


def runtime_line(name: str, tip: str, kind: LineKind, *, like: str = "4.2") -> LineSpec:
    """A non-publishing line built at runtime (backtest trees, distro trees)."""
    if kind == "release":
        raise ValueError("runtime lines are eval or distro lines; release lines live in LINES")
    base = LINES[like]
    return LineSpec(
        name=name,
        tip=tip,
        upstream=base.upstream,
        upstream_fallbacks=base.upstream_fallbacks,
        kind=kind,
        publish=False,
        test_labels=base.test_labels,
    )


@dataclass(frozen=True)
class Settings:
    root: Path
    work: Path
    django_repo: Path
    test_python: Path
    fork: str  # owner/repo
    fork_remote: str
    heirloom_repo: str  # owner/repo of this project (artifacts branch, questions)
    artifacts_branch: str
    litellm_base: str
    litellm_key: str
    openrouter_key: str
    max_usd_per_cve: float
    neatlogs_api_key: str
    neatlogs_service_token: str
    neatlogs_project_id: str
    neatlogs_trace_url: str
    probe_model: str
    reading_model: str
    adapt_model: str
    test_timeout: float

    @property
    def ledger_path(self) -> Path:
        return self.work / "ledger.sqlite"

    def cve_dir(self, cve: str, line: str) -> Path:
        return self.work / "cve" / f"{cve}-{line}"

    def secrets(self) -> list[str]:
        values = [
            self.litellm_key,
            self.openrouter_key,
            self.neatlogs_api_key,
            self.neatlogs_service_token,
        ]
        return [v for v in values if len(v) >= 8]


def load(env_file: Path | None = None) -> Settings:
    load_dotenv(env_file or ROOT / ".env", override=False)
    e = os.environ.get
    work = Path(e("HEIRLOOM_WORK", str(ROOT / "work")))
    return Settings(
        root=ROOT,
        work=work,
        django_repo=Path(e("HEIRLOOM_DJANGO_REPO", str(Path.home() / "work" / "django"))),
        test_python=Path(e("HEIRLOOM_TEST_PYTHON", str(work / "venv-django" / "bin" / "python"))),
        fork=e("HEIRLOOM_FORK", "iamdflame/django") or "iamdflame/django",
        fork_remote=e("HEIRLOOM_FORK_REMOTE", "fork") or "fork",
        heirloom_repo=e("HEIRLOOM_REPO", "iamdflame/heirloom") or "iamdflame/heirloom",
        artifacts_branch=e("HEIRLOOM_ARTIFACTS_BRANCH", "artifacts") or "artifacts",
        litellm_base=e("LITELLM_BASE_URL", "https://litellm.vision.aivar.app/v1") or "",
        litellm_key=e("LITELLM_API_KEY", "") or "",
        openrouter_key=e("OPENROUTER_API_KEY", "") or "",
        max_usd_per_cve=float(e("HEIRLOOM_MAX_USD_PER_CVE", "1.50") or "1.50"),
        neatlogs_api_key=e("NEATLOGS_API_KEY", "") or "",
        neatlogs_service_token=e("NEATLOGS_SERVICE_TOKEN", "") or "",
        neatlogs_project_id=e("NEATLOGS_PROJECT_ID", "") or "",
        # The app does not document deep links; override once confirmed in the UI.
        neatlogs_trace_url=e(
            "NEATLOGS_TRACE_URL", "https://app.neatlogs.com/traces/{trace_id}?span={span_id}"
        )
        or "",
        probe_model=e("HEIRLOOM_PROBE_MODEL", "claude-sonnet-4.6") or "claude-sonnet-4.6",
        reading_model=e("HEIRLOOM_READING_MODEL", "claude-haiku") or "claude-haiku",
        adapt_model=e("HEIRLOOM_ADAPT_MODEL", "claude-sonnet-4.6") or "claude-sonnet-4.6",
        test_timeout=float(e("HEIRLOOM_TEST_TIMEOUT", "900") or "900"),
    )
