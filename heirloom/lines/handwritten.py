"""Hand-written probes, specified by the build brief. NOT from the independent porter.

These exist where the brief prescribes the probe itself (BUILD-BRIEF §10.4,
CVE-2026-87890). They go through exactly the same calibration as porter probes
(U⁻/U⁺ 3× each via the pipeline's runner, then on_line()), and every record that
uses one says ``origin: hand-written`` so no result can be mistaken for the
porter's work.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from heirloom.pipeline.probe import validate

ORIGIN = "hand-written (BUILD-BRIEF §10.4 spec); not from the independent porter"

_87890_MODELS = """\
# No models: the probe only prepares lookup values on unbound spatial fields.
"""

_87890_TESTS = '''\
"""CVE-2026-87890: bytes in spatial lookups must never reach GDALRaster.

Hand-written to the BUILD-BRIEF §10.4 spec (not by the independent porter).
Deterministic: GDALRaster is replaced by a subclass that records what it was
given and raises GDALException before any GDAL I/O, so nothing is read, written
or fetched. Bytes only: str and dict values belong to CVE-2026-15307.
"""

from unittest import mock

from django.contrib.gis.db.models import PointField, RasterField
from django.contrib.gis.gdal import GDALException, GDALRaster
from django.test import SimpleTestCase

RECORDED = []


class Recorder(GDALRaster):
    def __init__(self, ds_input, *args, **kwargs):
        RECORDED.append(type(ds_input))
        raise GDALException("Recorder: GDALRaster construction intercepted")


class SpatialLookupBytesTests(SimpleTestCase):
    def setUp(self):
        RECORDED.clear()

    def test_bytes_lookup_values_never_reach_gdalraster(self):
        value = b"heirloom probe: these bytes are not a raster"
        with mock.patch("django.contrib.gis.gdal.GDALRaster", Recorder):
            try:
                PointField(srid=4326).get_prep_value(value)
            except Exception:
                pass
            try:
                RasterField().get_prep_value(value)
            except Exception:
                pass
        self.assertEqual(RECORDED, [])
'''


def _probe(cve: str, files: dict[str, str]) -> dict[str, Any]:
    app = "hl_" + cve.lower().replace("-", "_")
    problems = validate(files, app)
    if problems:  # the porter's rules apply to hand-written probes too
        raise ValueError(f"hand-written probe for {cve} breaks the probe rules: {problems}")
    sha = hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()
    return {
        "files": files,
        "sha": sha,
        "origin": ORIGIN,
        "model": None,
        "provider": "hand-written",
        "tokens": [0, 0],
        "attempts": 0,
    }


HANDWRITTEN: dict[str, dict[str, Any]] = {
    "CVE-2026-87890": _probe(
        "CVE-2026-87890", {"models.py": _87890_MODELS, "tests.py": _87890_TESTS}
    ),
}
