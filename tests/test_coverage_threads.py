"""C3 reach counts code that runs in worker threads (BUILD-BRIEF §11)."""

import configparser
import json
import subprocess
import sys
from pathlib import Path

from heirloom.pipeline.calibrate import REACH_COVERAGE, on_line_inputs
from heirloom.verify.runner import RCFILE

SCRIPT = """\
import threading


def in_thread():
    x = 1
    return x + 1


t = threading.Thread(target=in_thread)
t.start()
t.join()
"""


def test_rcfile_traces_threads() -> None:
    cfg = configparser.ConfigParser()
    cfg.read(RCFILE)
    assert cfg.get("run", "concurrency").split(",") == ["thread"]
    assert not cfg.has_option("run", "source")  # would override --include


def test_coverage_with_the_runner_rcfile_sees_a_worker_thread(tmp_path: Path) -> None:
    script = tmp_path / "threaded.py"
    script.write_text(SCRIPT)
    data = tmp_path / ".cov"
    run = [sys.executable, "-m", "coverage"]
    subprocess.run(
        [*run, "run", f"--rcfile={RCFILE}", f"--data-file={data}", str(script)],
        check=True,
        cwd=tmp_path,
    )
    out = tmp_path / "cov.json"
    subprocess.run(
        [*run, "json", "-q", f"--rcfile={RCFILE}", f"--data-file={data}", "-o", str(out)],
        check=True,
        cwd=tmp_path,
    )
    files = json.loads(out.read_text())["files"]
    executed = next(v["executed_lines"] for k, v in files.items() if k.endswith("threaded.py"))
    assert {5, 6} <= set(executed)  # the body of in_thread()


def test_reach_evidence_is_keyed_by_the_coverage_configuration() -> None:
    inputs = on_line_inputs("sha", ["fix"], "tip")
    assert inputs["coverage"] == REACH_COVERAGE == "concurrency=thread"
