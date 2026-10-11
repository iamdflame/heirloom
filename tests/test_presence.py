"""The calibration verdict table (BUILD-BRIEF §3.4 with the §9 fixes)."""

from heirloom.pipeline.presence import (
    Evidence,
    Gate,
    MutantOutcome,
    ProbeRun,
    presence,
)

IDS = frozenset({"hl.tests.Probe.test_a", "hl.tests.Probe.test_b"})
FAIL = ProbeRun("FAIL", IDS)
PASS = ProbeRun("PASS")
ERROR = ProbeRun("ERROR")
REACHED = Gate(True, detail="reached save_existing_objects")
NOT_REACHED = Gate(False, "NO_REACH", "probe never executed save_existing_objects")
NO_PROVENANCE = Gate(False, None, "traces to an ancestor of the merge base")


def ev(
    um: ProbeRun = FAIL,
    up: ProbeRun = PASS,
    lt: ProbeRun = FAIL,
    reach: Gate = REACHED,
    mutants: tuple[MutantOutcome, ...] = (),
    provenance: Gate | None = None,
) -> Evidence:
    return Evidence((um,) * 3, (up,) * 3, (lt,) * 3, reach, mutants, provenance)


def test_affected_requires_same_failing_ids_as_um() -> None:
    p = presence(ev())
    assert (p.verdict, p.reason) == ("AFFECTED", None)
    assert p.calibrated


def test_fail_with_different_ids_is_mismatch() -> None:
    p = presence(ev(lt=ProbeRun("FAIL", frozenset({"hl.tests.Probe.test_a"}))))
    assert (p.verdict, p.reason) == ("UNPROVEN", "FAIL_MISMATCH")


def test_fail_without_reach_is_unproven() -> None:
    assert presence(ev(reach=NOT_REACHED)).reason == "NO_REACH"


def test_weakened_probe_on_vulnerable_line_is_unproven() -> None:
    """A probe that discriminates on U⁻/U⁺ but misses L's (still vulnerable) code path.

    It PASSes on L, the reverse-applied fix and the transplant do not build, and
    the added-condition mutant builds but the weak probe cannot see it. Provenance
    traces the changed line to a pre-branch commit. Must never be NOT_AFFECTED_PROVEN.
    """
    mutants = (
        MutantOutcome("reverse_apply", False, detail="conflicts with L"),
        MutantOutcome("added_condition", True, PASS, "dropped obj._state.adding"),
        MutantOutcome("transplant", True, ERROR, "AttributeError: _is_pk_set"),
    )
    p = presence(ev(lt=PASS, mutants=mutants, provenance=NO_PROVENANCE))
    assert (p.verdict, p.reason) == ("UNPROVEN", "MUTANT_SURVIVED")
    assert not p.calibrated


def test_weakened_probe_with_only_unbuildable_mutants_is_unproven() -> None:
    mutants = (
        MutantOutcome("reverse_apply", False, detail="conflicts with L"),
        MutantOutcome("added_condition", False, detail="operand not in L"),
        MutantOutcome("transplant", True, ERROR, "AttributeError: _is_pk_set"),
    )
    p = presence(ev(lt=PASS, mutants=mutants, provenance=NO_PROVENANCE))
    assert (p.verdict, p.reason) == ("UNPROVEN", "MUTANT_UNBUILDABLE")


def test_mutant_error_is_not_a_catch() -> None:
    p = presence(ev(lt=PASS, mutants=(MutantOutcome("transplant", True, ERROR),)))
    assert p.verdict == "UNPROVEN"


def test_not_affected_proven_by_caught_mutant() -> None:
    mutants = (
        MutantOutcome("reverse_apply", False, detail="conflicts"),
        MutantOutcome("added_condition", True, FAIL, "dropped obj._state.adding"),
    )
    p = presence(ev(lt=PASS, mutants=mutants))
    assert (p.verdict, p.reason) == ("NOT_AFFECTED_PROVEN", None)


def test_first_working_mutant_decides() -> None:
    mutants = (
        MutantOutcome("reverse_apply", True, PASS, "applied cleanly"),
        MutantOutcome("added_condition", True, FAIL),
    )
    assert presence(ev(lt=PASS, mutants=mutants)).reason == "MUTANT_SURVIVED"


def test_caught_mutant_without_reach_is_not_enough() -> None:
    mutants = (MutantOutcome("reverse_apply", True, FAIL),)
    p = presence(ev(lt=PASS, reach=NOT_REACHED, mutants=mutants))
    assert (p.verdict, p.reason) == ("UNPROVEN", "NO_REACH")


def test_recursive_provenance_alone_proves() -> None:
    p = presence(ev(lt=PASS, reach=NOT_REACHED, provenance=Gate(True, detail="post-branch")))
    assert p.verdict == "NOT_AFFECTED_PROVEN"


def test_non_discriminating_probes() -> None:
    assert presence(ev(um=PASS)).reason == "NON_DISCRIMINATING"
    assert presence(ev(up=FAIL)).reason == "NON_DISCRIMINATING"


def test_probe_errors_and_skips() -> None:
    assert presence(ev(um=ERROR)).reason == "PROBE_ERROR"
    assert presence(ev(lt=ERROR)).reason == "PROBE_ERROR"
    assert presence(ev(lt=ProbeRun("TIMEOUT"))).reason == "PROBE_ERROR"
    assert presence(ev(lt=ProbeRun("FAIL", IDS, frozenset({"x"})))).reason == "ENV_SKIP"


def test_flaky_across_runs() -> None:
    flaky_l = Evidence((FAIL,) * 3, (PASS,) * 3, (FAIL, PASS, FAIL), REACHED)
    assert presence(flaky_l).reason == "FLAKY"
    unstable_ids = Evidence(
        (FAIL, ProbeRun("FAIL", frozenset({"hl.tests.Probe.test_a"})), FAIL),
        (PASS,) * 3,
        (FAIL,) * 3,
        REACHED,
    )
    assert presence(unstable_ids).reason == "FLAKY"
