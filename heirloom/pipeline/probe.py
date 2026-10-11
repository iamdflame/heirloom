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
ALLOWED_IMPORTS = frozenset(
    {"django", "unittest", "tracemalloc", "gc", "io", "json", "re", "datetime", "decimal",
     "uuid", "functools", "itertools", "collections", "string", "copy"}
)  # fmt: skip


class LeakageError(RuntimeError):
    pass


def fix_added_lines(ctx: Ctx, fixes: list[str]) -> list[str]:
    out = []
    for f in parse_diff(fix_diff(ctx.repo, fixes, "django/")):
        for h in f.hunks:
            for line in h.added:
                text = " ".join(line.split())
                if len(text) >= 12:  # comments too: they describe the fix
                    out.append(text)
    return out


def assert_no_leak(prompt: str, added: list[str]) -> int:
    flat = " ".join(prompt.split())
    leaked = [a for a in added if a in flat]
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
                elif mod.split(".")[0] not in ALLOWED_IMPORTS:
                    problems.append(f"{name}:{node.lineno}: unexpected import from {mod}")
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name.split(".")[0] not in ALLOWED_IMPORTS:
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
        if WALL_CLOCK.search(src):
            problems.append(f"{name}: wall-clock timing is not allowed; use deterministic signals")
    tests = files.get("tests.py", "")
    if "def test" not in tests:
        problems.append("tests.py defines no test methods")
    if "TestCase" not in tests:
        problems.append("tests.py must use django.test.TestCase or SimpleTestCase")
    return problems


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


def run(ctx: Ctx, loc: dict[str, Any], c0: dict[str, Any], feedback: str | None) -> dict[str, Any]:
    def body(span: StageSpan) -> dict[str, Any]:
        router = Router(ctx.s, ctx.budget())
        added = fix_added_lines(ctx, fixes_of(loc))
        attempt_feedback = feedback
        total = 0.0
        problems: list[str] = []
        for n in range(3):
            prompt = build_prompt(ctx, loc, c0, attempt_feedback)
            checked = assert_no_leak(prompt, added)
            tag = hashlib.sha256((attempt_feedback or "").encode()).hexdigest()[:8]
            ctx.log("probe", f"prompt-{tag}-{n}.md").write_text(prompt)
            res = router.complete(
                ctx.s.probe_model, [{"role": "user", "content": prompt}], max_tokens=6000
            )
            total += res.cost_usd
            span.set("cost_usd", round(total, 6))
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
                }
            attempt_feedback = (
                (feedback + "\n\n" if feedback else "")
                + "Your probe was rejected before running:\n- "
                + "\n- ".join(problems)
            )
        raise StageFailed(f"porter produced no valid probe: {problems}")

    inputs = {"locate": loc["fix"], "c0": c0.get("structural"), "feedback": feedback}
    return ctx.stage("probe", inputs, body)
