"""Run Django's ``tests/runtests.py`` in a worktree and classify the outcome.

Outcome classes: PASS / FAIL / ERROR / SKIP / TIMEOUT. FAIL means an
AssertionError and nothing else: any error, crash, import failure, mismatch
between the parsed sections and unittest's own summary, or unparseable output
is ERROR. An ERROR never counts as a FAIL.

Every run asserts in-process that ``django.__file__`` lives inside the worktree;
a wrong tree raises :class:`WrongTreeError` rather than producing an outcome.
"""

from __future__ import annotations

import json
import os
import re
import signal
import subprocess
import tempfile
import time
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

Outcome = Literal["PASS", "FAIL", "ERROR", "SKIP", "TIMEOUT"]

SHIM = Path(__file__).with_name("_runtests_shim.py")
RCFILE = Path(__file__).with_name("coveragerc")
WRONG_TREE_EXIT = 97
DJANGO_FILE_MARK = "HEIRLOOM_DJANGO_FILE="

_ID = r"(?P<name>\w+) \((?P<id>[\w.]+)\)"
_STATUS = r"(?P<status>ok|FAIL|ERROR|skipped(?: .*)?|expected failure|unexpected success)"
STATUS_LINE = re.compile(rf"^{_ID} \.\.\. {_STATUS}$")
ID_ONLY_LINE = re.compile(rf"^{_ID}$")
TRAILING_STATUS = re.compile(rf"^.* \.\.\. {_STATUS}$")
SECTION = re.compile(rf"^(?P<kind>FAIL|ERROR): {_ID}(?: \((?P<sub>.*)\))?$")
RAN = re.compile(r"^Ran (?P<n>\d+) tests? in [\d.]+s$")
SUMMARY = re.compile(r"^(?P<word>OK|FAILED)(?: \((?P<counts>[^)]*)\))?$")
ASSERTION = re.compile(r"^(?:[\w.]+\.)?\w*AssertionError\b")

_STATUS_MAP: dict[str, Outcome] = {
    "ok": "PASS",
    "FAIL": "FAIL",
    "ERROR": "ERROR",
    "expected failure": "ERROR",
    "unexpected success": "ERROR",
}


class WrongTreeError(RuntimeError):
    pass


@dataclass(frozen=True)
class TestOutcome:
    outcome: Outcome
    detail: str = ""


@dataclass
class RunResult:
    outcome: Outcome
    tests: dict[str, TestOutcome]
    ran: int
    summary: str
    harness_errors: list[str] = field(default_factory=list)
    reason: str = ""
    returncode: int | None = None
    seconds: float = 0.0
    django_file: str = ""
    log_path: Path | None = None
    coverage: dict[str, set[int]] = field(default_factory=dict)

    def ids(self, outcome: Outcome) -> frozenset[str]:
        return frozenset(t for t, o in self.tests.items() if o.outcome == outcome)

    @property
    def failing_ids(self) -> frozenset[str]:
        return self.ids("FAIL")

    @property
    def error_ids(self) -> frozenset[str]:
        return self.ids("ERROR")

    @property
    def skipped_ids(self) -> frozenset[str]:
        return self.ids("SKIP")

    def to_json(self) -> dict[str, object]:
        return {
            "outcome": self.outcome,
            "ran": self.ran,
            "summary": self.summary,
            "reason": self.reason,
            "harness_errors": self.harness_errors,
            "failing_ids": sorted(self.failing_ids),
            "error_ids": sorted(self.error_ids),
            "skipped_ids": sorted(self.skipped_ids),
            "tests": {k: [v.outcome, v.detail] for k, v in sorted(self.tests.items())},
            "seconds": round(self.seconds, 2),
            "django_file": self.django_file,
            "log": str(self.log_path) if self.log_path else None,
        }


def _section_details(lines: Sequence[str]) -> list[tuple[str, str, str, str]]:
    """Return (kind, name, id, exception line) for each FAIL/ERROR section."""
    out: list[tuple[str, str, str, str]] = []
    starts = [i for i, line in enumerate(lines) if SECTION.match(line)]
    for n, start in enumerate(starts):
        m = SECTION.match(lines[start])
        assert m is not None
        end = starts[n + 1] if n + 1 < len(starts) else len(lines)
        block = lines[start + 1 : end]
        # The exception is the first unindented line after the last traceback header
        # (the last one wins for chained exceptions); assertion diffs follow it.
        tb = [k for k, text in enumerate(block) if text.startswith("Traceback (most recent")]
        exc = ""
        if tb:
            for text in block[tb[-1] + 1 :]:
                if text and not text.startswith(" "):
                    exc = text
                    break
        out.append((m["kind"], m["name"], m["id"], exc))
    return out


def _counts(text: str | None) -> dict[str, int]:
    counts: dict[str, int] = {}
    for part in (text or "").split(","):
        if "=" in part:
            k, v = part.strip().split("=", 1)
            counts[k.strip()] = int(v)
    return counts


def classify(stderr: str, *, returncode: int | None, timed_out: bool = False) -> RunResult:
    """Classify unittest ``-v 2`` output (stderr of runtests.py)."""
    lines = stderr.splitlines()
    tests: dict[str, TestOutcome] = {}
    pending: str | None = None
    for line in lines:
        m = STATUS_LINE.match(line)
        if m:
            tests[m["id"]] = TestOutcome(_status(m["status"]), _skip_reason(m["status"]))
            pending = None
            continue
        m = ID_ONLY_LINE.match(line)
        if m and m["name"].startswith("test"):
            pending = m["id"]
            continue
        if pending:
            t = TRAILING_STATUS.match(line)
            if t:
                tests[pending] = TestOutcome(_status(t["status"]), _skip_reason(t["status"]))
                pending = None

    harness_errors: list[str] = []
    n_fail = n_error = 0
    for kind, name, test_id, exc in _section_details(lines):
        is_test = name.startswith("test") and "unittest.loader." not in test_id
        if kind == "FAIL":
            n_fail += 1
        else:
            n_error += 1
        if not is_test:
            harness_errors.append(f"{kind}: {name} ({test_id}): {exc}")
            continue
        if kind == "FAIL" and ASSERTION.match(exc):
            if tests.get(test_id, TestOutcome("PASS")).outcome != "ERROR":
                tests[test_id] = TestOutcome("FAIL", exc)
        else:
            # An ERROR, or a FAIL that is not an AssertionError, is never a FAIL.
            tests[test_id] = TestOutcome("ERROR", exc or kind)

    ran_n = -1
    summary = ""
    summary_counts: dict[str, int] = {}
    for line in lines:
        r = RAN.match(line)
        if r:
            ran_n = int(r["n"])
        s = SUMMARY.match(line)
        if s and ran_n >= 0:
            summary = line
            summary_counts = _counts(s["counts"])

    def result(outcome: Outcome, reason: str = "") -> RunResult:
        return RunResult(
            outcome=outcome,
            tests=tests,
            ran=max(ran_n, 0),
            summary=summary,
            harness_errors=harness_errors,
            reason=reason,
            returncode=returncode,
        )

    if timed_out:
        return result("TIMEOUT", "timed out")
    if ran_n < 0 or not summary:
        return result("ERROR", "no unittest summary (crash or import failure)")
    if ran_n == 0:
        return result("ERROR", "no tests ran")
    if summary_counts.get("failures", 0) != n_fail or summary_counts.get("errors", 0) != n_error:
        return result("ERROR", f"sections ({n_fail}F/{n_error}E) disagree with '{summary}'")
    if summary.startswith("OK") != (returncode == 0):
        return result("ERROR", f"summary '{summary}' disagrees with exit code {returncode}")
    if harness_errors or any(t.outcome == "ERROR" for t in tests.values()):
        return result("ERROR", "errors present")
    if any(t.outcome == "FAIL" for t in tests.values()):
        return result("FAIL")
    if tests and all(t.outcome == "SKIP" for t in tests.values()):
        return result("SKIP", "all tests skipped")
    return result("PASS")


def _status(status: str) -> Outcome:
    return "SKIP" if status.startswith("skipped") else _STATUS_MAP[status]


def _skip_reason(status: str) -> str:
    return status[len("skipped ") :].strip("'") if status.startswith("skipped ") else ""


@dataclass(frozen=True)
class Runner:
    python: Path
    timeout: float = 900.0
    extra_pythonpath: tuple[Path, ...] = ()

    def run(
        self,
        worktree: Path,
        labels: Sequence[str],
        *,
        log_path: Path,
        extra_args: Sequence[str] = (),
        coverage_include: Sequence[Path] = (),
    ) -> RunResult:
        wt = worktree.resolve()
        log_path.parent.mkdir(parents=True, exist_ok=True)
        env = {k: v for k, v in os.environ.items() if k not in ("PYTHONPATH", "VIRTUAL_ENV")}
        env["PYTHONPATH"] = os.pathsep.join([str(wt), *map(str, self.extra_pythonpath)])
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        args = [*labels, "--parallel=1", "-v", "2", *extra_args]
        cov_file: Path | None = None
        if coverage_include:
            fd, name = tempfile.mkstemp(prefix="hl-cov-", dir=log_path.parent)
            os.close(fd)
            cov_file = Path(name)
            include = ",".join(str(p.resolve()) for p in coverage_include)
            cmd = [
                str(self.python),
                "-m",
                "coverage",
                "run",
                f"--rcfile={RCFILE}",
                f"--data-file={cov_file}",
                f"--include={include}",
                str(SHIM),
                str(wt),
                *args,
            ]
        else:
            cmd = [str(self.python), str(SHIM), str(wt), *args]
        start = time.monotonic()
        proc = subprocess.Popen(
            cmd,
            cwd=wt / "tests",
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            start_new_session=True,
        )
        timed_out = False
        try:
            out, err = proc.communicate(timeout=self.timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            os.killpg(proc.pid, signal.SIGKILL)
            out, err = proc.communicate()
        seconds = time.monotonic() - start
        log_path.write_text(
            f"$ {' '.join(cmd)}\n# cwd={wt / 'tests'} PYTHONPATH={env['PYTHONPATH']}\n"
            f"# exit={proc.returncode} seconds={seconds:.1f}\n"
            f"--- stdout ---\n{out}\n--- stderr ---\n{err}"
        )
        if proc.returncode == WRONG_TREE_EXIT or DJANGO_FILE_MARK not in out:
            raise WrongTreeError(f"django is not imported from {wt}; see {log_path}")
        django_file = out.split(DJANGO_FILE_MARK, 1)[1].splitlines()[0].strip()
        if not django_file.startswith(str(wt) + os.sep):
            raise WrongTreeError(f"django imported from {django_file}, expected inside {wt}")
        res = classify(err, returncode=proc.returncode, timed_out=timed_out)
        res.seconds = seconds
        res.django_file = django_file
        res.log_path = log_path
        if cov_file is not None:
            res.coverage = self._coverage(cov_file, wt)
            for suffix in ("", ".json"):
                Path(f"{cov_file}{suffix}").unlink(missing_ok=True)
        return res

    def _coverage(self, data_file: Path, wt: Path) -> dict[str, set[int]]:
        json_path = Path(f"{data_file}.json")
        subprocess.run(
            [
                str(self.python),
                "-m",
                "coverage",
                "json",
                "-q",
                f"--rcfile={RCFILE}",
                f"--data-file={data_file}",
                "-o",
                str(json_path),
            ],
            check=True,
            capture_output=True,
            cwd=wt,
        )
        files = json.loads(json_path.read_text())["files"]
        out: dict[str, set[int]] = {}
        root = wt.resolve()
        for name, data in files.items():
            path = Path(name) if Path(name).is_absolute() else wt / name
            try:
                rel = path.resolve().relative_to(root)
            except ValueError:
                continue
            out[rel.as_posix()] = set(data["executed_lines"])
        return out
