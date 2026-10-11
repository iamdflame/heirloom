"""Settings from the environment (``.env`` via python-dotenv). Secrets never leave here."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class LineSpec:
    """A target release line: its tip on the fork and the upstream branch whose fix we port."""

    name: str
    tip: str  # last upstream release of the line
    upstream: str  # branch label in security.txt whose fix commit we use
    base_branch: str  # fork branch PRs target
    test_labels: dict[str, tuple[str, ...]] = field(default_factory=dict)


LINES: dict[str, LineSpec] = {
    "4.2": LineSpec(
        name="4.2",
        tip="3396992e837d5146270ea8112bb622c83fa4a919",  # tag 4.2.30
        upstream="5.2",
        base_branch="stable/4.2.x-heirloom",
        # Extra regression labels per touched module, on top of the upstream test labels.
        test_labels={
            "django/forms/models.py": ("model_forms", "model_formsets", "inline_formsets"),
            "django/utils/translation/": ("i18n",),
        },
    )
}


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
