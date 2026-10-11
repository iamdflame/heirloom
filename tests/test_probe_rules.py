import pytest

from heirloom.pipeline.probe import (
    L_SOURCE_HEADER,
    LeakageError,
    assert_no_leak,
    leak_surface,
    parse_blocks,
    validate,
)

APP = "hl_cve_2026_87975"
MODELS = (
    "from django.db import models\n\n\n"
    "class Item(models.Model):\n"
    "    code = models.CharField(max_length=5, primary_key=True)\n"
)
TESTS = (
    "from django.forms import modelformset_factory\n"
    "from django.test import TestCase\n\n"
    "from .models import Item\n\n\n"
    "class Probe(TestCase):\n"
    "    def test_forged_delete(self):\n"
    "        self.assertTrue(Item.objects.count() == 0)\n"
)


def test_valid_probe_with_relative_models_import() -> None:
    assert validate({"models.py": MODELS, "tests.py": TESTS}, APP) == []


@pytest.mark.parametrize(
    ("snippet", "problem"),
    [
        (
            "from django.utils.translation import trans_real\nx = trans_real._cache\n",
            "private attribute",
        ),
        ("from django.utils.translation.trans_real import _get_supported\n", "private name"),
        ("import time\nt = time.time()\n", "unexpected import time"),
        ("from unittest import skip\n@skip('x')\ndef f():\n    pass\n", "skips"),
        ("from .views import x\n", "relative import"),
        ("import requests\n", "unexpected import requests"),
        ("import socket\n", "unexpected import socket"),
        ("from urllib.request import urlopen\n", "unexpected import from urllib.request"),
        ("import subprocess\n", "unexpected import subprocess"),
        ("from tests.model_formsets.models import Author\n", "unexpected import from tests"),
    ],
)
def test_rejected_constructs(snippet: str, problem: str) -> None:
    problems = validate({"models.py": MODELS, "tests.py": TESTS + "\n" + snippet}, APP)
    assert any(problem in p for p in problems), problems


def test_parse_blocks() -> None:
    text = f"### models.py\n```python\n{MODELS}```\n### tests.py\n```python\n{TESTS}```\n"
    assert parse_blocks(text) == {"models.py": MODELS, "tests.py": TESTS}


def test_leakage_guard_trips_on_fix_lines() -> None:
    added = ["if not obj._is_pk_set() or obj._state.adding:"]
    assert assert_no_leak("advisory text only", added) == 1
    with pytest.raises(LeakageError):
        assert_no_leak("...\n    if not obj._is_pk_set() or   obj._state.adding:\n", added)


def test_leakage_guard_ignores_a_prefix_of_an_unchanged_line() -> None:
    """CVE-2026-1287's fix splits `FORBIDDEN_ALIAS_PATTERN = _lazy_re_compile(r"…")` over
    several lines; L's untouched line legitimately contains the new first line as a prefix."""
    added = ["FORBIDDEN_ALIAS_PATTERN = _lazy_re_compile("]
    l_source = 'FORBIDDEN_ALIAS_PATTERN = _lazy_re_compile(r"[\'`\\"\\]\\[;\\s]|#|--")\n'
    assert assert_no_leak(l_source, added) == 1


def test_leak_surface_skips_l_source_but_keeps_feedback() -> None:
    added = ["except FileExistsError:"]
    prompt = (
        "## Advisory\ntext\n"
        f"{L_SOURCE_HEADER}\n```python\ntry:\n    pass\nexcept FileExistsError:\n```\n"
        "## Upstream test models (Django 4.2)\n(none)\n"
    )
    assert assert_no_leak(leak_surface(prompt), added) == 1
    leaky = prompt + "\n## Feedback on your previous probe\nexcept FileExistsError:\n"
    with pytest.raises(LeakageError):
        assert_no_leak(leak_surface(leaky), added)


def test_filesystem_and_parsing_stdlib_modules_are_allowed() -> None:
    """CVE-2026-25674 (file permissions): the porter needs os/stat/shutil/tempfile."""
    extra = (
        "import os\nimport shutil\nimport stat\nimport tempfile\nfrom pathlib import Path\n"
        "from urllib.parse import quote\nfrom unittest import mock\n"
    )
    assert validate({"models.py": MODELS, "tests.py": extra + TESTS}, APP) == []


def test_fix_lines_the_upstream_test_diff_shows_are_not_leaks() -> None:
    from heirloom.pipeline.probe import guarded_lines

    test_diff = (
        "--- a/tests/cache/tests.py\n+++ b/tests/cache/tests.py\n"
        "@@ -1,3 +1,4 @@\n from django.utils.cache import (\n+    patch_vary_headers,\n"
    )
    added = ["patch_vary_headers,", 'patch_vary_headers(response, ("Authorization",))']
    assert guarded_lines(added, test_diff) == ['patch_vary_headers(response, ("Authorization",))']
