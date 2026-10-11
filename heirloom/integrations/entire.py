"""Entire (sessions as git checkpoints) and the headless Claude Code adapter."""

from __future__ import annotations

import json
import os
import re
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path

from heirloom.config import Settings
from heirloom.git_ops import git

TRAILER = re.compile(r"^Entire-Checkpoint:\s*(\S+)\s*$", re.M)


class EntireError(RuntimeError):
    pass


def _entire(worktree: Path, *args: str) -> str:
    proc = subprocess.run(["entire", *args], cwd=worktree, capture_output=True, text=True)
    if proc.returncode != 0:
        raise EntireError(f"entire {' '.join(args)}: {proc.stderr.strip() or proc.stdout.strip()}")
    return proc.stdout


def enable(worktree: Path, fork: str, *, publishing: bool = True) -> None:
    """Enable Entire in a pipeline tree.

    On publishing lines checkpoints must sync to the fork, never upstream: refuse to
    continue otherwise. Non-publishing trees never push, so they skip that check.
    """
    local = worktree / ".entire" / "settings.local.json"
    if not local.exists():
        _entire(
            worktree, "enable", "--agent", "claude-code", "--yes", "--local", "--telemetry=false"
        )
    data = json.loads(local.read_text())
    if data.get("commit_linking") != "always":
        data["commit_linking"] = "always"
        local.write_text(json.dumps(data, indent=2) + "\n")
    remote = data.get("strategy_options", {}).get("checkpoint_remote", {})
    if publishing and remote.get("repo") != fork:
        _entire(worktree, "configure", "--checkpoint-remote", f"github:{fork}")
    exclude = Path(git(worktree, "rev-parse", "--git-common-dir").strip())
    if not exclude.is_absolute():
        exclude = (worktree / exclude).resolve()
    exclude = exclude / "info" / "exclude"
    current = exclude.read_text() if exclude.exists() else ""
    missing = [p for p in (".claude/", ".entire/") if p not in current.splitlines()]
    if missing:
        exclude.write_text(current + "".join(f"{p}\n" for p in missing))
    status = _entire(worktree, "status")
    if publishing and f"dedicated checkpoint remote ({fork})" not in status:
        raise EntireError(f"checkpoints would not sync to {fork}: {status.strip()}")


def checkpoint_of_head(worktree: Path) -> str | None:
    m = TRAILER.search(git(worktree, "log", "-1", "--format=%B"))
    return m[1] if m else None


def checkpoint_ref(repo: Path, remote: str, checkpoint: str) -> tuple[str, str] | None:
    """(ref, sha) of the checkpoint on ``remote``, or None if it is not there."""
    out = git(repo, "ls-remote", remote, "refs/entire/checkpoints/*", check=False)
    for row in out.splitlines():
        sha, ref = row.split("\t")
        if ref.endswith("/" + checkpoint):
            return ref, sha
    return None


def explain(worktree: Path, checkpoint: str) -> str:
    return _entire(worktree, "checkpoint", "explain", checkpoint)


@dataclass(frozen=True)
class ClaudeResult:
    ok: bool
    session_id: str
    cost_usd: float
    num_turns: int
    result: str
    seconds: float
    provider: str
    raw_path: Path


ALLOWED = (
    "Read,Edit,Grep,Glob,Bash(python tests/runtests.py *),"
    "Bash(git diff *),Bash(git show *),Bash(git log *)"
)
DISALLOWED = "WebFetch,WebSearch,Bash(git commit *),Bash(git push *)"
# Eval lines (§10.3 leakage guard): no history tools at all, in a sanitized one-commit repo.
ALLOWED_EVAL = "Read,Edit,Grep,Glob,Bash(python tests/runtests.py *),Bash(git diff *)"
DISALLOWED_EVAL = DISALLOWED + ",Bash(git log *),Bash(git show *)"


def key_exhausted_cached(settings: Settings) -> bool:
    from heirloom.models.router import key_exhausted

    return key_exhausted(settings)


def run_claude(
    worktree: Path,
    prompt: str,
    settings: Settings,
    *,
    max_budget_usd: float,
    log_dir: Path,
    max_turns: int = 40,
    sanitized: bool = False,
) -> ClaudeResult:
    """``claude -p`` in an Entire-enabled worktree (never ``--bare``: it disables hooks)."""
    log_dir.mkdir(parents=True, exist_ok=True)
    venv_bin = settings.test_python.parent
    base = {
        k: v
        for k, v in os.environ.items()
        if k not in ("CLAUDECODE", "ANTHROPIC_API_KEY", "CLAUDE_CODE_ENTRYPOINT", "PYTHONPATH")
    }
    base.update(
        PATH=f"{venv_bin}{os.pathsep}{base.get('PATH', '')}",
        PYTHONPATH=str(worktree),
        CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS="1",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="1",
        ANTHROPIC_MODEL=settings.adapt_model,
        ANTHROPIC_DEFAULT_HAIKU_MODEL=settings.reading_model,
    )
    from heirloom.models.router import (
        OPENROUTER_MODELS,
        OVERFLOW_LEDGER,
        BudgetExceeded,
        OverflowLedger,
        overflow_allowance,
    )

    exhausted = key_exhausted_cached(settings)
    providers: list[tuple[str, dict[str, str]]] = []
    if not exhausted:  # a known-exhausted gateway key is not even tried
        providers.append(
            (
                "litellm-gateway",
                {
                    "ANTHROPIC_BASE_URL": settings.litellm_base.removesuffix("/v1"),
                    "ANTHROPIC_AUTH_TOKEN": settings.litellm_key,
                },
            )
        )
    # Overflow only once the LiteLLM key is exhausted, within the global overflow cap.
    allowance = 0.0
    if settings.openrouter_key and exhausted:
        allowance = overflow_allowance(settings)
    if allowance > 0.05:
        providers.append(
            (
                "openrouter",
                {
                    "ANTHROPIC_BASE_URL": "https://openrouter.ai/api",
                    "ANTHROPIC_AUTH_TOKEN": settings.openrouter_key,
                    "ANTHROPIC_API_KEY": "",
                    # OpenRouter names the models by vendor/slug.
                    "ANTHROPIC_MODEL": OPENROUTER_MODELS.get(
                        settings.adapt_model, settings.adapt_model
                    ),
                    "ANTHROPIC_DEFAULT_HAIKU_MODEL": OPENROUTER_MODELS.get(
                        settings.reading_model, settings.reading_model
                    ),
                },
            )
        )
    if not providers:
        raise BudgetExceeded(
            "no provider for claude -p: the LiteLLM key is exhausted and the overflow "
            f"allowance is ${allowance:.2f}"
        )
    cmd = [
        "claude",
        "-p",
        prompt,
        "--permission-mode",
        "acceptEdits",
        "--allowedTools",
        ALLOWED_EVAL if sanitized else ALLOWED,
        "--disallowedTools",
        DISALLOWED_EVAL if sanitized else DISALLOWED,
        "--max-turns",
        str(max_turns),
        "--max-budget-usd",
        f"{max_budget_usd:.2f}",
        "--output-format",
        "json",
    ]
    last_err = ""
    for provider, extra in providers:
        if provider == "openrouter":
            idx = cmd.index("--max-budget-usd") + 1
            cmd[idx] = f"{min(max_budget_usd, allowance):.2f}"
        for adaptive_off in (False, True):
            env = {**base, **extra}
            if adaptive_off:
                env["CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING"] = "1"
            raw = log_dir / f"claude-{provider}{'-noadaptive' if adaptive_off else ''}.json"
            start = time.monotonic()
            proc = subprocess.run(cmd, cwd=worktree, env=env, capture_output=True, text=True)
            seconds = time.monotonic() - start
            raw.write_text(proc.stdout)
            (raw.with_suffix(".stderr")).write_text(proc.stderr)
            try:
                data = json.loads(proc.stdout)
            except json.JSONDecodeError:
                data = {}
            text = f"{proc.stderr}\n{data.get('result', '')}"
            if provider == "openrouter" and data:
                # claude -p's total_cost_usd matched the OpenRouter key's billed usage
                # delta exactly in a 2026-10-11 check ($0.10849875 both ways).
                OverflowLedger(OVERFLOW_LEDGER).add(
                    provider, "claude -p", float(data.get("total_cost_usd") or 0.0)
                )
            if data and not data.get("is_error") and data.get("subtype") == "success":
                return ClaudeResult(
                    ok=True,
                    session_id=str(data.get("session_id", "")),
                    cost_usd=float(data.get("total_cost_usd") or 0.0),
                    num_turns=int(data.get("num_turns") or 0),
                    result=str(data.get("result", "")),
                    seconds=seconds,
                    provider=provider,
                    raw_path=raw,
                )
            last_err = text.strip()[-2000:]
            if data.get("subtype", "").startswith("error_max") or (
                data and data.get("session_id") and "adaptive" not in text.lower()
            ):
                # The agent ran but did not finish (turns/budget): report, do not retry.
                return ClaudeResult(
                    ok=False,
                    session_id=str(data.get("session_id", "")),
                    cost_usd=float(data.get("total_cost_usd") or 0.0),
                    num_turns=int(data.get("num_turns") or 0),
                    result=last_err,
                    seconds=seconds,
                    provider=provider,
                    raw_path=raw,
                )
            if "adaptive" not in text.lower():
                break
    raise EntireError(f"claude -p failed on all providers: {last_err}")
