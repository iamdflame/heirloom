import sys
from pathlib import Path

import pytest

from heirloom.verify.runner import Runner, WrongTreeError, classify

RUNS = Path(__file__).parent / "fixtures" / "runs"
WORK = Path.home() / "heirloom" / "work"
TEST_PYTHON = WORK / "venv-django" / "bin" / "python"


def fixture(name: str) -> str:
    return (RUNS / name).read_text()


SEP = "=" * 70
DASH = "-" * 70


def synth(status_lines: list[str], sections: list[str], ran: int, summary: str) -> str:
    return "\n".join(
        [*status_lines, "", *sections, DASH, f"Ran {ran} tests in 0.010s", "", summary]
    )


def section(kind: str, test: str, exc: str, sub: str = "") -> str:
    name = test.rsplit(".", 1)[1]
    header = f"{kind}: {name} ({test})" + (f" ({sub})" if sub else "")
    return "\n".join(
        [
            SEP,
            header,
            DASH,
            "Traceback (most recent call last):",
            '  File "/WT/tests/x/tests.py", line 3, in t',
            "    do()",
            exc,
            "",
        ]
    )


# Real runs ------------------------------------------------------------------


def test_probe_failing_on_vulnerable_tree_is_fail() -> None:
    res = classify(fixture("probe_87975_L_fail.log"), returncode=1)
    assert res.outcome == "FAIL"
    assert res.failing_ids == {
        "hl_cve_2026_87975.tests.FormsetForgeryProbe.test_delete_outside_queryset_editable_pk",
        "hl_cve_2026_87975.tests.FormsetForgeryProbe.test_delete_outside_queryset_inline_pk_parent_link",
        "hl_cve_2026_87975.tests.FormsetForgeryProbe.test_initial_form_cannot_create_editable_pk",
    }
    assert res.ran == 3


def test_upstream_tests_referencing_fix_internals_are_error_not_fail() -> None:
    res = classify(fixture("upstream_77050_Um_error.log"), returncode=1)
    assert res.outcome == "ERROR"
    assert res.failing_ids == frozenset()
    assert len(res.error_ids) == 2
    assert all("AttributeError" in res.tests[t].detail for t in res.error_ids)


def test_transplanted_mutant_attribute_error_is_error() -> None:
    res = classify(fixture("probe_87975_c4b_error.log"), returncode=1)
    assert res.outcome == "ERROR"
    assert res.failing_ids == frozenset()


def test_passing_probe_is_pass() -> None:
    assert classify(fixture("probe_77050_Up_pass.log"), returncode=0).outcome == "PASS"


def test_skips_and_docstring_status_lines() -> None:
    res = classify(fixture("i18n_L_skips.log"), returncode=0)
    assert res.outcome == "PASS"
    assert res.ran == 232
    assert len(res.skipped_ids) == 83
    # Status on the line after a docstring is attributed to the right test.
    assert res.tests["i18n.patterns.tests.URLVaryAcceptLanguageTests.test_en_redirect"].outcome == (
        "PASS"
    )


def test_env_baseline_with_failures_and_errors_is_error_but_keeps_ids() -> None:
    res = classify(fixture("gis_L_env_failures.log"), returncode=1)
    assert res.outcome == "ERROR"
    assert {t.rsplit(".", 1)[1] for t in res.failing_ids} == {
        "test02_wktwriter",
        "test_wkt_writer_precision",
        "test_wkt_writer_trim",
    }
    assert len(res.error_ids) == 4


# Synthetic edge cases ---------------------------------------------------------

T1 = "app.tests.T.test_one"
T2 = "app.tests.T.test_two"


def test_error_never_counts_as_fail_even_alongside_fails() -> None:
    out = synth(
        [f"test_one ({T1}) ... FAIL", f"test_two ({T2}) ... ERROR"],
        [section("FAIL", T1, "AssertionError: 1 != 2"), section("ERROR", T2, "KeyError: 'x'")],
        2,
        "FAILED (failures=1, errors=1)",
    )
    res = classify(out, returncode=1)
    assert res.outcome == "ERROR"
    assert res.failing_ids == {T1}
    assert res.error_ids == {T2}


def test_fail_section_without_assertion_error_is_error() -> None:
    out = synth(
        [f"test_one ({T1}) ... FAIL"],
        [section("FAIL", T1, "RuntimeError: boom")],
        1,
        "FAILED (failures=1)",
    )
    res = classify(out, returncode=1)
    assert res.outcome == "ERROR"
    assert res.error_ids == {T1}


def test_multiline_assertion_diff_is_still_fail() -> None:
    exc = "AssertionError: 'POINT (5 23)' != 'POINT (5.0 23.0)'\n- POINT (5 23)\n+ POINT (5.0 23.0)"
    out = synth([f"test_one ({T1}) ... FAIL"], [section("FAIL", T1, exc)], 1, "FAILED (failures=1)")
    assert classify(out, returncode=1).outcome == "FAIL"


def test_subtest_failures_count_per_subtest() -> None:
    out = synth(
        [f"test_one ({T1}) ... FAIL"],
        [
            section("FAIL", T1, "AssertionError: a", sub="length=501"),
            section("FAIL", T1, "AssertionError: b", sub="length=90000"),
        ],
        1,
        "FAILED (failures=2)",
    )
    res = classify(out, returncode=1)
    assert res.outcome == "FAIL"
    assert res.failing_ids == {T1}


def test_bracketed_subtest_messages_are_parsed() -> None:
    """Python 3.12 prints subTest(msg) as `FAIL: test_x (id) [msg]`; msg can be anything."""
    sections = [
        section("FAIL", T1, "AssertionError: a").replace(f"({T1})", f'({T1}) [x" from t; --]'),
        section("FAIL", T1, "AssertionError: b").replace(f"({T1})", f"({T1}) [name\x1b]"),
    ]
    out = synth([f"test_one ({T1}) ... FAIL"], sections, 1, "FAILED (failures=2)")
    res = classify(out, returncode=1)
    assert res.outcome == "FAIL"
    assert res.failing_ids == {T1}


def test_import_failure_of_probe_app_is_error() -> None:
    failed = "unittest.loader._FailedTest.hl_cve_x"
    out = synth(
        [f"hl_cve_x ({failed}) ... ERROR"],
        [section("ERROR", failed, "ImportError: cannot import name 'Foo'")],
        1,
        "FAILED (errors=1)",
    )
    res = classify(out, returncode=1)
    assert res.outcome == "ERROR"
    assert res.harness_errors and "ImportError" in res.harness_errors[0]


def test_setupclass_error_is_error() -> None:
    out = synth(
        [f"test_one ({T1}) ... ok"],
        [section("ERROR", "app.tests.T.setUpClass", "OperationalError: no such table")],
        1,
        "FAILED (errors=1)",
    )
    assert classify(out, returncode=1).outcome == "ERROR"


def test_crash_without_summary_is_error() -> None:
    res = classify("Traceback (most recent call last):\nSegmentation fault", returncode=-11)
    assert res.outcome == "ERROR"
    assert "summary" in res.reason


def test_section_counts_disagreeing_with_summary_is_error() -> None:
    out = synth([f"test_one ({T1}) ... FAIL"], [], 1, "FAILED (failures=1)")
    assert classify(out, returncode=1).outcome == "ERROR"


def test_ok_summary_with_nonzero_exit_is_error() -> None:
    out = synth([f"test_one ({T1}) ... ok"], [], 1, "OK")
    assert classify(out, returncode=1).outcome == "ERROR"


def test_all_skipped_is_skip_and_timeout_is_timeout() -> None:
    out = synth([f"test_one ({T1}) ... skipped 'needs gettext'"], [], 1, "OK (skipped=1)")
    res = classify(out, returncode=0)
    assert res.outcome == "SKIP"
    assert res.tests[T1].detail == "needs gettext"
    assert classify(out, returncode=0, timed_out=True).outcome == "TIMEOUT"


def test_zero_tests_is_error() -> None:
    assert classify(synth([], [], 0, "OK"), returncode=0).outcome == "ERROR"


# Wrong-tree guard -------------------------------------------------------------


def test_django_from_another_tree_raises(tmp_path: Path) -> None:
    worktree = tmp_path / "wt"
    (worktree / "tests").mkdir(parents=True)
    elsewhere = tmp_path / "elsewhere"
    (elsewhere / "django").mkdir(parents=True)
    (elsewhere / "django" / "__init__.py").write_text("")
    runner = Runner(python=Path(sys.executable), timeout=60, extra_pythonpath=(elsewhere,))
    with pytest.raises(WrongTreeError):
        runner.run(worktree, ["x"], log_path=tmp_path / "run.log")


def test_missing_django_raises(tmp_path: Path) -> None:
    worktree = tmp_path / "wt"
    (worktree / "tests").mkdir(parents=True)
    with pytest.raises(WrongTreeError):
        Runner(python=Path(sys.executable), timeout=60).run(
            worktree, ["x"], log_path=tmp_path / "run.log"
        )


@pytest.mark.skipif(
    not (TEST_PYTHON.exists() and (WORK / "wt" / "L" / "tests" / "hl_cve_2026_87975").exists()),
    reason="needs the spike worktree and test venv",
)
def test_real_run_on_42_worktree(tmp_path: Path) -> None:
    res = Runner(python=TEST_PYTHON, timeout=300).run(
        WORK / "wt" / "L", ["hl_cve_2026_87975"], log_path=tmp_path / "run.log"
    )
    assert res.outcome == "FAIL"
    assert len(res.failing_ids) == 3
    assert res.django_file == str((WORK / "wt" / "L" / "django" / "__init__.py").resolve())


@pytest.mark.skipif(
    not (TEST_PYTHON.exists() and (WORK / "wt" / "L" / "tests" / "hl_cve_2026_87975").exists()),
    reason="needs the spike worktree and test venv",
)
def test_coverage_is_limited_to_include_and_keyed_relative_to_worktree(tmp_path: Path) -> None:
    """Django's tests/.coveragerc sets `source = django`, which must not override --include."""
    wt = WORK / "wt" / "L"
    res = Runner(python=TEST_PYTHON, timeout=300).run(
        wt,
        ["hl_cve_2026_87975"],
        log_path=tmp_path / "run.log",
        coverage_include=[wt / "django" / "forms" / "models.py"],
    )
    assert list(res.coverage) == ["django/forms/models.py"]
    # save_existing_objects body on 4.2.30 is lines 910-933.
    assert res.coverage["django/forms/models.py"] & set(range(910, 934))


@pytest.mark.skipif(
    not (TEST_PYTHON.exists() and (WORK / "wt" / "L" / "tests" / "hl_cve_2026_87975").exists()),
    reason="needs the spike worktree and test venv",
)
def test_coverage_of_a_file_the_run_never_imports_is_empty(tmp_path: Path) -> None:
    wt = WORK / "wt" / "L"
    res = Runner(python=TEST_PYTHON, timeout=300).run(
        wt,
        ["hl_cve_2026_87975"],
        log_path=tmp_path / "run.log",
        coverage_include=[wt / "django" / "contrib" / "gis" / "gdal" / "raster" / "source.py"],
    )
    assert res.outcome == "FAIL"
    assert res.coverage == {}
