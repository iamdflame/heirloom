"""The leakage guard exempts only fix-added lines L already has verbatim (CVE-2026-35192)."""

import pytest

from heirloom.pipeline.probe import LeakageError, assert_no_leak, guarded_lines

L_SESSIONS = """\
            if accessed:
                patch_vary_headers(response, ("Cookie",))
"""
ADDED = [
    'patch_vary_headers(response, ("Cookie",))',  # L has it twice already
    "if settings.SESSION_SAVE_EVERY_REQUEST and not empty:",  # the fix's own logic
]


def test_lines_already_in_the_shown_l_source_are_exempt() -> None:
    shown = [("django/contrib/sessions/middleware.py", L_SESSIONS)]
    assert guarded_lines(ADDED, shown) == [ADDED[1]]
    # The prompt shows L's source: the exempt line may appear, the fix's own may not.
    prompt = f"## Django 4.2 source\n{L_SESSIONS}"
    assert assert_no_leak(prompt, guarded_lines(ADDED, shown)) == 1
    with pytest.raises(LeakageError):
        assert_no_leak(prompt + "\n" + ADDED[1], guarded_lines(ADDED, shown))


def test_nothing_is_exempt_when_l_lacks_the_line() -> None:
    assert guarded_lines(ADDED, [("m.py", "x = 1\n")]) == ADDED
    assert guarded_lines(ADDED, []) == ADDED
