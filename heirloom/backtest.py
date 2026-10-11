"""E1 backtest (BUILD-BRIEF §6, §10.3): ground truth = the Django fellows' real 4.2 patches.

Cases (set ``django-4.2-2026``):
* positive: each Feb/Mar/Apr 2026 CVE the fellows fixed on 4.2. L = their 4.2 fix
  commit's parent. Truth AFFECTED, and their own 4.2 regression test must pass on
  L + our patch.
* negative (fixed twin): L = the fellows' 4.2 fix commit. Truth: not affected. It
  reuses the positive's calibrated probe, so no fixed source reaches the porter.
* extra: CVE-2025-27556, fixed upstream only on 5.1/5.0 (via upstream_fallbacks) and
  shipped without a 4.2 patch while 4.2 was supported; L = tag 4.2.20.

Pipelines: ``v2`` is the full Heirloom pipeline on a non-publishing eval line; ``v1``
is the naive baseline (cherry-pick the upstream fix, let the model resolve conflicts,
trust its own run of the upstream tests, no calibration). Results → evals/results.json.
"""

from __future__ import annotations

import json
import re
import subprocess
import time
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path
from typing import Any

from heirloom.config import Settings, runtime_line
from heirloom.git_ops import commit_diff, ensure_worktree, git, git_ok, parse_diff, rev_parse
from heirloom.ledger import Ledger
from heirloom.models.router import Budget, Router
from heirloom.pipeline.calibrate import symbols
from heirloom.pipeline.locate import changed_test_ids
from heirloom.pipeline.run import calibrated_probe, execute
from heirloom.sources.django_security import load
from heirloom.verify.runner import Runner

SET = "django-4.2-2026"
POSITIVE_DATES = (date(2026, 2, 3), date(2026, 3, 3), date(2026, 4, 7))
EXTRA = {"CVE-2025-27556": "4.2.20"}


@dataclass(frozen=True)
class Case:
    cve: str
    kind: str  # positive | negative | extra
    tip: str  # L
    truth: str  # AFFECTED | NOT_AFFECTED
    fellows_fix: str | None  # the fellows' 4.2 commit (positives/negatives)

    @property
    def line(self) -> str:
        return f"bt-{self.kind[:3]}-{self.tip[:10]}"


def cases(repo: Path) -> list[Case]:
    advisories = load(repo)
    out: list[Case] = []
    for adv in sorted(advisories.values(), key=lambda a: (a.date, a.cve)):
        if adv.date not in POSITIVE_DATES or "4.2" not in adv.commits:
            continue
        fellows = rev_parse(repo, adv.commits["4.2"][0])
        out.append(Case(adv.cve, "positive", rev_parse(repo, f"{fellows}^"), "AFFECTED", fellows))
        out.append(Case(adv.cve, "negative", fellows, "NOT_AFFECTED", fellows))
    for cve, tag in EXTRA.items():
        out.append(Case(cve, "extra", rev_parse(repo, tag), "NOT_AFFECTED", None))
    return out


def fellows_test_ids(repo: Path, fellows: str) -> tuple[list[str], list[str]]:
    """(test files, dotted ids of the test methods) the fellows' 4.2 commit adds or changes."""
    files = [
        f
        for f in git(repo, "diff", "--name-only", f"{fellows}^", fellows).split()
        if f.startswith("tests/")
    ]
    return files, changed_test_ids(repo, [fellows], files)


def fellows_test_passes(s: Settings, case: Case, patch: str, work: Path) -> tuple[bool | None, str]:
    """Run the fellows' own 4.2 regression tests on L + ``patch``."""
    assert case.fellows_fix is not None
    files, ids = fellows_test_ids(s.django_repo, case.fellows_fix)
    if not ids:
        return None, "fellows' commit adds no test methods"
    tree = ensure_worktree(s.django_repo, work / "fellows-check", case.tip)
    for text, what in (
        (patch, "our patch"),
        (commit_diff(s.django_repo, case.fellows_fix, *files, context=3), "fellows' tests"),
    ):
        if not text.strip():
            continue
        proc = subprocess.run(
            ["git", "-C", str(tree), "apply", "--3way", "-"],
            input=text,
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            return False, f"{what} does not apply: {proc.stderr.strip()[:200]}"
    gis = any(f.startswith("tests/gis_tests/") for f in files)
    r = Runner(
        python=s.test_python,
        timeout=s.test_timeout,
        settings_module="test_postgis" if gis else None,
    ).run(tree, ids, log_path=work / "fellows-check.log")
    return r.outcome == "PASS", f"{r.outcome} {r.summary} ({len(ids)} tests)"


def _latest_output(ledger: Ledger, cve: str, line: str, stage: str) -> dict[str, Any] | None:
    rows = [r for r in ledger.stages(cve, line) if r.key.stage == stage and r.status == "done"]
    return max(rows, key=lambda r: r.key.attempt).output if rows else None


def run_v2(s: Settings, case: Case) -> dict[str, Any]:
    spec = runtime_line(case.line, case.tip, "eval")
    reuse: dict[str, Any] | None = None
    if case.kind == "negative":
        ledger = Ledger(s.ledger_path)
        positive_line = next(
            (c.line for c in cases(s.django_repo) if c.cve == case.cve and c.kind == "positive"),
            None,
        )
        reuse = calibrated_probe(ledger, case.cve, positive_line) if positive_line else None
        ledger.close()
        if reuse is None:
            return {
                "verdict": "SKIPPED",
                "reason": "NO_CALIBRATED_PROBE",
                "message": "the positive case has no calibrated probe to reuse",
                "escalated": False,
                "cost_usd": 0.0,
                "cost_unknown": False,
                "minutes": 0.0,
            }
    start = time.monotonic()
    result = execute(s, case.cve, spec, reuse_probe=reuse)
    minutes = (time.monotonic() - start) / 60
    ledger = Ledger(s.ledger_path)
    rows = ledger.stages(case.cve, case.line)
    decide = _latest_output(ledger, case.cve, case.line, "decide") or {}
    adapt = _latest_output(ledger, case.cve, case.line, "adapt")
    cost_unknown = any(
        r.key.stage == "adapt" and r.status == "failed" and "interrupted" in (r.error or "")
        for r in rows
    )
    ledger.close()
    out: dict[str, Any] = {
        "verdict": result.verdict,
        "reason": result.reason,
        "status": result.status,
        "run_id": result.run_id,
        "escalated": decide.get("decision") in ("would_ask", "waiting_human"),
        "decision": decide.get("decision"),
        "reused_probe": reuse is not None,
        "cost_usd": round(result.cost_usd, 4),
        "cost_unknown": cost_unknown,
        "minutes": round(minutes, 2),
        "message": result.message,
    }
    if case.kind == "positive" and result.verdict == "AFFECTED" and adapt:
        ok, detail = fellows_test_passes(s, case, adapt["patch"], s.cve_dir(case.cve, case.line))
        out["fellows_test_passes"], out["fellows_test_detail"] = ok, detail
    return out


# v1: naive baseline ---------------------------------------------------------------

V1_PROMPT = """Resolve the git merge conflict in this file from cherry-picking an upstream \
Django security fix onto an older release. Keep the older release's code and apply the \
fix's intent. Reply with ONLY the complete resolved file in one ```python fenced block.

File: {path}
```
{text}
```"""


def run_v1(s: Settings, case: Case, budget_usd: float) -> dict[str, Any]:
    """Cherry-pick the upstream fix; the model resolves conflicts; trust upstream tests."""
    start = time.monotonic()
    work = s.cve_dir(case.cve, f"v1-{case.line}")
    tree = ensure_worktree(s.django_repo, work / "tree", case.tip)
    adv = load(s.django_repo)[case.cve]
    series = adv.first_series(("5.2", "5.1", "5.0"))
    fixes = adv.fix_commits(series)
    spent = 0.0
    router = Router(s, Budget(budget_usd, lambda: spent))
    conflicts: list[str] = []
    for sha in fixes:
        proc = subprocess.run(
            ["git", "-C", str(tree), "cherry-pick", "-n", "-X", "patience", sha],
            capture_output=True,
            text=True,
        )
        if proc.returncode == 0:
            continue
        for path in git(tree, "diff", "--name-only", "--diff-filter=U").split():
            conflicts.append(path)
            if not path.endswith(".py") or not (tree / path).exists():
                # Release notes etc. (or files 4.2 never had): keep 4.2's side, or drop.
                if not git_ok(tree, "checkout", "--ours", "--", path):
                    git(tree, "rm", "-q", "-f", "--", path, check=False)
                continue
            text = (tree / path).read_text()
            res = router.complete(
                s.adapt_model,
                [{"role": "user", "content": V1_PROMPT.format(path=path, text=text[:150_000])}],
                max_tokens=16000,
            )
            spent += res.cost_usd
            m = re.search(r"```(?:python)?\n(.*?)```", res.text, re.S)
            if m:
                (tree / path).write_text(m[1])
            git(tree, "add", "--", path)
    patch = git(tree, "diff", "HEAD", "--", "django/")
    files = [f for f in git(tree, "diff", "--name-only", "HEAD").split() if f.startswith("tests/")]
    up_ids: list[str] = []
    for d in parse_diff(git(tree, "diff", "-U0", "HEAD", "--", *files)) if files else []:
        added = {
            m[1]
            for h in d.hunks
            for line in h.added
            if (m := re.match(r"\s*def (test\w*)\(", line))
        }
        module = (d.new_path or "").removeprefix("tests/").removesuffix(".py").replace("/", ".")
        src = (tree / (d.new_path or "")).read_text() if d.new_path else ""
        up_ids += [
            f"{module}.{x.qualname}"
            for x in symbols(src)
            if "." in x.qualname and x.qualname.rsplit(".", 1)[-1] in added
        ]
    own = None
    if up_ids:
        r = Runner(python=s.test_python, timeout=s.test_timeout).run(
            tree, sorted(set(up_ids)), log_path=work / "v1-upstream-tests.log"
        )
        own = r.outcome
    verdict = "AFFECTED" if patch.strip() else "NOT_AFFECTED"
    out: dict[str, Any] = {
        "verdict": verdict,
        "reason": "NONE",
        "own_upstream_tests": own,
        "conflicts": conflicts,
        "escalated": False,
        "cost_usd": round(spent, 4),
        "cost_unknown": False,
        "minutes": round((time.monotonic() - start) / 60, 2),
    }
    if case.kind == "positive" and patch.strip():
        ok, detail = fellows_test_passes(s, case, patch, work)
        out["fellows_test_passes"], out["fellows_test_detail"] = ok, detail
    return out


# Results ---------------------------------------------------------------------------


def correct(case: Case, verdict: str) -> bool | None:
    if verdict == "UNPROVEN" or verdict == "SKIPPED":
        return None
    if case.truth == "AFFECTED":
        return verdict == "AFFECTED"
    return verdict == "NOT_AFFECTED_PROVEN" or verdict == "NOT_AFFECTED"


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    decided = [r for r in rows if r["correct"] is not None]
    pos = [r for r in rows if r["kind"] == "positive"]
    known_cost = [r["cost_usd"] for r in rows if not r.get("cost_unknown")]
    return {
        "cases": len(rows),
        "decided": len(decided),
        "verdict_accuracy": round(sum(r["correct"] for r in decided) / len(decided), 3)
        if decided
        else None,
        "false_not_affected": sum(
            1
            for r in rows
            if r["truth"] == "AFFECTED" and r["verdict"] in ("NOT_AFFECTED_PROVEN", "NOT_AFFECTED")
        ),
        "false_affected": sum(
            1 for r in rows if r["truth"] == "NOT_AFFECTED" and r["verdict"] == "AFFECTED"
        ),
        "unproven": sum(1 for r in rows if r["verdict"] == "UNPROVEN"),
        "escalation_rate": round(sum(bool(r.get("escalated")) for r in rows) / len(rows), 3)
        if rows
        else None,
        "fellows_test_pass": f"{sum(1 for r in pos if r.get('fellows_test_passes'))}/{len(pos)}",
        "usd_per_case": round(sum(known_cost) / len(known_cost), 4) if known_cost else None,
        "usd_total": round(sum(known_cost), 4),
        "cost_unknown_cases": sum(1 for r in rows if r.get("cost_unknown")),
        "minutes_per_case": round(sum(r["minutes"] for r in rows if "minutes" in r) / len(rows), 2)
        if rows
        else None,
    }


def record(path: Path, pipeline: str, case: Case, result: dict[str, Any]) -> dict[str, Any]:
    data: dict[str, Any] = (
        json.loads(path.read_text()) if path.exists() else {"set": SET, "runs": {}}
    )
    row = {**asdict(case), "line": case.line, "pipeline": pipeline, **result}
    row["correct"] = correct(case, result["verdict"])
    row["at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    runs = data.setdefault("runs", {}).setdefault(pipeline, {})
    runs[f"{case.cve}:{case.kind}"] = row
    data["summary"] = {p: summarize(list(r.values())) for p, r in data["runs"].items()}
    path.write_text(json.dumps(data, indent=2, default=str) + "\n")
    return row
