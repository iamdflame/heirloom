from datetime import date
from pathlib import Path

import pytest

from heirloom.sources.django_security import AdvisoryError, load, parse_security_txt

FIXTURE = Path(__file__).parent / "fixtures" / "security_excerpt.txt"
DJANGO_REPO = Path.home() / "work" / "django"

# From BUILD-BRIEF §1: post-EOL CVEs fixed upstream without a 4.2 patch.
POST_EOL = [
    "CVE-2026-5766", "CVE-2026-35192", "CVE-2026-6907",
    "CVE-2026-6873", "CVE-2026-7666", "CVE-2026-8404", "CVE-2026-35193", "CVE-2026-48587",
    "CVE-2026-48588", "CVE-2026-53877", "CVE-2026-53878",
    "CVE-2026-15307", "CVE-2026-15337", "CVE-2026-15830", "CVE-2026-15920",
    "CVE-2026-77050", "CVE-2026-84429", "CVE-2026-87890", "CVE-2026-87975",
]  # fmt: skip


def test_parses_every_entry() -> None:
    parsed = parse_security_txt(FIXTURE.read_text())
    assert sorted(parsed) == [
        "CVE-2007-0404",
        "CVE-2007-0405",
        "CVE-2023-36053",
        "CVE-2026-77050",
        "CVE-2026-84429",
        "CVE-2026-87890",
        "CVE-2026-87975",
    ]


def test_modern_entry_fields() -> None:
    adv = parse_security_txt(FIXTURE.read_text())["CVE-2026-87975"]
    assert adv.date == date(2026, 10, 6)
    assert adv.title == "Privilege abuse in model formsets with editable primary keys."
    assert adv.url == "https://www.djangoproject.com/weblog/2026/oct/06/security-releases/"
    assert adv.commits == {
        "6.1": "cce6c57ed30ea83725f9d6abb2fe5ee932bab107",
        "6.0": "b83ab92bc5474558b083a840ea4628b3261b2cfe",
        "5.2": "ff27883ca055aa9ab23015b50674a5b10dfe5a41",
    }
    assert adv.fix_commit("5.2") == "ff27883ca055aa9ab23015b50674a5b10dfe5a41"


def test_multiline_title_keeps_rst_literals() -> None:
    adv = parse_security_txt(FIXTURE.read_text())["CVE-2026-77050"]
    assert adv.title == (
        "Potential denial-of-service vulnerability in ``get_supported_language_variant()``."
    )


def test_title_sharing_a_line_with_full_description() -> None:
    adv = parse_security_txt(FIXTURE.read_text())["CVE-2023-36053"]
    assert adv.title == (
        "Potential regular expression denial of service vulnerability in "
        "``EmailValidator``/``URLValidator``."
    )
    assert adv.commits["4.2"] == "b7c5feb35a31799de6e582ad6a5a91a9de74e0f9"


def test_old_format_with_versions_affected_heading() -> None:
    parsed = parse_security_txt(FIXTURE.read_text())
    old = parsed["CVE-2007-0405"]
    assert old.title == 'Apparent "caching" of authenticated user.'
    assert old.commits == {"0.95": "e89f0a65581f82a5740bfe989136cea75d09cd67"}
    assert parsed["CVE-2007-0404"].commits == {}


def test_missing_branch_is_an_error_not_a_guess() -> None:
    adv = parse_security_txt(FIXTURE.read_text())["CVE-2026-87975"]
    with pytest.raises(AdvisoryError):
        adv.fix_commit("4.2")


@pytest.mark.skipif(not (DJANGO_REPO / ".git").exists(), reason="needs ~/work/django clone")
def test_live_archive_has_all_post_eol_cves_without_42_patch() -> None:
    parsed = load(DJANGO_REPO)
    for cve in POST_EOL:
        assert cve in parsed, cve
        assert "5.2" in parsed[cve].commits, cve
        assert "4.2" not in parsed[cve].commits, cve
