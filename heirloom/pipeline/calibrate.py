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
import subprocess
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import libcst as cst

from heirloom.git_ops import (
    FileDiff,
    commit_diff,
    git,
    git_ok,
    is_ancestor,
    parse_diff,
    show_file,
)
from heirloom.integrations.neatlogs import StageSpan
from heirloom.pipeline.context import Ctx, StageFailed
from heirloom.pipeline.presence import (
    Evidence,
    Gate,
    MutantOutcome,
    Presence,
    ProbeRun,
    presence,
)
from heirloom.verify.runner import RunResult

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


# Stages ------------------------------------------------------------------------

RETRYABLE = {"PROBE_ERROR", "NON_DISCRIMINATING", "FLAKY", "NO_REACH", "FAIL_MISMATCH"}


def run_json(r: RunResult) -> dict[str, Any]:
    return {
        "outcome": r.outcome,
        "failing_ids": sorted(r.failing_ids),
        "skipped_ids": sorted(r.skipped_ids),
        "details": {
            t: o.detail for t, o in sorted(r.tests.items()) if o.outcome in ("FAIL", "ERROR")
        },
        "harness_errors": r.harness_errors,
        "reason": r.reason,
        "summary": r.summary,
        "log": str(r.log_path),
        "seconds": round(r.seconds, 2),
    }


def probe_run(d: dict[str, Any]) -> ProbeRun:
    return ProbeRun(d["outcome"], frozenset(d["failing_ids"]), frozenset(d["skipped_ids"]))


def evidence_from(cal: dict[str, Any]) -> Evidence:
    def gate(g: dict[str, Any] | None) -> Gate | None:
        return None if g is None else Gate(g["ok"], g["reason"], g["detail"])

    reach = gate(cal["reach"])
    assert reach is not None
    return Evidence(
        um=tuple(probe_run(r) for r in cal["um"]),
        up=tuple(probe_run(r) for r in cal["up"]),
        lt=tuple(probe_run(r) for r in cal["lt"]),
        reach=reach,
        mutants=tuple(
            MutantOutcome(
                m["method"], m["built"], probe_run(m["probe"]) if m["probe"] else None, m["detail"]
            )
            for m in cal["mutants"]
        ),
        provenance=gate(cal["provenance"]),
    )


def _gate_json(g: Gate | None) -> dict[str, Any] | None:
    return None if g is None else {"ok": g.ok, "reason": g.reason, "detail": g.detail}


def _apply(tree: Path, patch: str, *args: str) -> tuple[bool, str]:
    proc = subprocess.run(
        ["git", "-C", str(tree), "apply", *args], input=patch, capture_output=True, text=True
    )
    msg = (proc.stderr or proc.stdout).strip()
    return proc.returncode == 0, msg.splitlines()[0] if msg else ""


def run_c0(ctx: Ctx, loc: dict[str, Any]) -> dict[str, Any]:
    """C0: upstream tests FAIL on U⁻ and PASS on U⁺; ERROR on U⁻ means structural tests."""

    def body(span: StageSpan) -> dict[str, Any]:
        ids = loc["upstream_test_ids"]
        if not ids:
            span.set("c0", "no_upstream_tests")
            return {"holds": False, "structural": True, "detail": "fix adds no test methods"}
        um = ctx.tree("Um", loc["um"])
        test_diff = commit_diff(ctx.repo, loc["fix"], *loc["test_files"], context=3)
        ok, err = _apply(um, test_diff)
        if not ok:
            raise StageFailed(f"upstream tests do not apply to U⁻: {err}")
        up = ctx.tree("Up", loc["fix"])
        runner = ctx.runner()
        um_runs = [runner.run(um, ids, log_path=ctx.log("c0", f"Um-{i}.log")) for i in range(3)]
        up_runs = [runner.run(up, ids, log_path=ctx.log("c0", f"Up-{i}.log")) for i in range(3)]
        ctx.tree("Um", loc["um"])  # drop the applied tests again
        structural = any(r.outcome == "ERROR" for r in um_runs)
        holds = all(r.outcome == "FAIL" for r in um_runs) and all(
            r.outcome == "PASS" for r in up_runs
        )
        span.set("c0_holds", holds)
        span.set("c0_structural", structural)
        return {
            "holds": holds,
            "structural": structural,
            "ids": ids,
            "um": [run_json(r) for r in um_runs],
            "up": [run_json(r) for r in up_runs],
            "detail": "STRUCTURAL_TEST: upstream tests ERROR on U⁻" if structural else "",
        }

    return ctx.stage("c0", {"fix": loc["fix"], "ids": loc["upstream_test_ids"]}, body)


def _mutants(
    ctx: Ctx,
    loc: dict[str, Any],
    files: dict[str, str],
    diffs: Sequence[FileDiff],
    mapped: Sequence[MappedSymbol],
) -> list[MutantOutcome]:
    runner = ctx.runner()
    out: list[MutantOutcome] = []

    def run_probe(tree: Path, name: str) -> ProbeRun:
        return ProbeRun.of(runner.run(tree, [ctx.app], log_path=ctx.log("c4", f"{name}.log")))

    # (a) reverse-apply the fix's django/ hunks onto L (clean index: §9 staging fix).
    tree = ctx.tree("Mut", loc["tip"], files)
    patch = commit_diff(ctx.repo, loc["fix"], "django/", context=3)
    ok, err = _apply(tree, patch, "-R", "--3way")
    conflicted = "<<<<<<<" in git(tree, "diff", check=False)
    if ok and not conflicted:
        out.append(MutantOutcome("reverse_apply", True, run_probe(tree, "reverse_apply")))
    else:
        out.append(MutantOutcome("reverse_apply", False, None, f"does not apply: {err}"))
    if out[-1].works:
        return out

    by_path: dict[str, list[str]] = {}
    for m in mapped:
        if m.l_path and m.l_symbol:
            by_path.setdefault(m.l_path, []).append(m.qualname)

    # (b1) added-condition mutant (§9): drop operands the fix added inside the symbol.
    tree = ctx.tree("Mut", loc["tip"], files)
    built = False
    for d in diffs:
        ops = added_operands(d)
        l_path = next((m.l_path for m in mapped if m.um_path == d.path and m.l_path), None)
        if not ops or l_path is None:
            continue
        mutant = added_condition_mutant((tree / l_path).read_text(), by_path[l_path], ops)
        if mutant is not None:
            (tree / l_path).write_text(mutant)
            built = True
    if built:
        out.append(MutantOutcome("added_condition", True, run_probe(tree, "added_condition")))
    else:
        out.append(MutantOutcome("added_condition", False, None, "fix-added operands not in L"))
    if out[-1].works:
        return out

    # (b2) transplant U⁻'s versions of the mapped symbols into L.
    tree = ctx.tree("Mut", loc["tip"], files)
    built = False
    for l_path, qualnames in by_path.items():
        um_path = next(m.um_path for m in mapped if m.l_path == l_path)
        donor = show_file(ctx.repo, loc["um"], um_path) or ""
        mutant = transplant((tree / l_path).read_text(), donor, qualnames)
        if mutant is not None:
            (tree / l_path).write_text(mutant)
            built = True
    if built:
        probe = run_probe(tree, "transplant")
        detail = "probe ERRORs on the transplant" if probe.outcome == "ERROR" else ""
        out.append(MutantOutcome("transplant", True, probe, detail))
    else:
        out.append(MutantOutcome("transplant", False, None, "no symbol to transplant"))
    return out


def feedback_for(cal: dict[str, Any], verdict: Presence) -> str | None:
    """What the porter is told after a failed calibration (never quotes the fix)."""
    if verdict.verdict != "UNPROVEN" or verdict.reason not in RETRYABLE:
        return None

    def describe(tree: str, runs: list[dict[str, Any]]) -> str:
        outcomes = ", ".join(r["outcome"] for r in runs)
        details = {k: v for r in runs for k, v in r["details"].items()}
        lines = [f"- {tree}: {outcomes}"]
        lines += [f"    {k.rsplit('.', 1)[-1]}: {v[:300]}" for k, v in list(details.items())[:6]]
        lines += [f"    harness: {h[:300]}" for r in runs[:1] for h in r["harness_errors"][:3]]
        return "\n".join(lines)

    return "\n".join(
        [
            f"Calibration rejected the probe: {verdict.reason} ({verdict.detail}).",
            "Required: FAIL (AssertionError) on the vulnerable trees, PASS on the fixed tree,",
            "no ERROR or SKIP anywhere, identical failing tests on every run.",
            describe("vulnerable 5.2 tree (U⁻)", cal["um"]),
            describe("fixed 5.2 tree (U⁺)", cal["up"]),
            describe("Django 4.2 (L)", cal["lt"]),
        ]
    )


def run(ctx: Ctx, loc: dict[str, Any], probe: dict[str, Any]) -> dict[str, Any]:
    """Run the probe 3× on U⁻, U⁺ and L; gather C3 and (if it PASSes on L) C4 evidence."""

    def body(span: StageSpan) -> dict[str, Any]:
        files: dict[str, str] = probe["files"]
        runner = ctx.runner()
        um = ctx.tree("Um", loc["um"], files)
        up = ctx.tree("Up", loc["fix"], files)
        lt = ctx.tree("L", loc["tip"], files)
        diffs = parse_diff(commit_diff(ctx.repo, loc["fix"], "django/"))
        mapped: list[MappedSymbol] = []
        for d in diffs:
            src = show_file(ctx.repo, loc["um"], d.path) or ""
            for q in enclosing_symbols(src, fix_hunk_lines(d)):
                mapped.append(map_symbol(ctx.repo, loc["tip"], loc["um"], d.path, q))
        cov = [lt / m.l_path for m in mapped if m.l_path]

        def runs(tree: Path, name: str, coverage: bool = False) -> list[RunResult]:
            return [
                runner.run(
                    tree,
                    [ctx.app],
                    log_path=ctx.log("calibrate", probe["sha"][:8], f"{name}-{i}.log"),
                    coverage_include=cov if coverage and i == 0 else (),
                )
                for i in range(3)
            ]

        um_runs, up_runs, l_runs = runs(um, "Um"), runs(up, "Up"), runs(lt, "L", coverage=True)
        reach = reach_gate(mapped, l_runs[0].coverage)
        mutants: list[MutantOutcome] = []
        prov: Gate | None = None
        if all(r.outcome == "PASS" for r in l_runs):
            mutants = _mutants(ctx, loc, files, diffs, mapped)
            l_text = "\n".join(
                "\n".join(
                    (show_file(ctx.repo, loc["tip"], m.l_path) or "").splitlines()[
                        m.l_symbol.start - 1 : m.l_symbol.end
                    ]
                )
                for m in mapped
                if m.l_path and m.l_symbol
            )
            prov = provenance(ctx.repo, loc["um"], loc["tip"], diffs, l_text)
        cal: dict[str, Any] = {
            "probe": probe["sha"],
            "um": [run_json(r) for r in um_runs],
            "up": [run_json(r) for r in up_runs],
            "lt": [run_json(r) for r in l_runs],
            "mapped": [
                {
                    "um_path": m.um_path,
                    "qualname": m.qualname,
                    "l_path": m.l_path,
                    "how": m.how,
                    "l_lines": [m.l_symbol.start, m.l_symbol.end] if m.l_symbol else None,
                }
                for m in mapped
            ],
            "covered_lines": {
                k: sorted(v)
                for k, v in l_runs[0].coverage.items()
                if k in {m.l_path for m in mapped}
            },
            "reach": _gate_json(reach),
            "mutants": [
                {
                    "method": m.method,
                    "built": m.built,
                    "detail": m.detail,
                    "probe": None
                    if m.probe is None
                    else {
                        "outcome": m.probe.outcome,
                        "failing_ids": sorted(m.probe.failing_ids),
                        "skipped_ids": sorted(m.probe.skipped_ids),
                    },
                }
                for m in mutants
            ],
            "provenance": _gate_json(prov),
        }
        verdict = presence(evidence_from(cal))
        cal["feedback"] = feedback_for(cal, verdict)
        span.set("reach", reach.ok)
        span.set("calibrated", verdict.calibrated)
        span.set("verdict", verdict.verdict)
        span.set("reason", verdict.reason or "NONE")
        return cal

    return ctx.stage("calibrate", {"probe": probe["sha"], "fix": loc["fix"]}, body)


def run_presence(ctx: Ctx, cal: dict[str, Any]) -> dict[str, Any]:
    def body(span: StageSpan) -> dict[str, Any]:
        p = presence(evidence_from(cal))
        return {
            "verdict": p.verdict,
            "reason": p.reason,
            "calibrated": p.calibrated,
            "detail": p.detail,
            "gates": {k: _gate_json(g) for k, g in p.gates.items()},
        }

    def preview() -> None:
        p = presence(evidence_from(cal))
        ctx.verdict, ctx.reason = p.verdict, p.reason or "NONE"
        ctx.calibrated, ctx.reach = p.calibrated, bool(cal["reach"]["ok"])

    preview()
    return ctx.stage("presence", {"calibrate": cal["probe"], "evidence": cal}, body)
