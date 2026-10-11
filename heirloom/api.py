"""Read-only JSON API (BUILD-BRIEF §10.6) and its static export.

``heirloom serve`` serves /matrix, /cve/{id}, /line/{id}, /runs, /events,
/campaign and /backtest from the ledger (opened read-only) and evals/*.json.
``heirloom export --out site/data/`` writes the same documents as files. JSON only:
there is no UI here.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from heirloom.config import Settings

LIGHT_OUTPUTS = ("presence", "decide", "publish.pr", "publish.evidence", "publish.commit")


class Data:
    """Every document the API serves, computed from run artifacts only."""

    def __init__(self, s: Settings) -> None:
        self.s = s
        self.evals = s.root / "evals"

    def _json(self, name: str) -> dict[str, Any]:
        path = self.evals / name
        return dict(json.loads(path.read_text())) if path.exists() else {}

    def _db(self) -> sqlite3.Connection | None:
        if not self.s.ledger_path.exists():
            return None
        conn = sqlite3.connect(f"file:{self.s.ledger_path}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        return conn

    def _rows(self, sql: str, args: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        conn = self._db()
        if conn is None:
            return []
        try:
            return [dict(r) for r in conn.execute(sql, args)]
        finally:
            conn.close()

    def matrix(self) -> dict[str, Any]:
        return self._json("matrix.json")

    def campaign(self) -> dict[str, Any]:
        return self._json("results_live.json")

    def backtest(self) -> dict[str, Any]:
        return self._json("results.json")

    def runs(self, limit: int = 500) -> list[dict[str, Any]]:
        return self._rows(
            "SELECT run_id, cve, line, started_at, finished_at, status FROM runs "
            "ORDER BY started_at DESC LIMIT ?",
            (limit,),
        )

    def events(self, limit: int = 1000) -> dict[str, Any]:
        return {
            "events": self._rows("SELECT * FROM events ORDER BY at DESC LIMIT ?", (limit,)),
            "detection_hits": self._rows(
                "SELECT * FROM detection_hits ORDER BY at DESC LIMIT ?", (limit,)
            ),
        }

    def cves(self) -> list[str]:
        ids = {c["cve"] for c in self.matrix().get("cells", [])}
        ids |= {e["cve"] for e in self.campaign().get("events", [])}
        return sorted(ids)

    def lines(self) -> list[str]:
        names = set(self.matrix().get("lines", {}))
        if self.campaign():
            names.add(str(self.campaign()["line"]))
        return sorted(names)

    def cve(self, cve: str) -> dict[str, Any] | None:
        cells = [c for c in self.matrix().get("cells", []) if c["cve"] == cve]
        events = [e for e in self.campaign().get("events", []) if e["cve"] == cve]
        backtest = [
            {"pipeline": p, **row}
            for p, rows in self.backtest().get("runs", {}).items()
            for row in rows.values()
            if row.get("cve") == cve
        ]
        stages = self._rows(
            "SELECT cve, line, stage, attempt, status, run_id, cost_usd, span_id, trace_id, "
            "error, started_at, finished_at, output_json FROM stages WHERE cve=? "
            "ORDER BY started_at",
            (cve,),
        )
        for r in stages:
            out = r.pop("output_json")
            if r["stage"] in LIGHT_OUTPUTS and out:
                r["output"] = json.loads(out)
        if not (cells or events or backtest or stages):
            return None
        return {
            "cve": cve,
            "matrix": cells,
            "campaign": events,
            "backtest": backtest,
            "stages": stages,
        }

    def line(self, name: str) -> dict[str, Any] | None:
        m = self.matrix()
        cells = [c for c in m.get("cells", []) if c["line"] == name]
        camp = self.campaign()
        events = camp.get("events", []) if camp.get("line") == name else []
        if not (cells or events):
            return None
        return {
            "line": name,
            "spec": m.get("lines", {}).get(name),
            "summary": m.get("summary", {}).get("verdicts_by_line", {}).get(name),
            "matrix": cells,
            "campaign": events,
        }


def create_app(s: Settings) -> Any:
    from fastapi import FastAPI, HTTPException

    data = Data(s)
    app = FastAPI(title="Heirloom read API", version="1", docs_url=None, redoc_url=None)

    @app.get("/")
    def index() -> dict[str, Any]:
        return {
            "endpoints": ["/matrix", "/campaign", "/backtest", "/cve/{id}", "/line/{id}",
                          "/runs", "/events"],
            "cves": data.cves(),
            "lines": data.lines(),
        }  # fmt: skip

    @app.get("/matrix")
    def matrix() -> dict[str, Any]:
        return data.matrix()

    @app.get("/campaign")
    def campaign() -> dict[str, Any]:
        return data.campaign()

    @app.get("/backtest")
    def backtest() -> dict[str, Any]:
        return data.backtest()

    @app.get("/runs")
    def runs(limit: int = 500) -> list[dict[str, Any]]:
        return data.runs(limit)

    @app.get("/events")
    def events(limit: int = 1000) -> dict[str, Any]:
        return data.events(limit)

    @app.get("/cve/{cve_id}")
    def cve(cve_id: str) -> dict[str, Any]:
        doc = data.cve(cve_id)
        if doc is None:
            raise HTTPException(404, f"no record of {cve_id}")
        return doc

    @app.get("/line/{name}")
    def line(name: str) -> dict[str, Any]:
        doc = data.line(name)
        if doc is None:
            raise HTTPException(404, f"no record of line {name}")
        return doc

    return app


def export(s: Settings, out: Path) -> list[Path]:
    """Write every API document as a static JSON file under ``out``."""
    data = Data(s)
    docs: dict[str, Any] = {
        "index.json": {"cves": data.cves(), "lines": data.lines()},
        "matrix.json": data.matrix(),
        "campaign.json": data.campaign(),
        "backtest.json": data.backtest(),
        "runs.json": data.runs(),
        "events.json": data.events(),
    }
    for cve in data.cves():
        docs[f"cve/{cve}.json"] = data.cve(cve)
    for name in data.lines():
        docs[f"line/{name}.json"] = data.line(name)
    written = []
    for rel, doc in docs.items():
        path = out / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(doc, indent=1, default=str) + "\n")
        written.append(path)
    return written
