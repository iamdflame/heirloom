"""SQLite effects ledger and stage state machine.

Every pipeline stage is keyed by ``(cve, line, stage, attempt)`` and moves through
``pending -> running -> done | failed``. A stage that performs an external side
effect (commit, push, PR, issue) and is interrupted while ``running`` becomes
``unknown``: it may or may not have happened, so the ledger refuses to retry it
(:class:`PausedForReconcile`) until the caller checks the remote and calls
:meth:`Ledger.resolve`.
"""

from __future__ import annotations

import hashlib
import json
import os
import socket
import sqlite3
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

Status = Literal["pending", "running", "done", "failed", "unknown"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    run_id      TEXT PRIMARY KEY,
    cve         TEXT NOT NULL,
    line        TEXT NOT NULL,
    pid         INTEGER NOT NULL,
    host        TEXT NOT NULL,
    started_at  REAL NOT NULL,
    finished_at REAL,
    status      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stages (
    cve          TEXT NOT NULL,
    line         TEXT NOT NULL,
    stage        TEXT NOT NULL,
    attempt      INTEGER NOT NULL,
    status       TEXT NOT NULL,
    effect       INTEGER NOT NULL,
    run_id       TEXT NOT NULL,
    pid          INTEGER NOT NULL,
    input_hash   TEXT NOT NULL,
    output_hash  TEXT,
    output_json  TEXT,
    cost_usd     REAL NOT NULL DEFAULT 0,
    span_id      TEXT,
    trace_id     TEXT,
    error        TEXT,
    started_at   REAL NOT NULL,
    finished_at  REAL,
    PRIMARY KEY (cve, line, stage, attempt)
);
CREATE TABLE IF NOT EXISTS detection_hits (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id    TEXT NOT NULL,
    cve       TEXT NOT NULL,
    line      TEXT NOT NULL,
    stage     TEXT NOT NULL,
    detection TEXT NOT NULL,
    span_id   TEXT,
    trace_id  TEXT,
    at        REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    at      REAL NOT NULL,
    run_id  TEXT NOT NULL,
    cve     TEXT NOT NULL,
    line    TEXT NOT NULL,
    stage   TEXT NOT NULL,
    kind    TEXT NOT NULL,
    message TEXT NOT NULL
);
"""


class LedgerError(Exception):
    pass


class PausedForReconcile(LedgerError):
    """An effect stage is ``unknown``; check the remote before doing anything else."""

    def __init__(self, key: StageKey, detail: str) -> None:
        super().__init__(f"{key}: side effect state unknown ({detail}); reconcile before retrying")
        self.key = key
        self.detail = detail


class ConcurrentRunError(LedgerError):
    """Another live process owns a running stage for this CVE and line."""


@dataclass(frozen=True)
class StageKey:
    cve: str
    line: str
    stage: str
    attempt: int

    def __str__(self) -> str:
        return f"{self.cve}/{self.line}/{self.stage}#{self.attempt}"


@dataclass(frozen=True)
class StageRow:
    key: StageKey
    status: Status
    effect: bool
    run_id: str
    pid: int
    input_hash: str
    output: dict[str, Any] | None
    cost_usd: float
    span_id: str | None
    trace_id: str | None
    error: str | None


@dataclass(frozen=True)
class Proceed:
    """The caller should execute the stage as ``key``."""

    key: StageKey


@dataclass(frozen=True)
class Cached:
    """The stage already finished with the same inputs; reuse its output."""

    key: StageKey
    output: dict[str, Any]


def canonical_hash(obj: Any) -> str:
    data = json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(data.encode()).hexdigest()


def pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


class Ledger:
    def __init__(
        self,
        path: Path,
        *,
        pid: int | None = None,
        pid_alive: Callable[[int], bool] = pid_alive,
    ) -> None:
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, isolation_level=None, timeout=30)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript(SCHEMA)
        cols = {r["name"] for r in self.db.execute("PRAGMA table_info(runs)")}
        if "spec" not in cols:  # line spec JSON, so `resume` can rebuild runtime lines
            self.db.execute("ALTER TABLE runs ADD COLUMN spec TEXT")
        self.pid = os.getpid() if pid is None else pid
        self._pid_alive = pid_alive

    def close(self) -> None:
        self.db.close()

    @contextmanager
    def _tx(self) -> Iterator[sqlite3.Connection]:
        self.db.execute("BEGIN IMMEDIATE")
        try:
            yield self.db
        except BaseException:
            self.db.execute("ROLLBACK")
            raise
        self.db.execute("COMMIT")

    # runs -----------------------------------------------------------------

    def start_run(self, run_id: str, cve: str, line: str, spec: str | None = None) -> None:
        with self._tx() as db:
            db.execute(
                "INSERT INTO runs (run_id, cve, line, pid, host, started_at, status, spec) "
                "VALUES (?, ?, ?, ?, ?, ?, 'running', ?) "
                "ON CONFLICT(run_id) DO UPDATE SET pid=excluded.pid, status='running', "
                "finished_at=NULL, spec=COALESCE(excluded.spec, runs.spec)",
                (run_id, cve, line, self.pid, socket.gethostname(), time.time(), spec),
            )

    def finish_run(self, run_id: str, status: str) -> None:
        self.db.execute(
            "UPDATE runs SET status=?, finished_at=? WHERE run_id=?", (status, time.time(), run_id)
        )

    def latest_run(self, cve: str, line: str) -> sqlite3.Row | None:
        row: sqlite3.Row | None = self.db.execute(
            "SELECT * FROM runs WHERE cve=? AND line=? ORDER BY started_at DESC LIMIT 1",
            (cve, line),
        ).fetchone()
        return row

    def unfinished_runs(self) -> list[sqlite3.Row]:
        return list(
            self.db.execute(
                "SELECT * FROM runs WHERE status NOT IN ('done') ORDER BY started_at"
            ).fetchall()
        )

    # stages ---------------------------------------------------------------

    def _row(self, r: sqlite3.Row) -> StageRow:
        return StageRow(
            key=StageKey(r["cve"], r["line"], r["stage"], r["attempt"]),
            status=r["status"],
            effect=bool(r["effect"]),
            run_id=r["run_id"],
            pid=r["pid"],
            input_hash=r["input_hash"],
            output=json.loads(r["output_json"]) if r["output_json"] else None,
            cost_usd=r["cost_usd"],
            span_id=r["span_id"],
            trace_id=r["trace_id"],
            error=r["error"],
        )

    def latest(self, cve: str, line: str, stage: str) -> StageRow | None:
        r = self.db.execute(
            "SELECT * FROM stages WHERE cve=? AND line=? AND stage=? ORDER BY attempt DESC LIMIT 1",
            (cve, line, stage),
        ).fetchone()
        return self._row(r) if r else None

    def stages(self, cve: str, line: str) -> list[StageRow]:
        rows = self.db.execute(
            "SELECT * FROM stages WHERE cve=? AND line=? ORDER BY started_at, attempt", (cve, line)
        ).fetchall()
        return [self._row(r) for r in rows]

    def has_done(self, cve: str, line: str, stage: str, inputs: Any) -> bool:
        """Whether begin() would return a cached result for these inputs (no claim made)."""
        row = self.db.execute(
            "SELECT 1 FROM stages WHERE cve=? AND line=? AND stage=? AND status='done' "
            "AND input_hash=? LIMIT 1",
            (cve, line, stage, canonical_hash(inputs)),
        ).fetchone()
        return row is not None

    def begin(
        self, cve: str, line: str, stage: str, inputs: Any, *, run_id: str, effect: bool = False
    ) -> Proceed | Cached:
        """Claim the next attempt of a stage, or return the cached result.

        Raises :class:`PausedForReconcile` for an ``unknown`` effect (including one
        that was ``running`` in a process that no longer exists) and
        :class:`ConcurrentRunError` if a live process holds the stage.
        """
        input_hash = canonical_hash(inputs)
        pause: PausedForReconcile | None = None
        with self._tx() as db:
            latest = self.latest(cve, line, stage)
            attempt = 1
            if latest is not None:
                attempt = latest.key.attempt + 1
                if latest.status == "done" and latest.input_hash == input_hash:
                    return Cached(latest.key, latest.output or {})
                if latest.status == "unknown":
                    raise PausedForReconcile(latest.key, latest.error or "unknown")
                if latest.status == "running":
                    if latest.pid != self.pid and self._pid_alive(latest.pid):
                        raise ConcurrentRunError(f"{latest.key} is running in pid {latest.pid}")
                    if latest.effect:
                        detail = f"interrupted while running in pid {latest.pid}"
                        db.execute(
                            "UPDATE stages SET status='unknown', error=? "
                            "WHERE cve=? AND line=? AND stage=? AND attempt=?",
                            (detail, cve, line, stage, latest.key.attempt),
                        )
                        pause = PausedForReconcile(latest.key, detail)
                if pause is None and latest.status == "running":
                    db.execute(
                        "UPDATE stages SET status='failed', error=?, finished_at=? "
                        "WHERE cve=? AND line=? AND stage=? AND attempt=?",
                        (
                            f"interrupted (pid {latest.pid})",
                            time.time(),
                            cve,
                            line,
                            stage,
                            latest.key.attempt,
                        ),
                    )
            if pause is None:
                # Retry loops replay earlier attempts on resume: any done attempt with
                # the same inputs is a cache hit, not only the latest one.
                hit = db.execute(
                    "SELECT * FROM stages WHERE cve=? AND line=? AND stage=? AND status='done' "
                    "AND input_hash=? ORDER BY attempt DESC LIMIT 1",
                    (cve, line, stage, input_hash),
                ).fetchone()
                if hit is not None:
                    row = self._row(hit)
                    return Cached(row.key, row.output or {})
                key = StageKey(cve, line, stage, attempt)
                db.execute(
                    "INSERT INTO stages (cve, line, stage, attempt, status, effect, run_id, pid, "
                    "input_hash, started_at) VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?, ?)",
                    (
                        cve,
                        line,
                        stage,
                        attempt,
                        int(effect),
                        run_id,
                        self.pid,
                        input_hash,
                        time.time(),
                    ),
                )
        if pause is not None:
            raise pause
        return Proceed(key)

    def _update(self, key: StageKey, **fields: Any) -> None:
        cols = ", ".join(f"{k}=?" for k in fields)
        self.db.execute(
            f"UPDATE stages SET {cols} WHERE cve=? AND line=? AND stage=? AND attempt=?",
            (*fields.values(), key.cve, key.line, key.stage, key.attempt),
        )

    def finish(
        self,
        key: StageKey,
        output: dict[str, Any],
        *,
        cost_usd: float = 0.0,
        span_id: str | None = None,
        trace_id: str | None = None,
    ) -> None:
        self._update(
            key,
            status="done",
            output_json=json.dumps(output, sort_keys=True, default=str),
            output_hash=canonical_hash(output),
            cost_usd=cost_usd,
            span_id=span_id,
            trace_id=trace_id,
            finished_at=time.time(),
        )

    def fail(
        self,
        key: StageKey,
        error: str,
        *,
        cost_usd: float = 0.0,
        span_id: str | None = None,
        trace_id: str | None = None,
    ) -> None:
        self._update(
            key,
            status="failed",
            error=error,
            cost_usd=cost_usd,
            span_id=span_id,
            trace_id=trace_id,
            finished_at=time.time(),
        )

    def mark_unknown(self, key: StageKey, detail: str) -> None:
        self._update(key, status="unknown", error=detail)

    def resolve(
        self, key: StageKey, *, happened: bool, output: dict[str, Any] | None = None
    ) -> None:
        """Settle an ``unknown`` effect after checking the remote.

        ``happened=True`` records it as done with ``output``; ``happened=False``
        records a failed attempt so the next :meth:`begin` starts a new one.
        """
        row = self.db.execute(
            "SELECT status FROM stages WHERE cve=? AND line=? AND stage=? AND attempt=?",
            (key.cve, key.line, key.stage, key.attempt),
        ).fetchone()
        if row is None or row["status"] != "unknown":
            raise LedgerError(f"{key} is not unknown")
        if happened:
            self.finish(key, output or {})
        else:
            self.fail(key, "reconciled: side effect did not happen")

    def unknowns(self, cve: str, line: str) -> list[StageRow]:
        return [r for r in self.stages(cve, line) if r.status == "unknown"]

    def cost_total(self, cve: str, line: str) -> float:
        row = self.db.execute(
            "SELECT COALESCE(SUM(cost_usd), 0) AS c FROM stages WHERE cve=? AND line=?", (cve, line)
        ).fetchone()
        return float(row["c"])

    # detections and events ------------------------------------------------

    def record_hit(
        self,
        run_id: str,
        cve: str,
        line: str,
        stage: str,
        detection: str,
        span_id: str | None,
        trace_id: str | None,
    ) -> None:
        self.db.execute(
            "INSERT INTO detection_hits "
            "(run_id, cve, line, stage, detection, span_id, trace_id, at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (run_id, cve, line, stage, detection, span_id, trace_id, time.time()),
        )

    def hits(self, cve: str | None = None) -> list[sqlite3.Row]:
        if cve is None:
            return list(self.db.execute("SELECT * FROM detection_hits ORDER BY id").fetchall())
        sql = "SELECT * FROM detection_hits WHERE cve=? ORDER BY id"
        return list(self.db.execute(sql, (cve,)).fetchall())

    def event(self, run_id: str, cve: str, line: str, stage: str, kind: str, message: str) -> None:
        self.db.execute(
            "INSERT INTO events (at, run_id, cve, line, stage, kind, message) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (time.time(), run_id, cve, line, stage, kind, message),
        )

    def clear(self, cve: str, line: str) -> None:
        with self._tx() as db:
            for table in ("stages", "runs", "detection_hits", "events"):
                db.execute(f"DELETE FROM {table} WHERE cve=? AND line=?", (cve, line))
