"""Emit one v1-style claim through the real stage path and wait for its neatlogs hit.

    python evals/emit_flag_sample.py

The claim mirrors v1's real false negative in E1 (CVE-2026-1285: "not affected"
with no calibration). It runs in a throwaway ledger on a non-publishing eval line,
so Heirloom's own ledger and evidence are untouched. The trace is tagged
``v1-sample``. Result -> evals/detections_flag_check.json.
"""

from __future__ import annotations

import json
import tempfile
import time
from pathlib import Path

from heirloom import config
from heirloom.config import runtime_line
from heirloom.integrations import neatlogs_api as api
from heirloom.integrations.neatlogs import Telemetry
from heirloom.ledger import Ledger
from heirloom.pipeline.context import Ctx

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "evals" / "detections_flag_check.json"
DETECTION = "not_affected_without_calibration"


def main() -> int:
    s = config.load()
    client = api.Api(s)
    det = next(d for d in client.detections() if d["displayName"] == DETECTION)
    before = client.hits(det["id"])
    run_id = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()) + "-v1sample"
    tel = Telemetry()
    tel.init(s.neatlogs_api_key, tags=["heirloom", "v1-sample", f"run-{run_id}"])
    with tempfile.TemporaryDirectory() as tmp:
        ledger = Ledger(Path(tmp) / "ledger.sqlite")
        spec = runtime_line("v1-sample", "4.2.30", "eval")
        ctx = Ctx(s, ledger, tel, spec, "CVE-2026-1285", spec.name, run_id, "v1-sample")
        with tel.cve_root(ctx.cve, ctx.line, run_id, "v1-sample"):

            def claim(span: object) -> dict[str, object]:
                ctx.verdict, ctx.calibrated, ctx.reach = "NOT_AFFECTED_PROVEN", False, True
                return {"pipeline": "v1", "claim": "not affected (no calibration)"}

            ctx.stage("presence", {"sample": run_id}, claim)
        local = [h["detection"] for h in ledger.hits()]
        ledger.close()
    trace_id = tel.root_trace_id
    tel.shutdown()
    hits = before
    waited = 0
    while waited < 600 and hits <= before:
        time.sleep(30)
        waited += 30
        hits = client.hits(det["id"])
    out = {
        "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "detection": {"name": DETECTION, "id": det["id"]},
        "trace_id": trace_id,
        "run_id": run_id,
        "local_mirror_hits": local,
        "neatlogs_hits_before": before,
        "neatlogs_hits_after": hits,
        "seconds_waited": waited,
        "confirmed": hits > before,
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps(out))
    return 0 if out["confirmed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
