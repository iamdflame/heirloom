"""E2 campaign replay (BUILD-BRIEF §10.5): ``heirloom campaign --line 4.2 --replay``.

The security archive is replayed commit by commit: each archive commit that adds a
post-EOL advisory (or a follow-up fix commit to one) becomes an *event*, and LOCATE
reads the archive at that commit. Events run through the normal pipeline, so every
verdict comes from the calibration gates and every publication is one PR (verified
fix) or one evidence issue (NOT_AFFECTED_PROVEN / UNPROVEN).

Deterministic relations between advisories:

* **follow-up**: an archive commit adds a fix commit to an advisory Heirloom already
  handled (CVE-2026-15830 + ``1eafa1a8``). If that CVE was published, the follow-up
  is ported on top of Heirloom's own branch, pushed as a fast-forward, and the PR is
  updated and commented.
* **supersession**: the lines a new fix changes blame (on its U⁻) into an earlier
  advisory's fix (CVE-2026-87890's lines come from CVE-2026-15307's ``115ffd04``).
  If that CVE was published, the new one is stacked on its branch (PR base = that
  branch). If it waits for a human answer, the new one waits too.

Workers are separate processes sharing one state file (``fcntl`` lock); each claims
the next runnable event. The overflow cap is checked before every claim with the
provider-reported spend, so the campaign stops before it can cross the cap.
"""

from __future__ import annotations

import dataclasses
import fcntl
import json
import os
import re
import subprocess
import sys
import time
from collections import Counter
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import date
from pathlib import Path
from typing import Any

from heirloom.config import LINES, LineSpec, Settings
from heirloom.git_ops import git, git_ok, parse_diff, rev_parse
from heirloom.integrations import github
from heirloom.ledger import Ledger
from heirloom.models.router import overflow_spent
from heirloom.sources.django_security import AdvisoryError, load

EOL = {"4.2": date(2026, 4, 7)}  # end of extended support (tag 4.2.30)
# Story CVEs run first (B4 brief); the rest in archive order.
STORY = ("CVE-2026-15307", "CVE-2026-87890", "CVE-2026-15830", "CVE-2026-53878")
# Already published by the L0 golden path (PR #9): no more PRs for it.
NO_MORE_PRS = {"CVE-2026-87975"}
STATE_DIR = "campaign"
SHA = re.compile(r"^([0-9a-f]{40}) \d+ \d+", re.M)

Event = dict[str, Any]


# Plan ------------------------------------------------------------------------------


def archive_commits(repo: Path, since: date) -> list[str]:
    """Security-archive commits on main since ``since``, oldest first."""
    out = git(
        repo,
        "log",
        "--reverse",
        "--format=%H",
        f"--since={since.isoformat()}",
        "origin/main",
        "--",
        "docs/releases/security.txt",
    )
    return out.split()


def _series_commits(adv: Any, spec: LineSpec) -> list[str] | None:
    try:
        return list(adv.fix_commits(adv.first_series(spec.upstreams)))
    except AdvisoryError:
        return None


def plan_events(repo: Path, spec: LineSpec, eol: date) -> list[Event]:
    """Every archive commit's new post-EOL advisories and follow-up fix commits."""
    events: list[Event] = []
    for ref in archive_commits(repo, eol):
        cur = load(repo, ref)
        prev = load(repo, f"{ref}^") if git_ok(repo, "cat-file", "-e", f"{ref}^") else {}
        when = git(repo, "log", "-1", "--format=%cs", ref).strip()
        for cve, adv in sorted(cur.items(), key=lambda kv: kv[0]):
            if adv.date <= eol or spec.name in adv.commits:
                continue  # supported then, or the line got an official fix
            commits = _series_commits(adv, spec)
            if not commits:
                continue
            before = _series_commits(prev[cve], spec) if cve in prev else None
            if not before:
                kind, added = "new", commits
            elif commits != before:
                kind, added = "followup", [c for c in commits if c not in before]
            else:
                continue
            events.append(
                {
                    "id": f"{cve}@{ref[:10]}",
                    "cve": cve,
                    "kind": kind,
                    "ref": ref,
                    "archive_date": when,
                    "advisory_date": adv.date.isoformat(),
                    "commits": [rev_parse(repo, c) for c in commits],
                    "added": [rev_parse(repo, c) for c in added],
                }
            )
    return events


def blamed_commits(repo: Path, fix: str) -> set[str]:
    """Commits that last touched the lines a fix commit removes or changes (on its U⁻)."""
    out: set[str] = set()
    for d in parse_diff(git(repo, "show", "--format=", "-U0", fix, "--", "django/")):
        if not d.old_path:
            continue
        for h in d.hunks:
            if h.old_count == 0:
                continue
            blame = git(
                repo,
                "blame",
                "--porcelain",
                "-L",
                f"{h.old_start},+{h.old_count}",
                f"{fix}^",
                "--",
                d.old_path,
                check=False,
            )
            out.update(SHA.findall(blame))
    return out


def link_dependencies(repo: Path, events: list[Event]) -> None:
    """``depends_on``: earlier advisories whose fix commits a later fix modifies."""
    owner: dict[str, str] = {}
    for ev in events:
        if ev["kind"] == "new":
            blamed = set().union(*(blamed_commits(repo, c) for c in ev["added"]))
            ev["depends_on"] = sorted({owner[c] for c in blamed if c in owner} - {ev["cve"]})
            ev["blamed_into"] = sorted(c for c in blamed if c in owner)
        else:
            ev["depends_on"] = []
            ev["blamed_into"] = []
        for c in ev["commits"]:
            owner.setdefault(c, ev["cve"])


def order(events: list[Event], story: tuple[str, ...] = STORY) -> list[Event]:
    """Story CVEs first (each with its follow-ups), then the rest in archive order."""
    first = [ev for cve in story for ev in events if ev["cve"] == cve]
    return first + [ev for ev in events if ev["cve"] not in story]


# State -----------------------------------------------------------------------------


@contextmanager
def locked_state(path: Path) -> Iterator[dict[str, Any]]:
    """Read-modify-write the campaign state under an exclusive lock."""
    lock = path.with_suffix(".lock")
    with lock.open("w") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        try:
            state: dict[str, Any] = json.loads(path.read_text())
            yield state
            tmp = path.with_suffix(".tmp")
            tmp.write_text(json.dumps(state, indent=2) + "\n")
            tmp.replace(path)
        finally:
            fcntl.flock(fh, fcntl.LOCK_UN)


def state_path(s: Settings, campaign_id: str) -> Path:
    return s.work / STATE_DIR / f"{campaign_id}.json"


def create(s: Settings, line: str, cap_usd: float, campaign_id: str | None = None) -> Path:
    spec = LINES[line]
    cid = campaign_id or "c" + time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    git(s.django_repo, "fetch", "-q", "origin", "main")
    events = plan_events(s.django_repo, spec, EOL[line])  # archive order
    link_dependencies(s.django_repo, events)
    events = order(events)
    start = overflow_spent(s)
    state = {
        "id": cid,
        "line": line,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "overflow": {"start_usd": round(start, 6), "cap_usd": cap_usd},
        "story": list(STORY),
        "events": [{**ev, "status": "pending"} for ev in events],
    }
    path = state_path(s, cid)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2) + "\n")
    return path


# Claiming --------------------------------------------------------------------------

FINAL = {"published", "evidence", "skipped", "no_fix", "harness_error", "budget_stop"}
WAITING = {"waiting_human", "blocked"}


def _outcome(state: dict[str, Any], cve: str) -> Event | None:
    """The latest finished event of a CVE (a follow-up supersedes its first event)."""
    done = [e for e in state["events"] if e["cve"] == cve and e["status"] not in ("pending",)]
    return done[-1] if done else None


def runnable(state: dict[str, Any], ev: Event) -> tuple[bool, str]:
    """Whether an event can start now; otherwise why not ('' = wait for a running one)."""
    deps = list(ev.get("depends_on") or [])
    if ev["kind"] == "followup":
        deps = [ev["cve"]]
    for dep in deps:
        firsts = [e for e in state["events"] if e["cve"] == dep and e["id"] != ev["id"]]
        if any(e["status"] in ("pending", "running") for e in firsts):
            return False, ""
        if any(e["status"] in WAITING for e in firsts):
            q = next((e.get("question") for e in firsts if e.get("question")), "")
            return False, f"waits for {dep}" + (f" ({q})" if q else "")
    return True, ""


def claim(path: Path, worker: str, budget_ok: Callable[[int], bool]) -> Event | None:
    """Mark the next runnable event as running (None: nothing left to start now)."""
    with locked_state(path) as state:
        running = sum(1 for e in state["events"] if e["status"] == "running")
        for ev in state["events"]:
            if ev["status"] != "pending":
                continue
            ok, why = runnable(state, ev)
            if not ok:
                if why:
                    ev.update(status="blocked", reason="DEPENDENCY", note=why)
                continue
            if not budget_ok(running):
                ev.update(status="budget_stop", note="overflow cap would be crossed")
                continue
            ev.update(status="running", worker=worker, pid=os.getpid(), started=time.time())
            return dict(ev)
    return None


def reopen(path: Path) -> list[str]:
    """Put waiting, blocked, budget-stopped and crashed events back in the queue."""
    with locked_state(path) as state:
        ids = []
        for ev in state["events"]:
            if ev["status"] in (*WAITING, "budget_stop", "harness_error") or (
                ev["status"] == "running" and not _alive(int(ev.get("pid") or 0))
            ):
                ev["status"] = "pending"
                ids.append(ev["id"])
        return ids


def _alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def pending_left(path: Path) -> bool:
    state = json.loads(path.read_text())
    return any(e["status"] in ("pending", "running") for e in state["events"])


def finish(path: Path, ev_id: str, **fields: Any) -> None:
    with locked_state(path) as state:
        for ev in state["events"]:
            if ev["id"] == ev_id:
                ev.update(fields, finished=time.time())


# Processing ------------------------------------------------------------------------


def _branch(cve: str, line: str) -> str:
    return f"heirloom/{cve.lower()}-{line}"


def _remote_head(s: Settings, branch: str) -> str | None:
    out = git(s.django_repo, "ls-remote", s.fork_remote, f"refs/heads/{branch}")
    return out.split()[0] if out.strip() else None


def stacked(spec: LineSpec, s: Settings, cve: str) -> tuple[LineSpec, str] | None:
    """The line as Heirloom's own published branch of ``cve`` (None if not on the fork)."""
    branch = _branch(cve, spec.name)
    head = _remote_head(s, branch)
    if head is None:
        return None
    git(s.django_repo, "fetch", "-q", s.fork_remote, f"+refs/heads/{branch}:refs/remotes/"
        f"{s.fork_remote}/{branch}")  # fmt: skip
    return dataclasses.replace(spec, tip=head, base_branch=branch), head


PROBE_LEDGERS = ("work-b/ledger.sqlite",)  # Thread B's ledger (read-only)


def reusable_probe(s: Settings, cve: str) -> dict[str, Any] | None:
    """An independent-porter probe already calibrated on the 4.2.30 tree (C1 holds and its
    own line came out AFFECTED or NOT_AFFECTED_PROVEN). Hand-written probes and probes that
    ended UNPROVEN are not reused: the campaign runs the porter for those."""
    from heirloom.lines.matrix import probe_sources

    ledgers = [s.ledger_path, *(s.root / p for p in PROBE_LEDGERS)]
    chosen, bodies, _ = probe_sources([p for p in ledgers if p.exists()])
    src = chosen.get(cve)
    if src is None or src.origin != "porter" or src.sha not in bodies:
        return None
    if src.line_verdict not in ("AFFECTED", "NOT_AFFECTED_PROVEN"):
        return None
    return {
        **bodies[src.sha],
        "origin": src.origin,
        "reused_from": {"ledger": src.ledger, "line": src.line, "run": src.run_id},
    }


def _pr_number(url: str) -> int | None:
    m = re.search(r"/pull/(\d+)", url or "")
    return int(m[1]) if m else None


def process(s: Settings, state: dict[str, Any], ev: Event) -> dict[str, Any]:
    """Run one event through the pipeline; returns the fields to record."""
    from heirloom.pipeline.run import execute

    line = state["line"]
    spec = LINES[line]
    cve = ev["cve"]
    if cve in NO_MORE_PRS:
        found = github.find_pr(s.fork, _branch(cve, line))
        return {
            "status": "skipped",
            "verdict": "AFFECTED",
            "reason": "ALREADY_PUBLISHED",
            "pr": found["url"] if found else "",
            "note": "published earlier by the L0 golden path; no new PR (B4 brief)",
        }
    done_fixes: tuple[str, ...] = ()
    note = ""
    supersedes: dict[str, Any] | None = None
    if ev["kind"] == "followup":
        prior = _outcome({"events": [e for e in state["events"] if e["id"] != ev["id"]]}, cve)
        on_branch = stacked(spec, s, cve) if prior and prior.get("pr") else None
        if on_branch and prior:
            spec, head = on_branch
            done_fixes = tuple(c for c in ev["commits"] if c not in ev["added"])
            note = (
                f"Follow-up: the archive commit `{ev['ref'][:10]}` added "
                + ", ".join(f"`{c[:10]}`" for c in ev["added"])
                + f" to {cve}; ported on top of this PR's branch (was `{head[:10]}`)."
            )
            supersedes = {"kind": "followup", "of": prior["id"], "pr": prior.get("pr")}
        else:
            note = (
                f"The archive commit `{ev['ref'][:10]}` added a follow-up fix to {cve}; "
                "nothing was published for the first fix, so the whole fix is re-evaluated."
            )
    for dep in ev.get("depends_on") or []:
        prior = _outcome(state, dep)
        if prior and prior.get("pr"):
            on_branch = stacked(spec, s, dep)
            if on_branch:
                spec, head = on_branch
                note = (
                    f"Stacked on {prior['pr']} ({dep}): {cve}'s upstream fix changes lines "
                    f"that {dep}'s fix introduced (blame: "
                    + ", ".join(f"`{c[:10]}`" for c in ev.get("blamed_into", []))
                    + f"), so it is ported on top of Heirloom's {dep} branch "
                    f"(`{head[:10]}`). Merge that PR first."
                )
                supersedes = {"kind": "supersedes", "of": dep, "pr": prior["pr"]}
                break
        elif prior:
            note = (
                f"{cve}'s upstream fix changes lines {dep}'s fix introduced, but {dep} has no "
                f"published backport here ({prior.get('status')}), so this is evaluated on "
                f"the line itself."
            )
    reuse = None
    if ev["kind"] == "new" and supersedes is None:
        reuse = reusable_probe(s, cve)
    ledger = Ledger(s.ledger_path)
    cost_before = ledger.cost_total(cve, line)
    ledger.close()
    overflow_before = overflow_spent(s)
    started = time.monotonic()
    r = execute(
        s,
        cve,
        spec,
        reuse_probe=reuse,
        campaign_id=state["id"],
        archive_ref=ev["ref"],
        done_fixes=done_fixes,
        note=note,
    )
    ledger = Ledger(s.ledger_path)
    cost = ledger.cost_total(cve, line) - cost_before
    if supersedes:
        ledger.event(r.run_id, cve, line, "campaign", "supersedes", json.dumps(supersedes))
    ledger.close()
    out: dict[str, Any] = {
        "status": r.status,
        "verdict": r.verdict,
        "reason": r.reason,
        "decision": r.decision,
        "escalated": r.escalated,
        "run_id": r.run_id,
        "pr": r.pr_url,
        "issue": r.issue_url if r.status != "waiting_human" else "",
        "question": r.issue_url if r.status == "waiting_human" else "",
        "checkpoint": r.checkpoint,
        "message": r.message,
        "note": note,
        "spec_tip": spec.tip,
        "base_branch": spec.base_branch,
        "supersedes": supersedes,
        "reused_probe": (reuse or {}).get("reused_from"),
        "cost_usd": round(cost, 6),
        "overflow_usd": round(overflow_spent(s) - overflow_before, 6),
        "minutes": round((time.monotonic() - started) / 60, 2),
    }
    if supersedes and r.status == "published" and supersedes.get("pr"):
        number = _pr_number(str(supersedes["pr"]))
        if number is not None:
            from heirloom import guard

            with guard.publishing(spec):
                text = (
                    f"Heirloom: {cve} ({ev['ref'][:10]} in the security archive) is stacked on "
                    f"this branch: {r.pr_url}"
                    if supersedes["kind"] == "supersedes"
                    else f"Heirloom: follow-up for {cve} pushed to this branch "
                    f"(`{(r.checkpoint or r.run_id)}`)."
                )
                github.comment(s.fork, number, text, pr=True)
    return out


def worker(s: Settings, path: Path, name: str, log: Callable[[str], None]) -> None:
    state0 = json.loads(path.read_text())
    cap = float(state0["overflow"]["cap_usd"])
    start = float(state0["overflow"]["start_usd"])
    # The router and claude -p refuse overflow beyond this total (global $25 cap too).
    s = dataclasses.replace(s, max_overflow_usd=min(s.max_overflow_usd, start + cap))

    def budget_ok(running: int) -> bool:
        spent = overflow_spent(s) - start
        return spent + s.max_usd_per_cve * (running + 1) <= cap

    while True:
        ev = claim(path, name, budget_ok)
        if ev is None:
            if not pending_left(path):
                return
            time.sleep(15)  # a running event may unblock a pending one
            continue
        log(f"[{name}] {ev['id']} ({ev['kind']}) ...")
        state = json.loads(path.read_text())
        try:
            fields = process(s, state, ev)
        except Exception as exc:  # recorded per event; never turned into a verdict
            fields = {"status": "harness_error", "error": f"{type(exc).__name__}: {exc}"[:2000]}
        finish(path, ev["id"], **fields)
        log(
            f"[{name}] {ev['id']}: {fields.get('status')} {fields.get('verdict', '')} "
            f"{fields.get('reason', '')} {fields.get('pr') or fields.get('issue') or ''} "
            f"{fields.get('question') or ''} ${fields.get('cost_usd', 0)}"
        )


def spawn_workers(path: Path, n: int, log_dir: Path) -> list[subprocess.Popen[bytes]]:
    log_dir.mkdir(parents=True, exist_ok=True)
    procs = []
    for i in range(n):
        out = (log_dir / f"worker-{i}.log").open("ab")
        procs.append(
            subprocess.Popen(
                [sys.executable, "-m", "heirloom.cli", "campaign-worker", str(path), f"w{i}"],
                stdout=out,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
        )
    return procs


# Results ---------------------------------------------------------------------------


def results(s: Settings, path: Path) -> dict[str, Any]:
    state = json.loads(path.read_text())
    events = state["events"]
    final = {}
    for ev in events:  # per CVE: the latest event (a follow-up supersedes the first)
        if ev["status"] not in ("pending",):
            final[ev["cve"]] = ev
    verdicts = Counter(e.get("verdict", "NONE") for e in final.values())
    statuses = Counter(e["status"] for e in final.values())
    spent = overflow_spent(s) - float(state["overflow"]["start_usd"])
    return {
        "campaign": state["id"],
        "line": state["line"],
        "created_at": state["created_at"],
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "story_order": state["story"],
        "overflow": {
            **state["overflow"],
            "spent_usd": round(spent, 4),
            "source": "max(our OpenRouter usage.cost / claude -p total_cost_usd records, "
            "the OpenRouter key's billed usage)",
        },
        "summary": {
            "cves": len(final),
            "verdicts": dict(verdicts),
            "statuses": dict(statuses),
            "prs": sorted({e["pr"] for e in final.values() if e.get("pr")}),
            "evidence_issues": sorted({e["issue"] for e in final.values() if e.get("issue")}),
            "questions": sorted({e["question"] for e in events if e.get("question")}),
            "escalated": sum(1 for e in final.values() if e.get("escalated")),
            "escalation_rate": round(
                sum(1 for e in final.values() if e.get("escalated")) / len(final), 3
            )
            if final
            else None,
            "ledger_cost_usd": round(sum(float(e.get("cost_usd") or 0) for e in events), 4),
            "minutes_total": round(sum(float(e.get("minutes") or 0) for e in events), 1),
        },
        "events": events,
    }
