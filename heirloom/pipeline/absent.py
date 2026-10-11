"""The absent-symbol path (BUILD-BRIEF §10.4, CVE-2026-53878).

A fix can live entirely inside code that L never had (``DomainNameValidator`` was
added in 5.1; 4.2.30 has no such class). The probe then cannot run on L: it ERRORs
with an ImportError, which the verdict table treats as PROBE_ERROR. This gate lets
PRESENCE prove NOT_AFFECTED only when *all* of the following hold (C1 is checked
by the verdict table itself):

1. every mapped fix symbol is absent on L: same path, rename tracking and the repo
   search all fail, and no ``class``/``def``/assignment anywhere in L's django/
   defines the missing name;
2. the probe ERRORs on every L run, and every error is an ImportError /
   ModuleNotFoundError / AttributeError that names a missing symbol;
3. recursive provenance with ``git blame -C -C`` (copies from other files count)
   of every line the fix deletes or changes inside the symbol (the C4c lines;
   the symbol's ``class``/``def`` line when the fix only inserts) ends in a pure
   addition that descends from the merge base and is not one of its ancestors,
   and no L commit says "Backport of" that addition.

Ancestry, never dates: 4971a9afe5 ("Added a DomainNameValidator") has a 2016
author date but was committed in 2024, after the 4.2 branch point.

Why not always trace the ``class`` line: in 4971a9afe5 git's diff aligns
``class DomainNameValidator(RegexValidator):`` with the removed (actually moved)
``class URLValidator(RegexValidator):`` header, so recursive blame of the header
follows URLValidator back to 2015. The fix's changed lines are what carries the
vulnerability, and they all end in 4971a9afe5's pure addition.
"""

from __future__ import annotations

import ast
import re
from collections import Counter
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from heirloom.git_ops import FileDiff, git, is_ancestor, show_file
from heirloom.pipeline.presence import Gate

LOOKUP_ERROR = re.compile(r"\b(ImportError|ModuleNotFoundError|AttributeError)\b")


def definitions(source: str) -> set[str]:
    """Names a module defines at any depth: classes, functions, assignment targets."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return set()
    out: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef):
            out.add(node.name)
        elif isinstance(node, ast.Assign | ast.AnnAssign):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for t in targets:
                for n in ast.walk(t):
                    if isinstance(n, ast.Name):
                        out.add(n.id)
    return out


def defined_on(repo: Path, ref: str, name: str) -> list[str]:
    """Python files under django/ on ``ref`` that define ``name``."""
    hits = git(repo, "grep", "-l", "-w", "-F", "-e", name, ref, "--", "django/", check=False)
    found: list[str] = []
    for hit in hits.splitlines():
        path = hit.split(":", 1)[1]
        if path.endswith(".py") and name in definitions(show_file(repo, ref, path) or ""):
            found.append(path)
    return found


def missing_name(repo: Path, ref: str, qualname: str) -> str | None:
    """The outermost component of ``qualname`` that nothing in L's django/ defines."""
    for part in qualname.split("."):
        if not defined_on(repo, ref, part):
            return part
    return None


_DEFS = (ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)
Def = ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef


def _node(source: str, qualname: str) -> Def | None:
    """The class/function statement for ``qualname`` (top level, then nested bodies)."""
    body: list[ast.stmt] = ast.parse(source).body
    node: Def | None = None
    for part in qualname.split("."):
        node = next((n for n in body if isinstance(n, _DEFS) and n.name == part), None)
        if node is None:
            return None
        body = node.body
    return node


def lookup_errors(l_runs: Sequence[dict[str, Any]]) -> list[str] | str:
    """Every error message of the L runs, or why they are not an absent-symbol ERROR."""
    errors: list[str] = []
    for r in l_runs:
        if r["outcome"] != "ERROR":
            return f"probe {r['outcome']} on L (needs ERROR)"
        if r["failing_ids"]:
            return "probe has FAILing tests on L"
        errs = [*r["details"].values(), *r["harness_errors"]]
        if not errs:
            return "probe ERRORs on L without an error message"
        errors.extend(errs)
    return errors


def absent_gate(
    repo: Path,
    loc: dict[str, Any],
    tip: str,
    pairs: Sequence[tuple[str, FileDiff]],
    mapped: Sequence[Any],  # calibrate.MappedSymbol
    l_runs: Sequence[dict[str, Any]],
) -> Gate:
    from heirloom.pipeline.calibrate import changed_lines, trace_origin

    if not mapped:
        return Gate(False, None, "no fix symbol to map")
    present = [m.qualname for m in mapped if m.how != "absent" or m.l_symbol is not None]
    if present:
        return Gate(False, None, f"mapped on L: {', '.join(present)}")
    missing: dict[str, str] = {}
    for m in mapped:
        name = missing_name(repo, tip, m.qualname)
        if name is None:
            return Gate(False, None, f"every component of {m.qualname} is defined on L")
        missing[m.qualname] = name

    errors = lookup_errors(l_runs)
    if isinstance(errors, str):
        return Gate(False, None, errors)
    names = sorted(set(missing.values()))
    for e in errors:
        if not LOOKUP_ERROR.search(e):
            return Gate(False, None, f"L error is not an import/attribute error: {e[:200]}")
        if not any(re.search(rf"\b{re.escape(n)}\b", e) for n in names):
            return Gate(False, None, f"L error names none of {names}: {e[:200]}")

    base = loc["merge_base"]
    todo: list[tuple[str, str, int]] = []  # (parent ref, path, line on that parent)
    for m in mapped:
        outer = m.qualname.split(".")
        outer = outer[: outer.index(missing[m.qualname]) + 1]
        found = False
        for parent, diff in pairs:  # one per fix commit touching the file
            if diff.path != m.um_path:
                continue
            src = show_file(repo, parent, m.um_path) or ""
            head, sym = _node(src, ".".join(outer)), _node(src, m.qualname)
            if head is None or sym is None:
                continue
            found = True
            end = sym.end_lineno or sym.lineno
            lines = [n for n in changed_lines(diff) if sym.lineno <= n <= end] or [head.lineno]
            todo.extend((parent, m.um_path, n) for n in lines)
        if not found:
            return Gate(False, None, f"{m.qualname} not found before any fix commit")
    origins: Counter[str] = Counter()
    todo = list(dict.fromkeys(todo))
    for parent, path, n in todo:
        o = trace_origin(repo, parent, path, n, copies=True)
        where = f"{path}:{n}"
        if o.origin is None:
            return Gate(False, None, f"{where}: {o.detail}")
        if is_ancestor(repo, o.origin, base):
            return Gate(
                False, None, f"{where} traces to {o.origin[:10]}, an ancestor of {base[:10]}"
            )
        if not is_ancestor(repo, base, o.origin):
            return Gate(False, None, f"{where} traces to {o.origin[:10]}, not after {base[:10]}")
        backports = git(
            repo, "log", "--format=%H", f"--grep=Backport of {o.origin}", f"{base}..{tip}"
        )
        if backports.strip():
            return Gate(False, None, f"{o.origin[:10]} was backported to L")
        origins[o.origin[:10]] += 1
    traced = ", ".join(f"{n} → {sha}" for sha, n in origins.most_common())
    return Gate(
        True,
        detail=(
            f"absent on L: {', '.join(names)}; probe ERRORs naming it; blame -C -C of "
            f"{len(todo)} fix-changed lines ends in pure additions after {base[:10]} ({traced})"
        ),
    )
