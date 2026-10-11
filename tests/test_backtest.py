from pathlib import Path

import pytest

from heirloom import config
from heirloom.backtest import Case, cases, correct, fellows_test_ids, summarize
from heirloom.config import runtime_line
from heirloom.git_ops import git, git_ok
from heirloom.integrations.neatlogs import Telemetry
from heirloom.ledger import Ledger
from heirloom.pipeline import adapt
from heirloom.pipeline.context import Ctx

DJANGO = Path.home() / "work" / "django"
needs_repo = pytest.mark.skipif(not (DJANGO / ".git").exists(), reason="needs ~/work/django")

POS = Case("CVE-X", "positive", "a" * 40, "AFFECTED", "b" * 40)
NEG = Case("CVE-X", "negative", "b" * 40, "NOT_AFFECTED", "b" * 40)


def test_scoring_never_counts_unproven_as_correct() -> None:
    assert correct(POS, "AFFECTED") is True
    assert correct(POS, "NOT_AFFECTED_PROVEN") is False
    assert correct(POS, "UNPROVEN") is None
    assert correct(NEG, "NOT_AFFECTED_PROVEN") is True
    assert correct(NEG, "AFFECTED") is False


def test_summary_counts_false_not_affected_and_escalations() -> None:
    rows: list[dict[str, object]] = [
        {"kind": "positive", "truth": "AFFECTED", "verdict": "NOT_AFFECTED_PROVEN",
         "correct": False, "escalated": False, "cost_usd": 0.3, "minutes": 2.0},
        {"kind": "positive", "truth": "AFFECTED", "verdict": "AFFECTED", "correct": True,
         "escalated": False, "cost_usd": 0.4, "minutes": 3.0, "fellows_test_passes": True},
        {"kind": "negative", "truth": "NOT_AFFECTED", "verdict": "UNPROVEN", "correct": None,
         "escalated": True, "cost_usd": 0.0, "cost_unknown": True, "minutes": 1.0},
    ]  # fmt: skip
    s = summarize(rows)
    assert s["false_not_affected"] == 1
    assert s["verdict_accuracy"] == 0.5
    assert s["escalation_rate"] == round(1 / 3, 3)
    assert s["fellows_test_pass"] == "1/2"
    assert s["cost_unknown_cases"] == 1
    assert s["usd_per_case"] == 0.35


@needs_repo
def test_case_set_matches_the_archive() -> None:
    cs = cases(DJANGO)
    assert sum(c.kind == "positive" for c in cs) == 13
    assert sum(c.kind == "negative" for c in cs) == 13
    extra = [c for c in cs if c.kind == "extra"]
    assert [c.cve for c in extra] == ["CVE-2025-27556"]
    by = {(c.cve, c.kind): c for c in cs}
    pos, neg = by[("CVE-2026-1287", "positive")], by[("CVE-2026-1287", "negative")]
    assert neg.tip == neg.fellows_fix
    assert git(DJANGO, "rev-parse", f"{neg.tip}^").strip() == pos.tip


@needs_repo
def test_fellows_test_ids_for_1287() -> None:
    fellows = git(DJANGO, "rev-parse", "f75f8f3597").strip()
    files, ids = fellows_test_ids(DJANGO, fellows)
    assert files and all(f.startswith("tests/") for f in files)
    assert ids and all("." in i for i in ids)


@needs_repo
def test_eval_adapter_tree_holds_only_the_line_tip(tmp_path: Path) -> None:
    """§10.3 leakage guard: the adapter cannot reach the fellows' fix from its tree."""
    tip = git(DJANGO, "rev-parse", "f75f8f3597^").strip()
    s = config.Settings(**{**config.load().__dict__, "work": tmp_path})
    spec = runtime_line("bt-pos-test", tip, "eval")
    ctx = Ctx(s, Ledger(tmp_path / "l.sqlite"), Telemetry(), spec, "CVE-2026-1287", spec.name, "r")
    tree = adapt.lfix(ctx, tip, {"tests.py": "x = 1\n"}, None)
    assert git(tree, "rev-list", "--count", "HEAD").strip() == "1"
    assert git(tree, "rev-parse", "HEAD").strip() == tip
    assert not git_ok(tree, "cat-file", "-e", "f75f8f3597")
    assert git(tree, "rev-parse", "--git-common-dir").strip() == ".git"  # not a worktree


def test_message_constants_join_implicit_concatenation_and_skip_docstrings() -> None:
    from heirloom.pipeline.behaviour import message_constants

    src = (
        '"""Module docstring with spaces."""\n'
        "def f(alias):\n"
        '    """Function docstring here."""\n'
        "    raise ValueError(\n"
        '        "Column aliases cannot contain whitespace characters, hashes, "\n'
        '        "control characters, quotation marks."\n'
        "    )\n"
    )
    assert message_constants(src) == {
        "Column aliases cannot contain whitespace characters, hashes, "
        "control characters, quotation marks."
    }


@needs_repo
def test_missing_upstream_message_is_a_behaviour_diff(tmp_path: Path) -> None:
    """CVE-2026-1287: upstream adds 'control characters' to the alias error message."""
    from heirloom.pipeline.behaviour import missing_messages

    path = "django/db/models/sql/query.py"
    tree = tmp_path / "tree"
    (tree / path).parent.mkdir(parents=True)
    old = git(DJANGO, "show", f"b40cfc6052:{path}")  # 4.2 before the fellows' fix
    (tree / path).write_text(old)
    diffs = missing_messages(DJANGO, ["3e68ccdc11"], [path], tree)
    assert any("control characters" in d["upstream"] for d in diffs)
    fellows = git(DJANGO, "show", f"f75f8f3597:{path}")  # the fellows' 4.2 fix
    (tree / path).write_text(fellows)
    assert missing_messages(DJANGO, ["3e68ccdc11"], [path], tree) == []
