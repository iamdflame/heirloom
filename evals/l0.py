"""L0 acceptance runs for `heirloom cve <CVE> --line <line>`; results → evals/results_l0.json.

    python evals/l0.py repeat 3     # clean state (incl. fork branch + PR) → run, N times
    python evals/l0.py resume       # SIGKILL mid-ADAPT + crashes after each publish effect

Every check below is executed against the real fork, ledger and git state.
"""

from __future__ import annotations

import json
import os
import signal
import sqlite3
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
HEIRLOOM = str(ROOT / ".venv" / "bin" / "heirloom")
RESULTS = ROOT / "evals" / "results_l0.json"
CVE, LINE = "CVE-2026-87975", "4.2"
FORK, FORK_REMOTE, BASE = "iamdflame/django", "fork", "stable/4.2.x-heirloom"
REPO = Path.home() / "work" / "django"
LEDGER = ROOT / "work" / "ledger.sqlite"
BRANCH = f"heirloom/{CVE.lower()}-{LINE}"


def sh(*args: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, capture_output=True, text=True, env=env)


def heirloom(*args: str, crash_after: str | None = None) -> tuple[int, str, float]:
    env = dict(os.environ)
    env.pop("HEIRLOOM_CRASH_AFTER", None)
    if crash_after:
        env["HEIRLOOM_CRASH_AFTER"] = crash_after
    start = time.monotonic()
    p = sh(HEIRLOOM, *args, env=env)
    out = "\n".join(x for x in (p.stdout + p.stderr).splitlines() if "neatlogs - INFO" not in x)
    return p.returncode, out, time.monotonic() - start


def clean() -> None:
    code, out, _ = heirloom("clean", CVE, "--line", LINE, "--remote")
    assert code == 0, out


def ledger_rows() -> list[sqlite3.Row]:
    db = sqlite3.connect(LEDGER)
    db.row_factory = sqlite3.Row
    return list(
        db.execute(
            "SELECT stage, attempt, status, cost_usd, error FROM stages WHERE cve=? AND line=? "
            "ORDER BY started_at",
            (CVE, LINE),
        )
    )


def gh_json(*args: str) -> Any:
    return json.loads(sh("gh", *args).stdout or "null")


def check_published() -> dict[str, Any]:
    """Invariants of a finished L0 run, checked against the fork, git and the ledger."""
    sh("git", "-C", str(REPO), "fetch", "-q", FORK_REMOTE, BASE, BRANCH)
    remote = sh("git", "-C", str(REPO), "rev-parse", f"{FORK_REMOTE}/{BRANCH}").stdout.strip()
    ahead = int(
        sh("git", "-C", str(REPO), "rev-list", "--count", f"{FORK_REMOTE}/{BASE}..{remote}").stdout
    )
    message = sh("git", "-C", str(REPO), "log", "-1", "--format=%B", remote).stdout
    checkpoint = next(
        (
            ln.split(":", 1)[1].strip()
            for ln in message.splitlines()
            if ln.startswith("Entire-Checkpoint:")
        ),
        "",
    )
    ckpt_refs = sh(
        "git", "-C", str(REPO), "ls-remote", FORK_REMOTE, "refs/entire/checkpoints/*"
    ).stdout
    open_prs = gh_json(
        "pr",
        "list",
        "--repo",
        FORK,
        "--head",
        BRANCH,
        "--state",
        "open",
        "--json",
        "number,url,body",
    )
    rows = ledger_rows()
    effects = ["publish.commit", "publish.push", "publish.artifacts", "publish.pr"]
    done_counts = {
        e: sum(1 for r in rows if r["stage"] == e and r["status"] == "done") for e in effects
    }
    checks = {
        "one_commit_on_fork_branch": ahead == 1,
        "entire_trailer": bool(checkpoint),
        "checkpoint_ref_on_fork": bool(checkpoint) and checkpoint in ckpt_refs,
        "one_open_pr": len(open_prs) == 1,
        "zero_struck_claims": bool(open_prs)
        and "Claims without evidence: **0**" in open_prs[0]["body"],
        "no_unknown_stages": all(r["status"] != "unknown" for r in rows),
        "each_effect_done_once": all(v == 1 for v in done_counts.values()),
    }
    return {
        "ok": all(checks.values()),
        "checks": checks,
        "pr": open_prs[0]["url"] if open_prs else "",
        "commit": remote,
        "checkpoint": checkpoint,
        "cost_usd": round(sum(r["cost_usd"] for r in rows), 4),
        "attempts": {r["stage"]: r["attempt"] for r in rows},
        "failed_attempts": [f"{r['stage']}#{r['attempt']}: {(r['error'] or '')[:120]}" for r in rows if r["status"] == "failed"],  # noqa: E501
    }  # fmt: skip


def save(key: str, value: Any) -> None:
    data = json.loads(RESULTS.read_text()) if RESULTS.exists() else {}
    data[key] = value
    RESULTS.write_text(json.dumps(data, indent=2) + "\n")


def repeat(n: int) -> bool:
    runs = []
    for i in range(1, n + 1):
        clean()
        code, out, secs = heirloom("cve", CVE, "--line", LINE)
        result = {
            "run": i,
            "exit": code,
            "seconds": round(secs, 1),
            "output": out.splitlines()[-8:],
        }
        result.update(check_published() if code == 0 else {"ok": False})
        runs.append(result)
        print(json.dumps({k: result[k] for k in ("run", "exit", "ok", "seconds")}), flush=True)
    save("repeat", {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "runs": runs})
    return all(r["ok"] for r in runs)


def wait_for_running(stage: str, timeout: float) -> bool:
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if LEDGER.exists() and any(
            r["stage"] == stage and r["status"] == "running" for r in ledger_rows()
        ):
            return True
        time.sleep(0.5)
    return False


def resume() -> bool:
    clean()
    steps: list[dict[str, Any]] = []
    env = {k: v for k, v in os.environ.items() if k != "HEIRLOOM_CRASH_AFTER"}
    proc = subprocess.Popen(
        [HEIRLOOM, "cve", CVE, "--line", LINE],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        env=env,
        start_new_session=True,
    )
    seen = wait_for_running("adapt", 600)
    time.sleep(8)  # let claude -p get going, then kill the whole process group
    os.killpg(proc.pid, signal.SIGKILL)
    proc.wait()
    steps.append(
        {"step": "SIGKILL during adapt", "adapt_was_running": seen, "exit": proc.returncode}
    )
    for crash in ("publish.commit", "publish.push", "publish.pr", None):
        code, out, secs = heirloom("resume", CVE, "--line", LINE, crash_after=crash)
        steps.append(
            {
                "step": f"resume (crash after {crash})" if crash else "resume (to completion)",
                "exit": code,
                "seconds": round(secs, 1),
                "output": out.splitlines()[-6:],
            }
        )
        print(json.dumps({k: steps[-1][k] for k in ("step", "exit")}), flush=True)
    final = check_published()
    rows = ledger_rows()
    final["adapt_attempts"] = [
        f"#{r['attempt']} {r['status']}" for r in rows if r["stage"] == "adapt"
    ]
    final["reconciled_effects"] = [
        f"{r['stage']}#{r['attempt']} {r['status']}"
        for r in rows
        if r["stage"].startswith("publish.")
    ]
    save(
        "resume",
        {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "steps": steps, "final": final},
    )
    print(json.dumps(final["checks"]), flush=True)
    return bool(final["ok"]) and steps[-1]["exit"] == 0


def noop() -> bool:
    """Re-running a published CVE without cleaning must change nothing."""
    before = check_published()
    stages_before = len(ledger_rows())
    code, _out, secs = heirloom("cve", CVE, "--line", LINE)
    after = check_published()
    result = {
        "exit": code,
        "seconds": round(secs, 1),
        "same_commit": before["commit"] == after["commit"],
        "same_pr": before["pr"] == after["pr"],
        "no_new_stage_attempts": len(ledger_rows()) == stages_before,
        "after_ok": after["ok"],
    }
    save("noop_rerun", {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **result})
    print(json.dumps(result), flush=True)
    return all(v for k, v in result.items() if k not in ("exit", "seconds")) and code == 0


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "repeat"
    if mode == "repeat":
        ok = repeat(int(sys.argv[2]) if len(sys.argv) > 2 else 3)
    else:
        ok = resume() if mode == "resume" else noop()
    sys.exit(0 if ok else 1)
