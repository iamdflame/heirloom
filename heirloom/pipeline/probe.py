"""PROBE: an independent porter writes a standalone test app that encodes the bug.

The porter runs in its own model context and never sees the fix diff. It gets
the advisory text, the upstream *test* diff, L's source for the touched modules
and the upstream test models. A leakage guard asserts that no line the fix adds
appears in the prompt.
"""

from __future__ import annotations

import ast
import hashlib
import json
import re
import sys
from typing import Any

from heirloom.git_ops import parse_diff, show_file
from heirloom.integrations.neatlogs import StageSpan
from heirloom.models.router import Router
from heirloom.pipeline.context import Ctx, StageFailed
from heirloom.pipeline.fixes import fix_diff, fixes_of

FILES = ("models.py", "tests.py")
BLOCK = re.compile(r"^### (models\.py|tests\.py)\s*\n```(?:python)?\n(.*?)^```", re.M | re.S)
WALL_CLOCK = re.compile(r"\b(time\.time|perf_counter|monotonic|sleep|timeit)\b")
MAX_SOURCE_CHARS = 120_000
# Probes may use Django and the standard library (filesystem CVEs need os/stat/
# tempfile, ...), except wall-clock time and anything that reaches the network or
# spawns processes. Checked on the full dotted module name.
BLOCKED_MODULES = frozenset(
    {"time", "timeit", "socket", "ssl", "http.client", "http.server", "urllib.request",
     "ftplib", "smtplib", "poplib", "imaplib", "telnetlib", "xmlrpc", "socketserver",
     "subprocess", "multiprocessing", "webbrowser", "ctypes", "asyncio.subprocess"}
)  # fmt: skip
ALLOWED_ROOTS = frozenset(sys.stdlib_module_names) | {"django"}


def import_allowed(module: str) -> bool:
    parts = module.split(".")
    if parts[0] not in ALLOWED_ROOTS:
        return False
    return not any(".".join(parts[: i + 1]) in BLOCKED_MODULES for i in range(len(parts)))


class LeakageError(RuntimeError):
    pass


def _norm(line: str) -> str:
    return " ".join(line.split())


def fix_added_lines(ctx: Ctx, fixes: list[str]) -> list[str]:
    """Lines the fix commits introduce: added lines absent from the file before the commit.

    Comments count (they describe the fix). Re-flowed or moved lines that already exist
    in the pre-fix file are not new information and would only cause false alarms.
    """
    out: list[str] = []
    for sha in fixes:
        for f in parse_diff(fix_diff(ctx.repo, [sha], "django/")):
            before = show_file(ctx.repo, f"{sha}^", f.old_path or f.path) or ""
            existing = {_norm(x) for x in before.splitlines()}
            for h in f.hunks:
                for line in h.added:
                    text = _norm(line)
                    if len(text) >= 12 and text not in existing:
                        out.append(text)
    return out


L_SOURCE_HEADER = "## Django 4.2 source of the affected modules"
FEEDBACK_HEADER = "\n## Feedback on your previous probe"


def leak_surface(prompt: str) -> str:
    """The prompt minus the line's own source and test models.

    Those sections come from the vulnerable tree L, which predates the fix, so they
    cannot leak it; generic lines there (``except FileExistsError:``) only caused
    false alarms. The advisory, the upstream test diff and any feedback are checked.
    """
    start = prompt.find(L_SOURCE_HEADER)
    if start < 0:
        return prompt
    end = prompt.find(FEEDBACK_HEADER, start)
    return prompt[:start] + (prompt[end:] if end >= 0 else "")


def guarded_lines(added: list[str], test_diff: str) -> list[str]:
    """Fix-added lines the guard checks: not those the upstream test diff also shows.

    The porter sees the upstream test diff by design (§3); a fix line it contains
    (CVE-2026-35193's tests import ``patch_vary_headers,`` exactly as the fix does,
    CVE-2026-15307's import ``DisallowedRasterLookup``) tells it nothing new. L's own
    source is left out of the checked surface by :func:`leak_surface`. Any other fix
    line anywhere in the prompt (advisory, feedback, hints) still trips the guard.
    """
    shown = {_norm(x[1:]) for x in test_diff.splitlines() if x[:1] in (" ", "+", "-")}
    return [a for a in added if a not in shown]


def assert_no_leak(prompt: str, added: list[str]) -> int:
    """Raise if any line the fix introduces appears as a whole line of the prompt."""
    lines = {_norm(x) for x in prompt.splitlines()}
    leaked = [a for a in added if a in lines]
    if leaked:
        raise LeakageError(f"porter prompt contains {len(leaked)} fix line(s): {leaked[0]!r}")
    return len(added)


def validate(files: dict[str, str], app: str) -> list[str]:
    """Problems that make a probe unusable, phrased without reference to the fix."""
    problems: list[str] = []
    if set(files) != set(FILES):
        return [f"expected exactly {FILES}, got {sorted(files)}"]
    for name, src in files.items():
        try:
            tree = ast.parse(src)
        except SyntaxError as exc:
            problems.append(f"{name}: syntax error: {exc}")
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                mod = node.module or ""
                if any(a.name.startswith("_") for a in node.names) or re.search(
                    r"(^|\.)_[a-z]", mod
                ):
                    problems.append(f"{name}:{node.lineno}: imports a private name from {mod}")
                if node.level:
                    if mod not in ("models", ""):
                        problems.append(f"{name}:{node.lineno}: relative import of .{mod}")
                elif not import_allowed(mod):
                    problems.append(f"{name}:{node.lineno}: unexpected import from {mod}")
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if not import_allowed(alias.name):
                        problems.append(f"{name}:{node.lineno}: unexpected import {alias.name}")
            if (
                isinstance(node, ast.Attribute)
                and node.attr.startswith("_")
                and not node.attr.startswith("__")
                and not (isinstance(node.value, ast.Name) and node.value.id in ("self", "cls"))
            ):
                problems.append(f"{name}:{node.lineno}: uses private attribute .{node.attr}")
            if isinstance(node, ast.Name) and node.id in ("skip", "skipIf", "expectedFailure"):
                problems.append(f"{name}:{node.lineno}: skips/expected failures are not allowed")
            if isinstance(node, ast.Try) and guards_imports(node):
                problems.append(
                    f"{name}:{node.lineno}: do not guard imports or catch ImportError; "
                    "import the API under test at module level and let a missing API raise"
                )
        if WALL_CLOCK.search(src):
            problems.append(f"{name}: wall-clock timing is not allowed; use deterministic signals")
    tests = files.get("tests.py", "")
    if "def test" not in tests:
        problems.append("tests.py defines no test methods")
    if "TestCase" not in tests:
        problems.append("tests.py must use django.test.TestCase or SimpleTestCase")
    return problems


IMPORT_ERRORS = frozenset({"ImportError", "ModuleNotFoundError"})


def guards_imports(node: ast.Try) -> bool:
    """A try block around an import, or a handler for ImportError/ModuleNotFoundError.

    Such a probe turns "the API does not exist on L" into a FAIL (or a PASS); the
    absent-symbol path (§10.4) needs the ImportError itself.
    """
    if any(isinstance(n, ast.Import | ast.ImportFrom) for b in node.body for n in ast.walk(b)):
        return True
    for h in node.handlers:
        names = h.type.elts if isinstance(h.type, ast.Tuple) else [h.type] if h.type else []
        if any(ast.unparse(n).split(".")[-1] in IMPORT_ERRORS for n in names):
            return True
    return False


# Always in the prompt: a probe must not mask a missing API (§10.4 absent-symbol path).
MISSING_API_RULE = (
    "\nRULE (missing APIs): import the Django API under test at module level, exactly as "
    "on Django 5.2. Never wrap imports in try/except or catch ImportError to turn a "
    "missing API into an assertion. If the API does not exist in Django 4.2, the import "
    "error there is expected and is evaluated by calibration.\n"
)

# A general hint (no fix content) for advisories in GIS / native-library code (§10.4).
NATIVE_HINT = (
    "\nHINT (GIS / native-library code: GDAL, GEOS, GeoIP): native I/O, spatial databases "
    "and GIS test data are not available to the probe. Use no spatial models; call "
    "Field.get_prep_value (or the public function under test) directly on unbound fields; "
    "intercept public constructors (e.g. GDALRaster, GEOSGeometry) with unittest.mock, "
    "recording the arguments they receive and raising before any native I/O, and assert "
    "on what was recorded. Patch in a subclass of the real class that overrides only "
    "__init__, never a bare Mock/MagicMock: isinstance() checks and the class's other "
    "methods must keep working.\n"
)
NATIVE_PATHS = ("django/contrib/gis/",)


def native_hint(fix_files: list[str]) -> str:
    return NATIVE_HINT if any(f.startswith(NATIVE_PATHS) for f in fix_files) else ""


def parse_blocks(text: str) -> dict[str, str]:
    return {m[1]: m[2] for m in BLOCK.finditer(text)}


def build_prompt(ctx: Ctx, loc: dict[str, Any], c0: dict[str, Any], feedback: str | None) -> str:
    test_diff = fix_diff(ctx.repo, fixes_of(loc), *loc["test_files"], context=3)
    sources: list[str] = []
    budget = MAX_SOURCE_CHARS
    for path in loc["fix_files"]:
        src = show_file(ctx.repo, loc["tip"], path)
        if src is None:
            continue
        chunk = src[:budget]
        budget -= len(chunk)
        sources.append(f"#### {path} (Django 4.2 tip)\n```python\n{chunk}\n```")
    labels = sorted({t.split(".")[0] for t in loc["upstream_test_ids"]})
    models = []
    for label in labels:
        m = show_file(ctx.repo, loc["tip"], f"tests/{label}/models.py")
        if m:
            models.append(f"#### tests/{label}/models.py (Django 4.2)\n```python\n{m[:20000]}\n```")
    structural = ""
    if c0.get("structural"):
        structural = (
            "\nNOTE: the upstream regression tests below ERROR on the vulnerable tree because "
            "they reference names that only exist after the fix. Do not copy them: write a "
            "behavioural probe that only uses public API and observable behaviour.\n"
        )
    structural += native_hint(loc["fix_files"]) + MISSING_API_RULE
    retry = f"\n## Feedback on your previous probe\n{feedback}\n" if feedback else ""
    return f"""You are writing a regression probe for a Django security advisory.
You have NOT been shown the fix. Write a standalone Django test app `tests/{ctx.app}/`
that encodes the vulnerability as a failing assertion.

Rules:
- On the vulnerable code (Django 4.2 below) the probe must FAIL with an AssertionError.
  On correctly fixed code it must PASS. Any other exception counts as a broken probe.
- Public API only: import from documented Django modules. No private names (leading
  underscore), no skip decorators, no expectedFailure, no network, no sleeps.
- Denial-of-service issues: assert deterministic signals (counts, sizes, limits,
  tracemalloc deltas). Never measure wall-clock time.
- Put any models you need in models.py (use `from django.db import models`; app label is
  `{ctx.app}`, no migrations). models.py may contain only imports if no models are needed.
- tests.py imports its models with `from .models import ...` and uses
  django.test.TestCase (or SimpleTestCase when no database is needed).
- It must run on Django 4.2 and on 5.2. 1-4 focused test methods, under ~150 lines.
{structural}
Reply with exactly two fenced code blocks, each preceded by its header line:
### models.py
```python
...
```
### tests.py
```python
...
```

## Advisory
{loc["advisory"]}

## Upstream regression tests added with the 5.2 fix (test diff only)
```diff
{test_diff}
```

## Django 4.2 source of the affected modules
{chr(10).join(sources)}

## Upstream test models (Django 4.2)
{chr(10).join(models) or "(none)"}
{retry}"""


def run(
    ctx: Ctx,
    loc: dict[str, Any],
    c0: dict[str, Any],
    feedback: str | None,
    model: str | None = None,
) -> dict[str, Any]:
    model = model or ctx.s.probe_model

    def body(span: StageSpan) -> dict[str, Any]:
        span.set("porter_model", model)
        router = Router(ctx.s, ctx.budget())
        test_diff = fix_diff(ctx.repo, fixes_of(loc), *loc["test_files"], context=3)
        added = guarded_lines(fix_added_lines(ctx, fixes_of(loc)), test_diff)
        attempt_feedback = feedback
        total = 0.0
        estimated = False  # any call priced from tokens instead of a provider report
        problems: list[str] = []
        for n in range(3):
            prompt = build_prompt(ctx, loc, c0, attempt_feedback)
            checked = assert_no_leak(leak_surface(prompt), added)
            tag = hashlib.sha256((attempt_feedback or "").encode()).hexdigest()[:8]
            ctx.log("probe", f"prompt-{tag}-{n}.md").write_text(prompt)
            res = router.complete(model, [{"role": "user", "content": prompt}], max_tokens=6000)
            total += res.cost_usd
            estimated = estimated or res.cost_estimated
            span.set("cost_usd", round(total, 6))
            span.set("cost_estimated", estimated)
            ctx.log("probe", f"response-{tag}-{n}.md").write_text(res.text)
            files = parse_blocks(res.text)
            problems = validate(files, ctx.app)
            if not problems:
                sha = hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()
                span.set("probe_sha", sha[:16])
                return {
                    "files": files,
                    "sha": sha,
                    "model": res.model,
                    "provider": res.provider,
                    "tokens": [res.input_tokens, res.output_tokens],
                    "fix_lines_checked": checked,
                    "attempts": n + 1,
                    "cost_usd": round(total, 6),
                    "cost_estimated": estimated,
                }
            attempt_feedback = (
                (feedback + "\n\n" if feedback else "")
                + "Your probe was rejected before running:\n- "
                + "\n- ".join(problems)
            )
        raise StageFailed(f"porter produced no valid probe: {problems}")

    inputs: dict[str, Any] = {
        "locate": loc["fix"],
        "c0": c0.get("structural"),
        "feedback": feedback,
    }
    if model != ctx.s.probe_model:  # keeps earlier ledger rows (default model) reusable
        inputs["model"] = model
    if loc.get("done_fixes"):
        inputs["fixes"] = loc["fixes"]  # a follow-up probes only the newer commits
    return ctx.stage("probe", inputs, body)
