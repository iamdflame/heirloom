"""The hand-written CVE-2026-87890 probe (BUILD-BRIEF §10.4) and the porter's GIS hint."""

import ast

from heirloom.lines.handwritten import HANDWRITTEN, ORIGIN
from heirloom.pipeline.probe import NATIVE_HINT, native_hint, validate

PROBE = HANDWRITTEN["CVE-2026-87890"]


def test_probe_is_labelled_hand_written_and_obeys_the_porter_rules() -> None:
    assert PROBE["origin"] == ORIGIN
    assert "not from the independent porter" in ORIGIN
    assert PROBE["model"] is None
    assert validate(PROBE["files"], "hl_cve_2026_87890") == []
    assert "Hand-written" in PROBE["files"]["tests.py"]


def test_probe_follows_the_spec() -> None:
    src = PROBE["files"]["tests.py"]
    tree = ast.parse(src)
    classes = {n.name: n for n in ast.walk(tree) if isinstance(n, ast.ClassDef)}
    # Recorder subclasses the tree's GDALRaster; tests are a SimpleTestCase.
    assert [ast.unparse(b) for b in classes["Recorder"].bases] == ["GDALRaster"]
    assert [ast.unparse(b) for b in classes["SpatialLookupBytesTests"].bases] == ["SimpleTestCase"]
    assert 'mock.patch("django.contrib.gis.gdal.GDALRaster", Recorder)' in src
    assert "RECORDED.append(type(ds_input))" in src
    assert "raise GDALException" in src
    # Bytes only: every get_prep_value argument is the bytes value.
    calls = [
        (n.func, n.args)
        for n in ast.walk(tree)
        if isinstance(n, ast.Call)
        and isinstance(n.func, ast.Attribute)
        and n.func.attr == "get_prep_value"
    ]
    assert [ast.unparse(f.value) for f, _ in calls] == ["PointField(srid=4326)", "RasterField()"]
    assert all(ast.unparse(args[0]) == "value" for _, args in calls)
    assert 'value = b"' in src
    # No spatial models.
    assert "models.Model" not in PROBE["files"]["models.py"]


def test_native_hint_only_for_gis_fixes() -> None:
    assert native_hint(["django/contrib/gis/gdal/raster/source.py"]) == NATIVE_HINT
    assert native_hint(["django/forms/models.py"]) == ""
    for phrase in ("no spatial models", "Field.get_prep_value", "unittest.mock"):
        assert phrase.lower() in " ".join(NATIVE_HINT.split()).lower()
