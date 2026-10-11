"""The absent-symbol path (BUILD-BRIEF §10.4, CVE-2026-53878) and distro_revert as C4a.

Synthetic history (add → remove → re-add):

    c0 ── c1 (adds DomainNameValidator) ── c2 (removes it) = M ── l1   (L, the old line)
                                                             └── c3 (re-adds it) ── c4 (fix)

U⁻ = c3, U⁺ = c4. A naive "when was the class added" search finds c1, an ancestor of
the merge base, and would conclude L should have it. Recursive blame on U⁻ finds
the re-add c3, a pure addition after the merge base.
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

import pytest

from heirloom.git_ops import commit_diff, git, is_ancestor, parse_diff, show_file
from heirloom.pipeline.absent import absent_gate, defined_on, missing_name
from heirloom.pipeline.calibrate import fix_symbols, trace_origin
from heirloom.pipeline.presence import (
    Evidence,
    Gate,
    MutantOutcome,
    ProbeRun,
    presence,
)

PATH = "django/core/validators.py"
BASE_SRC = """\
class RegexValidator:
    regex = ""


def validate_email(value):
    return "@" in value
"""
DOMAIN = """

class DomainNameValidator(RegexValidator):
    def __init__(self, **kwargs):
        self.accept_idna = kwargs.pop("accept_idna", True)
        self.regex = "^" + "hostname" + "domain" + "tld" + "$"
"""
IMPORT_ERROR = "ImportError: cannot import name 'DomainNameValidator' from 'django.core.validators'"


def _commit(repo: Path, msg: str, files: dict[str, str | None]) -> str:
    for rel, text in files.items():
        p = repo / rel
        if text is None:
            p.unlink()
        else:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text)
    git(repo, "add", "-A")
    git(repo, "-c", "core.hooksPath=/dev/null", "commit", "-q", "-m", msg)
    return git(repo, "rev-parse", "HEAD").strip()


def _init(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init", "-q", "-b", "main", str(repo)], check=True)
    git(repo, "config", "user.name", "T")
    git(repo, "config", "user.email", "t@example.org")
    return repo


@pytest.fixture
def history(tmp_path: Path) -> dict[str, Any]:
    repo = _init(tmp_path)
    c0 = _commit(repo, "c0", {PATH: BASE_SRC})
    c1 = _commit(repo, "c1: add DomainNameValidator", {PATH: BASE_SRC + DOMAIN})
    m = _commit(repo, "c2: remove DomainNameValidator", {PATH: BASE_SRC})
    git(repo, "branch", "stable", m)
    c3 = _commit(repo, "c3: re-add DomainNameValidator", {PATH: BASE_SRC + DOMAIN})
    fixed = BASE_SRC + DOMAIN.replace('"$"', '"\\\\Z"')
    c4 = _commit(repo, "c4: Fixed CVE-X -- reject newlines", {PATH: fixed})
    git(repo, "checkout", "-q", "stable")
    l1 = _commit(repo, "l1: unrelated change on L", {"django/__init__.py": "VERSION = 1\n"})
    git(repo, "checkout", "-q", "main")
    return {"repo": repo, "c0": c0, "c1": c1, "m": m, "c3": c3, "c4": c4, "l1": l1}


def l_runs(message: str = IMPORT_ERROR, outcome: str = "ERROR") -> list[dict[str, Any]]:
    run = {
        "outcome": outcome,
        "failing_ids": [],
        "skipped_ids": [],
        "details": {},
        "harness_errors": [f"ERROR: hl_cve_x.tests (unittest.loader._FailedTest): {message}"],
    }
    return [run] * 3


def gate(h: dict[str, Any], runs: list[dict[str, Any]] | None = None, tip: str = "") -> Gate:
    repo, tip = h["repo"], tip or h["l1"]
    pairs, mapped = fix_symbols(repo, [h["c4"]], tip)
    loc = {"merge_base": git(repo, "merge-base", h["c3"], tip).strip()}
    return absent_gate(repo, loc, tip, pairs, mapped, runs or l_runs())


def test_add_remove_readd_history_is_proven_absent(history: dict[str, Any]) -> None:
    repo, m = history["repo"], history["m"]
    _, mapped = fix_symbols(repo, [history["c4"]], history["l1"])
    assert [(s.qualname, s.how) for s in mapped] == [("DomainNameValidator.__init__", "absent")]
    assert missing_name(repo, history["l1"], "DomainNameValidator.__init__") == (
        "DomainNameValidator"
    )
    # The trap: the class was first added before the branch point.
    first = git(repo, "log", "--reverse", "--format=%H", "-S", "class DomainNameValidator")
    assert first.split()[0] == history["c1"]
    assert is_ancestor(repo, history["c1"], m)

    g = gate(history)
    assert g.ok, g.detail
    assert history["c3"][:10] in g.detail
    assert history["c1"][:10] not in g.detail


def test_blame_on_u_minus_finds_the_readd_not_the_first_add(history: dict[str, Any]) -> None:
    repo = history["repo"]
    src = show_file(repo, history["c3"], PATH) or ""
    for text in ("class DomainNameValidator(RegexValidator):", '        self.regex = "^" + '):
        n = next(i for i, x in enumerate(src.splitlines(), 1) if x.startswith(text))
        for copies in (False, True):
            o = trace_origin(repo, history["c3"], PATH, n, copies=copies)
            assert o.origin == history["c3"]


def test_error_that_is_not_an_import_error_is_not_absence(history: dict[str, Any]) -> None:
    g = gate(history, l_runs("TypeError: __init__() got an unexpected keyword argument"))
    assert not g.ok and "not an import/attribute error" in g.detail
    g = gate(history, l_runs("ImportError: cannot import name 'URLValidator'"))
    assert not g.ok and "names none of" in g.detail
    g = gate(history, l_runs(outcome="FAIL"))
    assert not g.ok and "needs ERROR" in g.detail


def test_symbol_present_on_l_is_not_absent(history: dict[str, Any]) -> None:
    repo = history["repo"]
    git(repo, "checkout", "-q", "stable")
    tip = _commit(repo, "L gets its own validator", {PATH: BASE_SRC + DOMAIN})
    git(repo, "checkout", "-q", "main")
    g = gate(history, tip=tip)
    assert not g.ok and "mapped on L" in g.detail


def test_symbol_removed_on_l_after_the_branch_point_is_not_proven(tmp_path: Path) -> None:
    """L dropped a class that existed at the merge base: blame ends before the base."""
    repo = _init(tmp_path)
    _commit(repo, "c0", {PATH: BASE_SRC})
    m = _commit(repo, "c1: add DomainNameValidator", {PATH: BASE_SRC + DOMAIN})
    git(repo, "branch", "stable", m)
    fix = _commit(repo, "fix", {PATH: BASE_SRC + DOMAIN.replace('"$"', '"\\\\Z"')})
    git(repo, "checkout", "-q", "stable")
    tip = _commit(repo, "L removes it", {PATH: BASE_SRC})
    pairs, mapped = fix_symbols(repo, [fix], tip)
    g = absent_gate(repo, {"merge_base": m}, tip, pairs, mapped, l_runs())
    assert not g.ok and "an ancestor of" in g.detail


def test_copied_from_code_l_still_has_is_not_proven(tmp_path: Path) -> None:
    """The 'new' class copies its body from a module L has: `blame -C -C` sees it."""
    repo = _init(tmp_path)
    old = (
        "class LegacyHostValidator:\n"
        "    def __init__(self, **kwargs):\n"
        '        self.accept_idna = kwargs.pop("accept_idna", True)\n'
        '        self.regex = "^" + "hostname" + "domain" + "tld" + "$"\n'
    )
    m = _commit(repo, "c0", {PATH: BASE_SRC, "django/core/legacy.py": old})
    git(repo, "branch", "stable", m)
    new = (
        "from django.core.validators import RegexValidator\n\n\n"
        "class DomainNameValidator(RegexValidator):\n"
        "    def __init__(self, **kwargs):\n"
        '        self.accept_idna = kwargs.pop("accept_idna", True)\n'
        '        self.regex = "^" + "hostname" + "domain" + "tld" + "$"\n'
    )
    _commit(repo, "add domain.py", {"django/core/domain.py": new})
    fix = _commit(repo, "fix", {"django/core/domain.py": new.replace('"$"', '"\\\\Z"')})
    git(repo, "checkout", "-q", "stable")
    tip = _commit(repo, "l1", {"django/__init__.py": "VERSION = 1\n"})

    n = new.splitlines().index('        self.regex = "^" + "hostname" + "domain" + "tld" + "$"') + 1
    naive = trace_origin(repo, f"{fix}^", "django/core/domain.py", n)
    copied = trace_origin(repo, f"{fix}^", "django/core/domain.py", n, copies=True)
    assert naive.origin == git(repo, "rev-parse", f"{fix}^").strip()  # looks new
    assert copied.origin == m  # really from legacy.py, which L has

    pairs, mapped = fix_symbols(repo, [fix], tip)
    runs = l_runs("ModuleNotFoundError: No module named 'django.core.domain'; DomainNameValidator")
    g = absent_gate(repo, {"merge_base": m}, tip, pairs, mapped, runs)
    assert not g.ok and "an ancestor of" in g.detail


def test_defined_on_ignores_mentions_in_comments(history: dict[str, Any]) -> None:
    repo = history["repo"]
    git(repo, "checkout", "-q", "stable")
    tip = _commit(
        repo, "mention", {"django/notes.py": "# DomainNameValidator lands in 5.1\nX = 1\n"}
    )
    git(repo, "checkout", "-q", "main")
    assert defined_on(repo, tip, "DomainNameValidator") == []
    assert defined_on(repo, tip, "RegexValidator") == [PATH]


# The verdict table -----------------------------------------------------------------

IDS = frozenset({"hl.tests.T.test_newline"})
FAIL, PASS, ERROR = ProbeRun("FAIL", IDS), ProbeRun("PASS"), ProbeRun("ERROR")
ABSENT_OK = Gate(True, detail="absent on L: DomainNameValidator; …")
ABSENT_NO = Gate(False, None, "L error names none of ['DomainNameValidator']")
NO_REACH = Gate(False, "NO_REACH", "no fix symbol exists in L")


def ev(**kw: Any) -> Evidence:
    base: dict[str, Any] = {
        "um": (FAIL,) * 3,
        "up": (PASS,) * 3,
        "lt": (ERROR,) * 3,
        "reach": NO_REACH,
    }
    return Evidence(**{**base, **kw})


def test_absent_symbol_proves_not_affected_only_with_c1() -> None:
    p = presence(ev(absent=ABSENT_OK))
    assert (p.verdict, p.reason) == ("NOT_AFFECTED_PROVEN", None)
    assert p.gates["absent"].ok
    # No C1: the same absence proves nothing.
    p = presence(ev(up=(FAIL,) * 3, absent=ABSENT_OK))
    assert (p.verdict, p.reason) == ("UNPROVEN", "NON_DISCRIMINATING")


def test_absent_gate_failing_or_missing_stays_probe_error() -> None:
    assert presence(ev(absent=ABSENT_NO)).reason == "PROBE_ERROR"
    assert presence(ev()).reason == "PROBE_ERROR"
    timeout = presence(ev(lt=(ProbeRun("TIMEOUT"),) * 3, absent=ABSENT_OK))
    assert (timeout.verdict, timeout.reason) == ("UNPROVEN", "PROBE_ERROR")
    skip = presence(ev(lt=(ProbeRun("SKIP"),) * 3, absent=ABSENT_OK))
    assert (skip.verdict, skip.reason) == ("UNPROVEN", "ENV_SKIP")


def test_distro_revert_is_the_first_mutant_on_distro_lines() -> None:
    reached = Gate(True, detail="reached f")
    caught = MutantOutcome("distro_revert", True, FAIL, "reverted CVE-X.patch")
    survived = MutantOutcome("distro_revert", True, PASS, "reverted CVE-X.patch")
    reverse = MutantOutcome("reverse_apply", True, FAIL)
    p = presence(ev(lt=(PASS,) * 3, reach=reached, mutants=(caught,)))
    assert (p.verdict, p.detail) == ("NOT_AFFECTED_PROVEN", "distro_revert mutant caught")
    # A surviving distro_revert decides, even if a later mutant would have caught.
    p = presence(ev(lt=(PASS,) * 3, reach=reached, mutants=(survived, reverse)))
    assert (p.verdict, p.reason) == ("UNPROVEN", "MUTANT_SURVIVED")


# Real history (read-only on the Django clone) ------------------------------------

DJANGO = Path.home() / "work" / "django"
FIX_53878 = "d5d60ed0323cddaa0ce0237a26a3d49ac21ee05e"  # 5.2 fix
L_42 = "3396992e837d5146270ea8112bb622c83fa4a919"  # 4.2.30
MERGE_BASE = "9409312eef72d1263dae4b0303523260a54010c5"
ADD_5_1 = "4971a9afe5642569f3dcfcd3972ebb39e88dd457"


def _has(sha: str) -> bool:
    return (DJANGO / ".git").exists() and (
        subprocess.run(
            ["git", "-C", str(DJANGO), "cat-file", "-e", f"{sha}^{{commit}}"], capture_output=True
        ).returncode
        == 0
    )


@pytest.mark.skipif(not _has(FIX_53878), reason="needs ~/work/django with the 5.2 fix")
def test_real_53878_domain_name_validator_is_absent_on_4_2_30() -> None:
    # 4971a9afe5 carries a 2016 *author* date but was committed in 2024 after the
    # branch point: ancestry, not dates, decides.
    dates = git(DJANGO, "log", "-1", "--format=%ad|%cd", "--date=format:%Y", ADD_5_1).strip()
    assert dates == "2016|2024"
    assert is_ancestor(DJANGO, MERGE_BASE, ADD_5_1)
    assert git(DJANGO, "merge-base", f"{FIX_53878}^", L_42).strip() == MERGE_BASE

    pairs, mapped = fix_symbols(DJANGO, [FIX_53878], L_42)
    assert [(m.qualname, m.how) for m in mapped] == [("DomainNameValidator.__init__", "absent")]
    assert parse_diff(commit_diff(DJANGO, FIX_53878, "django/"))[0].path == PATH
    g = absent_gate(DJANGO, {"merge_base": MERGE_BASE}, L_42, pairs, mapped, l_runs())
    assert g.ok, g.detail
    assert ADD_5_1[:10] in g.detail


def test_no_porter_retry_when_no_fix_symbol_exists_on_l() -> None:
    from heirloom.pipeline.calibrate import feedback_for
    from heirloom.pipeline.presence import Presence

    runs = [{"outcome": "FAIL", "details": {}, "harness_errors": []}]
    cal: dict[str, Any] = {"um": runs, "up": runs, "lt": runs}
    c1 = {"C1": Gate(True)}
    no_reach = Presence("UNPROVEN", "NO_REACH", c1, "no fix symbol exists in L")
    error_on_l = Presence("UNPROVEN", "PROBE_ERROR", c1, "probe ERROR/TIMEOUT on L")
    absent = [{"how": "absent", "qualname": "DomainNameValidator.__init__"}]
    present = [*absent, {"how": "same-path", "qualname": "URLValidator.__call__"}]
    for verdict in (no_reach, error_on_l):
        assert feedback_for({**cal, "mapped": absent}, verdict) is None
        assert feedback_for({**cal, "mapped": present}, verdict) is not None
    # Without C1 the probe itself is broken on U⁻/U⁺: the porter still gets feedback.
    no_c1 = Presence("UNPROVEN", "NON_DISCRIMINATING", {"C1": Gate(False)}, "no FAIL on U⁻")
    assert feedback_for({**cal, "mapped": absent}, no_c1) is not None
