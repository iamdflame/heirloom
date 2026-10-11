from pathlib import Path

import pytest

from heirloom.git_ops import commit_diff, git, is_ancestor, parse_diff, show_file
from heirloom.pipeline.calibrate import (
    _blame,
    added_condition_mutant,
    added_operands,
    enclosing_symbols,
    fix_hunk_lines,
    provenance,
    symbols,
    trace_origin,
    transplant,
)

DJANGO = Path.home() / "work" / "django"
needs_repo = pytest.mark.skipif(not (DJANGO / ".git").exists(), reason="needs ~/work/django")

FIX_87975 = "ff27883ca055aa9ab23015b50674a5b10dfe5a41"
L_42 = "3396992e837d5146270ea8112bb622c83fa4a919"
PATH = "django/forms/models.py"
SYMBOL = "BaseModelFormSet.save_existing_objects"

L_SNIPPET = """\
class BaseModelFormSet:
    def save_existing_objects(self, commit=True):
        for form in self.initial_forms:
            obj = form.instance
            if obj.pk is None or obj._state.adding:
                continue
            self.delete_existing(obj)

    def other(self):
        return self.a or obj._state.adding
"""

DIFF_87975 = """\
diff --git a/django/forms/models.py b/django/forms/models.py
--- a/django/forms/models.py
+++ b/django/forms/models.py
@@ -938 +938 @@ class BaseModelFormSet(BaseFormSet, AltersData):
-            if not obj._is_pk_set():
+            if not obj._is_pk_set() or obj._state.adding:
"""


def test_added_operands_from_fix_diff() -> None:
    (diff,) = parse_diff(DIFF_87975)
    assert added_operands(diff) == [("or", "obj._state.adding")]


def test_added_condition_mutant_removes_operand_only_inside_symbol() -> None:
    mutant = added_condition_mutant(L_SNIPPET, [SYMBOL], [("or", "obj._state.adding")])
    assert mutant is not None
    assert "            if obj.pk is None:\n" in mutant
    # The same operand outside the mapped symbol is untouched.
    assert "return self.a or obj._state.adding" in mutant


def test_added_condition_mutant_is_unbuildable_when_operand_absent() -> None:
    vulnerable = L_SNIPPET.replace(" or obj._state.adding:", ":")
    assert added_condition_mutant(vulnerable, [SYMBOL], [("or", "obj._state.adding")]) is None


def test_transplant_replaces_method() -> None:
    donor = L_SNIPPET.replace("if obj.pk is None or obj._state.adding:", "if not obj._is_pk_set():")
    out = transplant(L_SNIPPET, donor, [SYMBOL])
    assert out is not None
    assert "if not obj._is_pk_set():" in out
    assert "return self.a or obj._state.adding" in out
    assert transplant(L_SNIPPET, donor, ["BaseModelFormSet.missing"]) is None


def test_enclosing_symbols_prefers_innermost_function() -> None:
    assert enclosing_symbols(L_SNIPPET, [5]) == [SYMBOL]
    assert [s.qualname for s in symbols(L_SNIPPET)] == [
        "BaseModelFormSet",
        SYMBOL,
        "BaseModelFormSet.other",
    ]


@needs_repo
def test_real_fix_maps_to_save_existing_objects() -> None:
    (diff,) = parse_diff(commit_diff(DJANGO, FIX_87975, "django/"))
    src = show_file(DJANGO, f"{FIX_87975}^", PATH)
    assert src is not None
    assert enclosing_symbols(src, fix_hunk_lines(diff)) == [SYMBOL]
    assert added_operands(diff) == [("or", "obj._state.adding")]


@needs_repo
def test_c4c_naive_blame_falls_into_the_refactor_trap() -> None:
    """One-level blame says 'introduced after the branch point' — wrong (§9)."""
    um = f"{FIX_87975}^"
    line = show_file(DJANGO, um, PATH)
    assert line is not None
    n = line.splitlines().index("            if not obj._is_pk_set():") + 1
    sha, _, _ = _blame(DJANGO, um, PATH, n)
    base = git(DJANGO, "merge-base", um, L_42).strip()
    assert sha.startswith("5865ff5adc")
    assert not is_ancestor(DJANGO, sha, base)  # the trap: naive C4c would pass


@needs_repo
def test_c4c_recursive_provenance_sees_through_the_refactor() -> None:
    um = f"{FIX_87975}^"
    src = show_file(DJANGO, um, PATH)
    assert src is not None
    n = src.splitlines().index("            if not obj._is_pk_set():") + 1
    origin = trace_origin(DJANGO, um, PATH, n)
    assert origin.chain[0].startswith("5865ff5adc")
    assert origin.origin is not None
    base = git(DJANGO, "merge-base", um, L_42).strip()
    assert is_ancestor(DJANGO, origin.origin, base)

    diffs = parse_diff(commit_diff(DJANGO, FIX_87975, "django/"))
    l_src = show_file(DJANGO, L_42, PATH)
    assert l_src is not None
    gate = provenance(DJANGO, um, L_42, diffs, l_src)
    assert not gate.ok
    assert "ancestor of merge-base" in gate.detail
