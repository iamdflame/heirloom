"""Render the E1 backtest table in README.md from evals/results.json (numbers only from runs).

    python evals/render_readme.py

Rewrites only the block between <!-- e1:start --> and <!-- e1:end -->.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
RESULTS = ROOT / "evals" / "results.json"
README = ROOT / "README.md"
START, END = "<!-- e1:start -->", "<!-- e1:end -->"
LABELS = {
    "v2": "v2 · Heirloom (calibrated)",
    "v1": "v1 · naive (cherry-pick + LLM, no calibration)",
}


def pct(x: float | None) -> str:
    return "n/a" if x is None else f"{100 * x:.0f}%"


def table(data: dict[str, Any]) -> str:
    rows = [
        "| Pipeline | Cases | Verdict accuracy (decided) | False NOT_AFFECTED | "
        "False AFFECTED | UNPROVEN | Fellows' 4.2 test passes | Escalation rate | "
        "$ / case | Min / case |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for name in ("v2", "v1"):
        s = data.get("summary", {}).get(name)
        if not s:
            continue
        usd = "n/a" if s["usd_per_case"] is None else f"${s['usd_per_case']:.2f}"
        unknown = f" (+{s['cost_unknown_cases']} unknown)" if s["cost_unknown_cases"] else ""
        rows.append(
            f"| {LABELS[name]} | {s['cases']} | {pct(s['verdict_accuracy'])} "
            f"({s['decided']} decided) | **{s['false_not_affected']}** | "
            f"{s['false_affected']} | {s['unproven']} | {s['fellows_test_pass']} | "
            f"{pct(s['escalation_rate'])} | {usd}{unknown} | {s['minutes_per_case']} |"
        )
    per_case = [
        "",
        "<details><summary>Per case</summary>",
        "",
        "| CVE | Case | Truth | v2 verdict | v2 fellows' test | v1 verdict | v1 fellows' test |",
        "|---|---|---|---|---|---|---|",
    ]
    runs = data.get("runs", {})
    keys = sorted(set(runs.get("v2", {})) | set(runs.get("v1", {})))
    for k in keys:
        a, b = runs.get("v2", {}).get(k, {}), runs.get("v1", {}).get(k, {})
        base = a or b
        reason = f" ({a['reason']})" if a.get("reason") not in (None, "NONE") else ""
        per_case.append(
            f"| {base['cve']} | {base['kind']} | {base['truth']} | "
            f"{a.get('verdict', '—')}{reason} | "
            f"{a.get('fellows_test_passes', '—')} | {b.get('verdict', '—')} | "
            f"{b.get('fellows_test_passes', '—')} |"
        )
    per_case += ["", "</details>"]
    note = (
        f"\n_Set `{data.get('set')}`; rendered from [`evals/results.json`](evals/results.json) "
        "by `evals/render_readme.py`. Accuracy counts only decided cases; UNPROVEN means "
        "Heirloom declined to claim either way and would ask a human._"
    )
    return "\n".join(rows) + note + "\n" + "\n".join(per_case)


def main() -> int:
    data = json.loads(RESULTS.read_text())
    text = README.read_text()
    block = f"{START}\n{table(data)}\n{END}"
    if START in text and END in text:
        head, rest = text.split(START, 1)
        _, tail = rest.split(END, 1)
        text = head + block + tail
    else:
        text = text.rstrip() + "\n\n## E1 backtest: Django 4.2, 2026 CVEs\n\n" + block + "\n"
    README.write_text(text)
    print(f"rendered {README}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
