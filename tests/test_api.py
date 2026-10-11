"""The read API serves run artifacts only, and exports the same documents."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from heirloom import config
from heirloom.api import create_app, export
from heirloom.ledger import Ledger


def settings(tmp_path: Path) -> config.Settings:
    root = tmp_path / "root"
    (root / "evals").mkdir(parents=True)
    matrix = {
        "lines": {"4.2.30": {"kind": "eval", "tip": "abc"}},
        "summary": {"verdicts_by_line": {"4.2.30": {"AFFECTED": 1}}},
        "cells": [{"cve": "CVE-1", "line": "4.2.30", "verdict": "AFFECTED"}],
    }
    (root / "evals" / "matrix.json").write_text(json.dumps(matrix))
    live = {"line": "4.2", "events": [{"cve": "CVE-1", "status": "published", "pr": "u"}]}
    (root / "evals" / "results_live.json").write_text(json.dumps(live))
    s = config.load()
    s = config.Settings(**{**s.__dict__, "root": root, "work": tmp_path / "work"})
    ledger = Ledger(s.ledger_path)
    ledger.start_run("r1", "CVE-1", "4.2")
    ledger.event("r1", "CVE-1", "4.2", "campaign", "supersedes", "{}")
    ledger.close()
    return s


def test_endpoints_answer_from_artifacts(tmp_path: Path) -> None:
    client = TestClient(create_app(settings(tmp_path)))
    assert client.get("/").json()["cves"] == ["CVE-1"]
    assert client.get("/matrix").json()["cells"][0]["verdict"] == "AFFECTED"
    doc = client.get("/cve/CVE-1").json()
    assert doc["campaign"][0]["pr"] == "u" and doc["matrix"][0]["line"] == "4.2.30"
    assert client.get("/cve/CVE-9").status_code == 404
    assert client.get("/line/4.2.30").json()["summary"] == {"AFFECTED": 1}
    assert client.get("/line/4.2").json()["campaign"][0]["status"] == "published"
    assert client.get("/runs").json()[0]["run_id"] == "r1"
    assert client.get("/events").json()["events"][0]["kind"] == "supersedes"


def test_export_writes_the_same_documents(tmp_path: Path) -> None:
    s = settings(tmp_path)
    out = tmp_path / "site" / "data"
    files = {p.relative_to(out).as_posix() for p in export(s, out)}
    assert {"index.json", "matrix.json", "cve/CVE-1.json", "line/4.2.json"} <= files
    assert json.loads((out / "cve" / "CVE-1.json").read_text())["cve"] == "CVE-1"
