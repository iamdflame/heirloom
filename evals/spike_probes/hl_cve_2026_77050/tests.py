"""Probe for CVE-2026-77050: memory retained by get_supported_language_variant().

Candidate probe, hand-written for spike S1. Public API only. Deterministic signal:
tracemalloc retained bytes after many distinct over-long language codes, not time.
"""
import gc
import tracemalloc

from django.test import SimpleTestCase, override_settings
from django.utils.translation import get_supported_language_variant

N_CODES = 50
CODE_LEN = 90_000  # Far above LANGUAGE_CODE_MAX_LENGTH (500).


@override_settings(LANGUAGE_CODE="en", LANGUAGES=[("en", "English")])
class LongLanguageCodeRetentionProbe(SimpleTestCase):
    def test_long_codes_not_retained(self):
        get_supported_language_variant("en")  # Warm unrelated caches.
        gc.collect()
        tracemalloc.start()
        try:
            before = tracemalloc.take_snapshot()
            for i in range(N_CODES):
                code = (f"en-{i:04d}-" + "x-" * (CODE_LEN // 2))[:CODE_LEN]
                self.assertEqual(get_supported_language_variant(code), "en")
                del code
            gc.collect()
            after = tracemalloc.take_snapshot()
        finally:
            tracemalloc.stop()
        retained = sum(s.size_diff for s in after.compare_to(before, "filename"))
        # Retaining the over-long inputs would cost ~N_CODES * CODE_LEN = 4.5 MB.
        self.assertLess(retained, 1_000_000, f"retained {retained} bytes")
