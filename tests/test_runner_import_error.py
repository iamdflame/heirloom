"""A probe module that fails to import is ERROR with its ImportError recorded (§10.4)."""

from heirloom.verify.runner import classify

# Recorded from the CVE-2026-53878 probe on 4.2.30 (paths shortened).
IMPORT_FAILURE = """\
hl_cve_2026_53878.tests (unittest.loader._FailedTest.hl_cve_2026_53878.tests) ... ERROR

======================================================================
ERROR: hl_cve_2026_53878.tests (unittest.loader._FailedTest.hl_cve_2026_53878.tests)
----------------------------------------------------------------------
ImportError: Failed to import test module: hl_cve_2026_53878.tests
Traceback (most recent call last):
  File "/usr/lib/python3.12/unittest/loader.py", line 396, in _find_test_path
    module = self._get_module_from_name(name)
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/usr/lib/python3.12/unittest/loader.py", line 339, in _get_module_from_name
    __import__(name)
  File "/wt/L/tests/hl_cve_2026_53878/tests.py", line 1, in <module>
    from django.core.validators import DomainNameValidator, validate_domain_name
ImportError: cannot import name 'DomainNameValidator' from 'django.core.validators' (/x.py)


----------------------------------------------------------------------
Ran 1 test in 0.000s

FAILED (errors=1)
"""


def test_failed_import_is_a_harness_error_with_its_message() -> None:
    r = classify(IMPORT_FAILURE, returncode=1)
    assert r.outcome == "ERROR"
    assert r.reason == "errors present"  # no longer "sections disagree with summary"
    assert r.failing_ids == frozenset()
    (err,) = r.harness_errors
    assert err.startswith("ERROR: hl_cve_2026_53878.tests (unittest.loader._FailedTest.")
    assert "ImportError: cannot import name 'DomainNameValidator'" in err
