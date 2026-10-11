"""The ``/heirloom answer <option>`` poller: answers on question issues become precedents.

A question issue carries the marker ``heirloom-question:<kind>:<scope>`` (see
``pipeline.decide.ask``). The first comment ``/heirloom answer <option>`` by an
allowed user, with an option the question offered, is stored with
``PolicyStore.record`` (answer + issue URL + the asking span's trace id). The
issue gets a comment naming the precedent and is closed; the waiting CVEs are
resumed by ``heirloom campaign --continue``, where DECIDE applies the precedent.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Any

from heirloom.config import Settings
from heirloom.integrations import github
from heirloom.ledger import Ledger
from heirloom.pipeline.decide import DEFAULT_OPTIONS, OPTIONS
from heirloom.policy import PolicyStore

MARKER = re.compile(r"heirloom-question:(?P<kind>[A-Z_]+):(?P<scope>\S+?)\s*-->")
ANSWER = re.compile(r"^\s*/heirloom answer\s+(?P<option>[a-z][a-z-]*)\s*$", re.M)


@dataclass(frozen=True)
class Answer:
    issue: str
    kind: str
    scope: str
    option: str
    author: str
    precedent: str


def allowed_users(s: Settings) -> set[str]:
    """The heirloom repo owner, plus HEIRLOOM_ANSWER_USERS (comma-separated logins)."""
    extra = os.environ.get("HEIRLOOM_ANSWER_USERS", "")
    return {s.heirloom_repo.split("/")[0], *(u.strip() for u in extra.split(",") if u.strip())}


def parse_answer(
    comments: list[dict[str, Any]], options: tuple[str, ...], users: set[str]
) -> tuple[str, str] | None:
    """(option, author) of the first valid answer comment, in posting order."""
    for c in comments:
        author = (c.get("author") or {}).get("login", "")
        m = ANSWER.search(c.get("body") or "")
        if m and author in users and m["option"] in options:
            return m["option"], author
    return None


def asking_trace(s: Settings, issue_url: str) -> str:
    """Trace id of the decide.question span that opened this issue ('NONE' if unknown)."""
    ledger = Ledger(s.ledger_path)
    try:
        rows = ledger.db.execute(
            "SELECT trace_id FROM stages WHERE stage='decide.question' AND status='done' "
            "AND output_json LIKE ? ORDER BY finished_at",
            (f'%"{issue_url}"%',),
        ).fetchall()
    finally:
        ledger.close()
    return str(rows[0]["trace_id"]) if rows and rows[0]["trace_id"] else "NONE"


def poll(s: Settings, *, apply: bool = True) -> list[Answer]:
    """Record every new answer as a precedent (and close its question issue)."""
    from heirloom import guard
    from heirloom.config import LINES

    store = PolicyStore(s.root / "policy" / "precedents.json")
    users = allowed_users(s)
    found: list[Answer] = []
    for issue in github.open_issues(s.heirloom_repo, '"heirloom-question" in:body'):
        m = MARKER.search(issue.get("body") or "")
        if not m:
            continue
        kind, scope = m["kind"], m["scope"]
        options = OPTIONS.get(kind, DEFAULT_OPTIONS)
        got = parse_answer(github.comments(s.heirloom_repo, int(issue["number"])), options, users)
        if got is None:
            continue
        option, author = got
        if not apply:
            found.append(Answer(issue["url"], kind, scope, option, author, ""))
            continue
        p = store.record(kind, scope, option, issue["url"], asking_trace(s, issue["url"]))
        line = scope.split("/", 1)[-1]
        with guard.publishing(LINES[line]):
            github.close_issue(
                s.heirloom_repo,
                int(issue["number"]),
                f"Recorded `{option}` (from @{author}) as precedent **{p.id}** for `{kind}` on "
                f"`{scope}`. Heirloom applies it to every waiting and future case of this kind; "
                "it will not ask again.",
            )
        found.append(Answer(issue["url"], kind, scope, option, author, p.id))
    return found
