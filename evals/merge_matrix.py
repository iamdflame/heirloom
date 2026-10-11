"""Merge per-line ``heirloom matrix`` outputs into evals/matrix.json.

    python evals/merge_matrix.py OUT PREVIOUS PART [PART ...]

Each PART is one ``heirloom matrix`` run (B4 ran one process per line). Cells for
CVEs the parts did not cover are carried over from PREVIOUS unchanged and labelled
``carried_from`` with that run's timestamp, since they were measured earlier (and
before coverage traced threads); every other cell comes from the parts.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from typing import Any

from heirloom.config import runtime_line
from heirloom.lines.matrix import summarize


def main(out: Path, previous: Path, parts: list[Path]) -> None:
    runs = [json.loads(p.read_text()) for p in parts]
    prev: dict[str, Any] = json.loads(previous.read_text()) if previous.exists() else {}
    cells = [c for r in runs for c in r["cells"]]
    covered = {c["cve"] for c in cells}
    carried = [
        {**c, "carried_from": prev.get("generated_at")}
        for c in prev.get("cells", [])
        if c["cve"] not in covered
    ]
    lines: dict[str, Any] = {**prev.get("lines", {})}
    for r in runs:
        lines.update(r["lines"])
    specs = [runtime_line(name, d["tip"], d["kind"]) for name, d in lines.items()]
    probes = {**prev.get("probes", {})}
    for r in runs:
        probes.update(r["probes"])
    all_cells = cells + carried
    order = {name: i for i, name in enumerate(lines)}
    all_cells.sort(key=lambda c: (c["cve"], order.get(c["line"], 99)))
    merged = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "parts": [{"generated_at": r["generated_at"], "lines": list(r["lines"])} for r in runs],
        "carried_from": prev.get("generated_at") if carried else None,
        "django_repo": runs[0]["django_repo"],
        "ledger": runs[0]["ledger"],
        "probe_ledgers": sorted({p for r in runs for p in r["probe_ledgers"]}),
        "lines": lines,
        "cves": sorted({c["cve"] for c in all_cells}),
        "probes": probes,
        "model_cost_usd": round(sum(float(r.get("model_cost_usd") or 0) for r in runs), 6),
        "summary": summarize(all_cells, specs),
        "cells": all_cells,
    }
    out.write_text(json.dumps(merged, indent=2) + "\n")
    print(json.dumps(merged["summary"]["verdicts_by_line"]))


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]), [Path(p) for p in sys.argv[3:]])
