"""Export the campaign facts the README needs that results_live.json does not carry.

    uv run python evals/export_campaign_evidence.py

Reads the local ledger (work/ledger.sqlite), policy/precedents.json and
evals/results_live.json; writes evals/campaign_evidence.json:

- ``fail_to_pass``: for every PR in results_live, the latest finished VERIFY stage's
  probe outcomes before and after the fix (FAIL→PASS when the backport works);
- ``questions``: every question issue opened by the campaign's CVEs on its line
  (decide.question stages since the campaign started), with the CVEs that waited on it;
- ``precedents``: stored answers, and the CVEs whose DECIDE applied each one.
"""

from __future__ import annotations

import json
import sqlite3
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
LIVE = ROOT / "evals" / "results_live.json"
LEDGER = ROOT / "work" / "ledger.sqlite"
PRECEDENTS = ROOT / "policy" / "precedents.json"
OUT = ROOT / "evals" / "campaign_evidence.json"


def iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def main() -> int:
    live = json.loads(LIVE.read_text())
    line = live["line"]
    since = datetime.strptime(live["created_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)
    db = sqlite3.connect(LEDGER)
    db.row_factory = sqlite3.Row
    cves = sorted(live["per_cve"])

    fail_to_pass = []
    for cve, rec in sorted(live["per_cve"].items()):
        if "/pull/" not in rec.get("link", ""):
            continue
        row = db.execute(
            "SELECT run_id, trace_id, output_json FROM stages WHERE cve=? AND line=? "
            "AND stage='verify' AND status='done' ORDER BY started_at DESC LIMIT 1",
            (cve, line),
        ).fetchone()
        out = json.loads(row["output_json"]) if row else {}
        fail_to_pass.append(
            {
                "cve": cve,
                "pr": rec["link"],
                "run_id": row["run_id"] if row else None,
                "trace_id": row["trace_id"] if row else None,
                "probe_before": out.get("probe_before"),
                "probe_after": out.get("probe_after"),
                "verify_ok": bool(out.get("ok")),
                "fail_to_pass": set(out.get("probe_before") or ["?"]) == {"FAIL"}
                and set(out.get("probe_after") or ["?"]) == {"PASS"},
            }
        )

    marks = ",".join("?" * len(cves))
    questions: dict[str, dict[str, Any]] = {}
    for r in db.execute(
        f"SELECT cve, run_id, trace_id, span_id, started_at, output_json FROM stages "
        f"WHERE stage='decide.question' AND status='done' AND line=? AND cve IN ({marks}) "
        "AND started_at >= ? ORDER BY started_at, rowid",
        (line, *cves, since.timestamp()),
    ):
        url = json.loads(r["output_json"] or "{}").get("url", "")
        q = questions.setdefault(
            url,
            {
                "issue": url,
                "asked_by": r["cve"],
                "asking_trace": r["trace_id"],
                "asking_span": r["span_id"],
                "asked_at": iso(r["started_at"]),
                "waited": [],
            },
        )
        if r["cve"] != q["asked_by"] and r["cve"] not in q["waited"]:
            q["waited"].append(r["cve"])

    precedents = []
    for p in json.loads(PRECEDENTS.read_text()):
        applied = []
        for r in db.execute(
            f"SELECT cve, run_id, trace_id, output_json FROM stages WHERE stage='decide' "
            f"AND status='done' AND line=? AND cve IN ({marks}) ORDER BY started_at, rowid",
            (line, *cves),
        ):
            out = json.loads(r["output_json"] or "{}")
            if (out.get("precedent") or {}).get("id") == p["id"] and not out.get("asked"):
                applied.append(
                    {
                        "cve": r["cve"],
                        "run_id": r["run_id"],
                        "trace_id": r["trace_id"],
                        "decision": out.get("decision"),
                        "pr": live["per_cve"][r["cve"]].get("link", ""),
                    }
                )
        precedents.append(
            {
                "id": p["id"],
                "kind": p["kind"],
                "scope": p["scope"],
                "answer": p["answer"],
                "issue": p["issue_url"],
                "stored_at": iso(p["created_at"]),
                "applied_by": applied,
            }
        )

    doc = {
        "campaign": live["campaign"],
        "line": line,
        "source": "work/ledger.sqlite + policy/precedents.json + evals/results_live.json",
        "fail_to_pass": fail_to_pass,
        "questions": list(questions.values()),
        "precedents": precedents,
    }
    OUT.write_text(json.dumps(doc, indent=2) + "\n")
    print(f"wrote {OUT}: {len(fail_to_pass)} PRs, {len(questions)} question(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
