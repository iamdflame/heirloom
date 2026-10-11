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


GUARDED = """\
from django.test import SimpleTestCase


def get_validator():
    try:
        from django.core.validators import DomainNameValidator
        return DomainNameValidator
    except ImportError:
        return None


class T(SimpleTestCase):
    def test_x(self):
        assert get_validator() is not None, "DomainNameValidator does not exist"
"""

PLAIN = """\
from django.core.validators import DomainNameValidator
from django.test import SimpleTestCase


class T(SimpleTestCase):
    def test_x(self):
        try:
            DomainNameValidator()("example.com\\n")
        except Exception:
            pass
"""


def test_probe_rules_refuse_imports_that_mask_a_missing_api() -> None:
    """The 53878 porter turned ImportError into an AssertionError (evals/cve_2026_53878.json)."""
    problems = validate({"models.py": "", "tests.py": GUARDED}, "hl_x")
    assert any("do not guard imports" in p for p in problems)
    caught = GUARDED.replace(
        "        from django.core.validators import DomainNameValidator\n", "        pass\n"
    ).replace("except ImportError:", "except (ValueError, ModuleNotFoundError):")
    problems = validate({"models.py": "", "tests.py": caught}, "hl_x")
    assert any("do not guard imports" in p for p in problems)
    assert validate({"models.py": "", "tests.py": PLAIN}, "hl_x") == []
