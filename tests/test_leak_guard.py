"""The leakage guard exempts only fix-added lines the porter is shown by design anyway:
L's source (CVE-2026-35192) and the upstream test diff (CVE-2026-15307)."""

import pytest

from heirloom.pipeline.probe import LeakageError, assert_no_leak, guarded_lines

L_SESSIONS = """\
            if accessed:
                patch_vary_headers(response, ("Cookie",))
"""
TEST_DIFF = """\
+from django.contrib.gis.gdal.raster.source import DisallowedRasterLookup
+        with self.assertRaises(DisallowedRasterLookup):
"""
ADDED = [
    'patch_vary_headers(response, ("Cookie",))',  # L has it twice already
    "from django.contrib.gis.gdal.raster.source import DisallowedRasterLookup",  # tests too
    "if settings.SESSION_SAVE_EVERY_REQUEST and not empty:",  # the fix's own logic
]


def test_lines_shown_by_design_are_exempt_and_nothing_else() -> None:
    shown = [L_SESSIONS, TEST_DIFF]
    assert guarded_lines(ADDED, shown) == [ADDED[2]]
    prompt = f"## Django 4.2 source\n{L_SESSIONS}\n## Upstream tests\n{TEST_DIFF}"
    assert assert_no_leak(prompt, guarded_lines(ADDED, shown)) == 1
    with pytest.raises(LeakageError):
        assert_no_leak(prompt + "\n## Advisory\n" + ADDED[2], guarded_lines(ADDED, shown))


def test_nothing_is_exempt_when_the_shown_inputs_lack_the_line() -> None:
    assert guarded_lines(ADDED, ["x = 1\n"]) == ADDED
    assert guarded_lines(ADDED, []) == ADDED
