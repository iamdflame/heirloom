"""CALIBRATE: evidence for gates C3 (reach) and C4 (sensitivity, provenance).

The orchestration that runs the probe 3× on U⁻/U⁺/L lives in
``heirloom.pipeline.stages``; this module holds the deterministic machinery:

* ``enclosing_symbols`` / ``map_symbol``: C3 symbol mapping (ast on U⁻ → L).
* ``added_condition_mutant``: C4b fallback (§9) that removes boolean operands
  the fix added, instead of transplanting 5.x-only internals.
* ``transplant``: C4b proper, U⁻'s version of a symbol pasted into L (libcst).
* ``provenance``: C4c with recursive blame through line modifications (§9).
"""

from __future__ import annotations

import ast
import difflib
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path

import libcst as cst

from heirloom.git_ops import FileDiff, commit_diff, git, git_ok, is_ancestor, parse_diff
from heirloom.pipeline.presence import Gate

# C3 · reach -------------------------------------------------------------------


@dataclass(frozen=True)
class Symbol:
    qualname: str
    start: int  # first line incl. decorators
    end: int
    body_start: int


def symbols(source: str) -> list[Symbol]:
    out: list[Symbol] = []

    def walk(node: ast.AST, prefix: str) -> None:
        for child in ast.iter_child_nodes(node):
            if isinstance(child, ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef):
                q = f"{prefix}{child.name}"
                start = min([child.lineno, *(d.lineno for d in child.decorator_list)])
                end = child.end_lineno or child.lineno
                out.append(Symbol(q, start, end, child.body[0].lineno))
                walk(child, q + ".")

    walk(ast.parse(source), "")
    return out


def enclosing_symbols(source: str, lines: Iterable[int]) -> list[str]:
    """Innermost function (or class, if no function) enclosing each line."""
    syms = symbols(source)
    found: list[str] = []
    for ln in lines:
        inside = [s for s in syms if s.start <= ln <= s.end]
        if not inside:
            continue
        best = max(inside, key=lambda s: s.start)
        if best.qualname not in found:
            found.append(best.qualname)
    return found


def fix_hunk_lines(diff: FileDiff) -> list[int]:
    """Old-side (U⁻) line numbers touched by each hunk; insertions anchor on the line above."""
    lines: list[int] = []
    for h in diff.hunks:
        if h.old_count:
            lines.extend(range(h.old_start, h.old_start + h.old_count))
        else:
            lines.append(max(h.old_start, 1))
    return lines


@dataclass(frozen=True)
class MappedSymbol:
    um_path: str
    qualname: str
    l_path: str | None
    l_symbol: Symbol | None
    how: str  # same-path | rename | search | absent


def map_symbol(repo: Path, l_ref: str, um_ref: str, path: str, qualname: str) -> MappedSymbol:
    """Map a U⁻ symbol to L: same module+qualname, then rename tracking, then a search."""
    from heirloom.git_ops import show_file

    src = show_file(repo, l_ref, path)
    if src is not None:
        sym = next((s for s in symbols(src) if s.qualname == qualname), None)
        if sym:
            return MappedSymbol(path, qualname, path, sym, "same-path")
    renamed = git(
        repo, "diff", "--name-status", "-M", l_ref, um_ref, "--diff-filter=R", check=False
    )
    for row in renamed.splitlines():
        parts = row.split("\t")
        if len(parts) == 3 and parts[2] == path:
            src = show_file(repo, l_ref, parts[1])
            sym = next((s for s in symbols(src or "") if s.qualname == qualname), None)
            if sym:
                return MappedSymbol(path, qualname, parts[1], sym, "rename")
    name = qualname.rsplit(".", 1)[-1]
    hits = git(
        repo, "grep", "-l", "-E", rf"def {re.escape(name)}\(", l_ref, "--", "django/", check=False
    )
    for hit in hits.splitlines():
        hit_path = hit.split(":", 1)[1]
        src = show_file(repo, l_ref, hit_path)
        sym = next((s for s in symbols(src or "") if s.qualname == qualname), None)
        if sym:
            return MappedSymbol(path, qualname, hit_path, sym, "search")
    return MappedSymbol(path, qualname, None, None, "absent")


def reach_gate(mapped: Sequence[MappedSymbol], covered: dict[str, set[int]]) -> Gate:
    """C3: coverage on L hits ≥1 body line of every mapped symbol present in L."""
    present = [m for m in mapped if m.l_symbol is not None and m.l_path is not None]
    if not present:
        return Gate(False, "NO_REACH", "no fix symbol exists in L")
    missed: list[str] = []
    for m in present:
        assert m.l_symbol is not None and m.l_path is not None
        body = set(range(m.l_symbol.body_start, m.l_symbol.end + 1))
        if not body & covered.get(m.l_path, set()):
            missed.append(m.qualname)
    if missed:
        return Gate(False, "NO_REACH", f"probe never executed {', '.join(missed)} on L")
    names = ", ".join(f"{m.qualname} ({m.how})" for m in present)
    return Gate(True, detail=f"reached {names}")


# C4b · mutants ------------------------------------------------------------------

_CONDITION = re.compile(r"^\s*(?:if|elif|while|return|assert)\s+(.*?):?\s*$")


def _expr(line: str) -> cst.BaseExpression | None:
    m = _CONDITION.match(line)
    text = m[1] if m else line.strip().rstrip(":")
    try:
        return cst.parse_expression(text)
    except cst.ParserSyntaxError:
        return None


def _code(node: cst.CSTNode) -> str:
    return " ".join(cst.Module(body=[]).code_for_node(node).split())


def _flatten(node: cst.BaseExpression, op: type[cst.BaseBooleanOp]) -> list[cst.BaseExpression]:
    if isinstance(node, cst.BooleanOperation) and isinstance(node.operator, op):
        return [*_flatten(node.left, op), *_flatten(node.right, op)]
    return [node]


def added_operands(diff: FileDiff) -> list[tuple[str, str]]:
    """Boolean operands the fix added to an existing condition, as (op, code).

    Only hunks that replace a condition with a superset of its operands qualify,
    e.g. ``if not obj._is_pk_set():`` → ``if not obj._is_pk_set() or obj._state.adding:``.
    """
    found: list[tuple[str, str]] = []
    for h in diff.hunks:
        olds = [e for e in (_expr(x) for x in h.removed) if e is not None]
        news = [e for e in (_expr(x) for x in h.added) if e is not None]
        for new in news:
            if not isinstance(new, cst.BooleanOperation):
                continue
            op_type: type[cst.BaseBooleanOp] = type(new.operator)
            op_name = "or" if isinstance(new.operator, cst.Or) else "and"
            new_ops = [_code(x) for x in _flatten(new, op_type)]
            for old in olds:
                old_ops = [_code(x) for x in _flatten(old, op_type)]
                extra = [x for x in new_ops if x not in old_ops]
                if extra and all(x in new_ops for x in old_ops):
                    found.extend((op_name, x) for x in extra)
    return found


class _DropOperands(cst.CSTTransformer):
    def __init__(self, operands: set[str]) -> None:
        self.operands = operands
        self.removed = 0

    def leave_BooleanOperation(
        self, original: cst.BooleanOperation, updated: cst.BooleanOperation
    ) -> cst.BaseExpression:
        op_type: type[cst.BaseBooleanOp] = type(updated.operator)
        parts = _flatten(updated, op_type)
        keep = [p for p in parts if _code(p) not in self.operands]
        if len(keep) == len(parts) or not keep:
            return updated
        self.removed += len(parts) - len(keep)
        result = keep[0]
        for p in keep[1:]:
            result = cst.BooleanOperation(left=result, operator=updated.operator, right=p)
        return result


class _InSymbol(cst.CSTTransformer):
    """Apply ``inner`` only inside the function/class at ``qualname``."""

    def __init__(self, qualname: str, inner: cst.CSTTransformer) -> None:
        self.target = qualname.split(".")
        self.stack: list[str] = []
        self.inner = inner

    def visit_ClassDef(self, node: cst.ClassDef) -> None:
        self.stack.append(node.name.value)

    def leave_ClassDef(self, original: cst.ClassDef, updated: cst.ClassDef) -> cst.ClassDef:
        self.stack.pop()
        return updated

    def visit_FunctionDef(self, node: cst.FunctionDef) -> bool:
        self.stack.append(node.name.value)
        return self.stack != self.target

    def leave_FunctionDef(
        self, original: cst.FunctionDef, updated: cst.FunctionDef
    ) -> cst.FunctionDef:
        if self.stack == self.target:
            updated = updated.visit(self.inner)  # type: ignore[assignment]
        self.stack.pop()
        return updated


def added_condition_mutant(
    source: str, qualnames: Sequence[str], operands: Sequence[tuple[str, str]]
) -> str | None:
    """L's source with the fix's added operands removed inside the mapped symbols."""
    if not operands:
        return None
    module = cst.parse_module(source)
    dropper = _DropOperands({code for _, code in operands})
    for q in qualnames:
        module = module.visit(_InSymbol(q, dropper))
    return module.code if dropper.removed else None


class _Transplant(cst.CSTTransformer):
    def __init__(self, qualname: str, donor: cst.FunctionDef) -> None:
        self.target = qualname.split(".")
        self.stack: list[str] = []
        self.donor = donor
        self.done = 0

    def visit_ClassDef(self, node: cst.ClassDef) -> None:
        self.stack.append(node.name.value)

    def leave_ClassDef(self, original: cst.ClassDef, updated: cst.ClassDef) -> cst.ClassDef:
        self.stack.pop()
        return updated

    def visit_FunctionDef(self, node: cst.FunctionDef) -> bool:
        self.stack.append(node.name.value)
        return False

    def leave_FunctionDef(
        self, original: cst.FunctionDef, updated: cst.FunctionDef
    ) -> cst.FunctionDef:
        hit = self.stack == self.target
        self.stack.pop()
        if hit:
            self.done += 1
            return self.donor
        return updated


def _find_function(module: cst.Module, qualname: str) -> cst.FunctionDef | None:
    parts = qualname.split(".")
    body: Sequence[cst.CSTNode] = module.body
    for i, name in enumerate(parts):
        last = i == len(parts) - 1
        nxt: cst.CSTNode | None = None
        for node in body:
            if last and isinstance(node, cst.FunctionDef) and node.name.value == name:
                return node
            if not last and isinstance(node, cst.ClassDef) and node.name.value == name:
                nxt = node
        if not isinstance(nxt, cst.ClassDef) or not isinstance(nxt.body, cst.IndentedBlock):
            return None
        body = nxt.body.body
    return None


def transplant(target: str, donor: str, qualnames: Sequence[str]) -> str | None:
    """Replace each function in ``qualnames`` in ``target`` with ``donor``'s version."""
    module = cst.parse_module(target)
    donor_module = cst.parse_module(donor)
    changed = 0
    for q in qualnames:
        fn = _find_function(donor_module, q)
        if fn is None:
            return None
        t = _Transplant(q, fn)
        module = module.visit(t)
        changed += t.done
    return module.code if changed else None


# C4c · recursive provenance -------------------------------------------------------


@dataclass(frozen=True)
class Origin:
    line: str
    chain: tuple[str, ...]  # blame commits walked, newest first
    origin: str | None  # commit that added the line (pure addition), None if unresolved
    detail: str


def _blame(repo: Path, rev: str, path: str, line: int) -> tuple[str, str, int]:
    out = git(repo, "blame", "-w", "-M", "--porcelain", "-L", f"{line},{line}", rev, "--", path)
    head = out.splitlines()[0].split()
    sha, orig_line = head[0], int(head[1])
    orig_path = path
    for row in out.splitlines():
        if row.startswith("filename "):
            orig_path = row[len("filename ") :]
    return sha, orig_path, orig_line


def trace_origin(repo: Path, rev: str, path: str, line: int, *, max_depth: int = 25) -> Origin:
    """Follow blame through commits that *modified* the line until a pure addition."""
    text = (git(repo, "show", f"{rev}:{path}").splitlines() or [""])[line - 1]
    chain: list[str] = []
    for _ in range(max_depth):
        sha, cpath, cline = _blame(repo, rev, path, line)
        chain.append(sha)
        if not git_ok(repo, "rev-parse", "--verify", f"{sha}^"):
            return Origin(text, tuple(chain), sha, "root commit")
        diff = next((f for f in parse_diff(commit_diff(repo, sha)) if f.new_path == cpath), None)
        hunk = None
        if diff is not None:
            hunk = next(
                (h for h in diff.hunks if h.new_start <= cline < h.new_start + h.new_count), None
            )
        if diff is None or hunk is None:
            return Origin(text, tuple(chain), None, f"no hunk for {cpath}:{cline} in {sha[:10]}")
        if not hunk.removed:
            return Origin(text, tuple(chain), sha, f"added by {sha[:10]}")
        # Modification: recurse on the most similar predecessor line in the parent.
        new_line = hunk.added[cline - hunk.new_start]
        ratios = [
            difflib.SequenceMatcher(None, new_line.strip(), r.strip()).ratio() for r in hunk.removed
        ]
        idx = max(range(len(ratios)), key=ratios.__getitem__)
        rev, path, line = f"{sha}^", diff.old_path or cpath, hunk.old_start + idx
    return Origin(text, tuple(chain), None, "provenance chain too deep")


def changed_lines(diff: FileDiff) -> list[int]:
    """U⁻ line numbers the fix deletes or changes (pure insertions have none)."""
    out: list[int] = []
    for h in diff.hunks:
        if h.removed:
            out.extend(range(h.old_start, h.old_start + h.old_count))
    return out


def provenance(
    repo: Path,
    um_ref: str,
    l_ref: str,
    fix_diffs: Sequence[FileDiff],
    l_symbol_text: str,
) -> Gate:
    """C4c: every changed line was *introduced* after the branch point and never backported."""
    base = git(repo, "merge-base", um_ref, l_ref).strip()
    lines = [(d.old_path or d.path, n) for d in fix_diffs for n in changed_lines(d)]
    if not lines:
        return Gate(False, None, "fix only inserts lines; provenance cannot apply")
    l_text = " ".join(l_symbol_text.split())
    for path, n in lines:
        o = trace_origin(repo, um_ref, path, n)
        if o.origin is None:
            return Gate(False, None, f"{path}:{n}: {o.detail}")
        if is_ancestor(repo, o.origin, base):
            return Gate(
                False,
                None,
                f"{path}:{n} traces to {o.origin[:10]} (via {len(o.chain)} commits), "
                f"an ancestor of merge-base {base[:10]}",
            )
        backports = git(
            repo, "log", "--format=%H", f"--grep=Backport of {o.origin}", f"{base}..{l_ref}"
        )
        if backports.strip():
            return Gate(False, None, f"{o.origin[:10]} was backported to L")
        if " ".join(o.line.split()) and " ".join(o.line.split()) in l_text:
            return Gate(False, None, f"line text of {path}:{n} present in L")
    return Gate(True, detail=f"{len(lines)} changed lines introduced after {base[:10]}")
