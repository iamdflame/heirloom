"""Distro line builder (BUILD-BRIEF §10.4) on a tiny synthetic repo: series and DEP-3
parsing, one commit per patch, the orig-delta check, and the distro_revert mutant."""

from __future__ import annotations

import hashlib
import io
import subprocess
import tarfile
from pathlib import Path

import pytest

from heirloom.lines import distro
from heirloom.lines.distro import (
    DistroBuildError,
    DistroCommit,
    DistroSpec,
    SeriesEntry,
    apply_series,
    changelog_date,
    cves_in,
    dep3_header,
    distro_commits,
    distro_revert_mutant,
    extract,
    header_subject,
    parse_dsc,
    parse_series,
    patches_for,
)
from heirloom.pipeline.presence import ProbeRun

WHEN = "Mon, 28 Sep 2026 16:58:29 +0800"

VALIDATORS = """\
def validate(value):
    if not value:
        raise ValueError("empty")
    return value
"""

DEP3 = """\
Description: Reject whitespace-only values
 A longer explanation that is part of the description.
Author: Jane Doe <jane@example.org>
Bug-Debian: https://bugs.debian.org/1
Last-Update: 2026-01-01
---
--- a/django/core/validators.py
+++ b/django/core/validators.py
@@ -1,4 +1,4 @@
 def validate(value):
-    if not value:
+    if not value or not value.strip():
         raise ValueError("empty")
     return value
"""

FORMAT_PATCH = """\
From 0123456789abcdef0123456789abcdef01234567 Mon Sep 17 00:00:00 2001
From: Upstream Dev <dev@example.org>
Date: Thu, 9 Jul 2026 11:07:28 -0400
Subject: [PATCH] [5.2.x] Fixed CVE-2026-0001 -- Limited the length of
 validated values.

Builds on the earlier fix for CVE-2025-9999.
---
 django/core/validators.py | 2 ++
 1 file changed, 2 insertions(+)

diff --git a/django/core/validators.py b/django/core/validators.py
index 1111111..2222222 100644
--- a/django/core/validators.py
+++ b/django/core/validators.py
@@ -1,4 +1,6 @@
 def validate(value):
     if not value or not value.strip():
         raise ValueError("empty")
+    if len(value) > 10:
+        raise ValueError("long")
     return value
--\x20
2.43.0
"""

SERIES = """\
# Debian patches
fix-empty.patch
CVE-2026-0001.patch -p1   # security
"""

CHANGELOG = """\
pkg (1:1.0-1) unstable; urgency=medium

  * Security update.

 -- Maintainer Name <maint@example.org>  Mon, 28 Sep 2026 16:58:29 +0800
"""


def sh(cwd: Path, *args: str) -> str:
    return subprocess.run(args, cwd=cwd, check=True, capture_output=True, text=True).stdout


def git(cwd: Path, *args: str) -> str:
    return sh(cwd, "git", "-c", "core.hooksPath=/dev/null", *args)


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    r = tmp_path / "repo"
    (r / "django" / "core").mkdir(parents=True)
    (r / "tests").mkdir()
    (r / "django" / "__init__.py").write_text("VERSION = (1, 0)\n")
    (r / "django" / "core" / "validators.py").write_text(VALIDATORS)
    (r / "tests" / "test_x.py").write_text("x = 1\n")
    git(r, "init", "-q", "-b", "main")
    git(r, "config", "user.name", "Upstream")
    git(r, "config", "user.email", "upstream@example.org")
    git(r, "add", "-A")
    git(r, "commit", "-q", "-m", "Django 1.0")
    git(r, "tag", "-a", "1.0", "-m", "1.0")
    return r


@pytest.fixture
def patches(tmp_path: Path) -> Path:
    d = tmp_path / "debian" / "patches"
    d.mkdir(parents=True)
    (d / "fix-empty.patch").write_text(DEP3)
    (d / "CVE-2026-0001.patch").write_text(FORMAT_PATCH)
    (d / "series").write_text(SERIES)
    return d


# Parsing -----------------------------------------------------------------------


def test_parse_series_skips_comments_and_reads_strip_level() -> None:
    text = "# c\n\na.patch\nb.diff -p0  # trailing comment\n  c.patch\n"
    assert parse_series(text) == [
        SeriesEntry("a.patch"),
        SeriesEntry("b.diff", 0),
        SeriesEntry("c.patch"),
    ]


@pytest.mark.parametrize("bad", ["../x.patch\n", "/etc/passwd\n", "a.patch -R\n"])
def test_parse_series_rejects_escapes_and_unknown_options(bad: str) -> None:
    with pytest.raises(DistroBuildError):
        parse_series(bad)


def test_dep3_header_stops_at_the_diff() -> None:
    header = dep3_header(DEP3)
    assert header.splitlines()[0] == "Description: Reject whitespace-only values"
    assert header.splitlines()[-1] == "Last-Update: 2026-01-01"
    assert "--- a/" not in header
    assert header_subject(header) == "Reject whitespace-only values"


def test_format_patch_header_ends_before_the_diffstat() -> None:
    header = dep3_header(FORMAT_PATCH)
    assert header.startswith("From 0123456789abcdef")
    assert header.endswith("Builds on the earlier fix for CVE-2025-9999.")
    assert "validators.py | 2" not in header
    assert header_subject(header) == (
        "[5.2.x] Fixed CVE-2026-0001 -- Limited the length of validated values."
    )
    assert cves_in("CVE-2026-0001.patch", header) == ["CVE-2025-9999", "CVE-2026-0001"]


def test_parse_dsc_and_changelog_date() -> None:
    dsc = (
        "Format: 3.0 (quilt)\nChecksums-Sha1:\n aa 1 x.tar.gz\n"
        "Checksums-Sha256:\n " + "b" * 64 + " 10 pkg_1.0.orig.tar.gz\n "
        "" + "c" * 64 + " 20 pkg_1.0-1.debian.tar.xz\nFiles:\n dd 10 pkg_1.0.orig.tar.gz\n"
    )
    assert parse_dsc(dsc) == {
        "pkg_1.0.orig.tar.gz": "b" * 64,
        "pkg_1.0-1.debian.tar.xz": "c" * 64,
    }
    assert changelog_date(CHANGELOG) == WHEN


# One commit per patch ----------------------------------------------------------------


def worktree(repo: Path, path: Path, branch: str) -> Path:
    git(repo, "worktree", "add", "-q", "-B", branch, str(path), "1.0")
    return path


def test_apply_series_commits_each_patch_with_its_header_and_trailer(
    repo: Path, patches: Path, tmp_path: Path
) -> None:
    wt = worktree(repo, tmp_path / "wt", "distro/test")
    entries = parse_series((patches / "series").read_text())
    commits = apply_series(wt, patches, entries, "test", WHEN)

    assert [c.file for c in commits] == ["fix-empty.patch", "CVE-2026-0001.patch"]
    assert [c.cves for c in commits] == [[], ["CVE-2025-9999", "CVE-2026-0001"]]
    assert all(c.files == ["django/core/validators.py"] for c in commits)
    assert commits[0].sha256 == hashlib.sha256(DEP3.encode()).hexdigest()
    log = git(repo, "log", "--format=%(trailers:key=Distro-Patch,valueonly)%x00", "distro/test")
    assert [x.strip() for x in log.split("\x00") if x.strip()] == [
        "CVE-2026-0001.patch",
        "fix-empty.patch",
    ]
    msg = git(repo, "log", "-1", "--format=%B", commits[0].commit)
    assert msg.startswith(dep3_header(DEP3) + "\n\nDistro-Patch: fix-empty.patch\n")
    assert git(repo, "log", "-1", "--format=%an|%cn", commits[1].commit).strip() == (
        "Heirloom distro builder|Heirloom distro builder"
    )
    assert "if len(value) > 10:" in (wt / "django/core/validators.py").read_text()
    assert git(wt, "status", "--porcelain") == ""
    assert git(repo, "rev-list", "--count", "1.0..distro/test").strip() == "2"

    # Same sources, same date: a rebuild reproduces the same commits.
    wt2 = worktree(repo, tmp_path / "wt2", "distro/again")
    again = apply_series(wt2, patches, entries, "test", WHEN)
    assert [c.commit for c in again] == [c.commit for c in commits]


def test_patch_that_needs_fuzz_is_refused_and_leaves_the_tree_alone(
    repo: Path, patches: Path, tmp_path: Path
) -> None:
    (patches / "fuzzy.patch").write_text(DEP3.replace(' raise ValueError("empty")', " pass"))
    wt = worktree(repo, tmp_path / "wt", "distro/fuzzy")
    with pytest.raises(DistroBuildError, match="does not apply with fuzz 0"):
        apply_series(wt, patches, [SeriesEntry("fuzzy.patch")], "fuzzy", WHEN)
    assert git(wt, "status", "--porcelain") == ""


def test_already_applied_patch_is_an_error(repo: Path, patches: Path, tmp_path: Path) -> None:
    wt = worktree(repo, tmp_path / "wt", "distro/twice")
    twice = [SeriesEntry("fix-empty.patch"), SeriesEntry("fix-empty.patch")]
    with pytest.raises(DistroBuildError, match=r"fix-empty\.patch does not apply"):
        apply_series(wt, patches, twice, "twice", WHEN)


def test_series_entry_must_be_a_file_inside_the_patches_dir(
    repo: Path, patches: Path, tmp_path: Path
) -> None:
    wt = worktree(repo, tmp_path / "wt", "distro/missing")
    with pytest.raises(DistroBuildError, match="is not a file"):
        apply_series(wt, patches, [SeriesEntry("missing.patch")], "missing", WHEN)


# The whole build, offline --------------------------------------------------------


def tarball(members: dict[str, str], mode: str) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode=mode) as tf:  # type: ignore[call-overload]
        for name, text in members.items():
            data = text.encode()
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tf.addfile(info, io.BytesIO(data))
    return buf.getvalue()


SPEC = DistroSpec("test-line", "debian", "x", "pkg", "1:1.0-1", "1.0")
BASE = "https://example.invalid/pool/"


def sources(orig_init: str = "VERSION = (1, 0)\n", corrupt: bool = False) -> dict[str, bytes]:
    orig = tarball(
        {
            "Pkg-1.0/django/__init__.py": orig_init,
            "Pkg-1.0/django/core/validators.py": VALIDATORS,
            "Pkg-1.0/PKG-INFO": "Name: pkg\n",
        },
        "w:gz",
    )
    deb = tarball(
        {
            "debian/changelog": CHANGELOG,
            "debian/patches/series": SERIES,
            "debian/patches/fix-empty.patch": DEP3,
            "debian/patches/CVE-2026-0001.patch": FORMAT_PATCH,
        },
        "w:xz",
    )
    sums = {n: hashlib.sha256(b).hexdigest() for n, b in (("o", orig), ("d", deb))}
    if corrupt:
        sums["d"] = "0" * 64
    dsc = (
        "Format: 3.0 (quilt)\nChecksums-Sha256:\n"
        f" {sums['o']} {len(orig)} pkg_1.0.orig.tar.gz\n"
        f" {sums['d']} {len(deb)} pkg_1.0-1.debian.tar.xz\n"
    ).encode()
    return {
        BASE + "pkg_1.0-1.dsc": dsc,
        BASE + "pkg_1.0.orig.tar.gz": orig,
        BASE + "pkg_1.0-1.debian.tar.xz": deb,
    }


def fake_fetch(files: dict[str, bytes]) -> distro.Fetch:
    return lambda url: (files[url], url)


def test_build_records_downloads_patches_and_tip(repo: Path, tmp_path: Path) -> None:
    files = sources()
    rec = distro.build(repo, tmp_path / "work", SPEC, fetch=fake_fetch(files), urls=list(files))

    assert rec.orig_diff_django == []
    assert rec.orig_delta_commit is None
    assert rec.upstream_commit == git(repo, "rev-parse", "1.0^{commit}").strip()
    assert rec.tip == git(repo, "rev-parse", "distro/test-line").strip()
    assert [p["file"] for p in rec.patches] == ["fix-empty.patch", "CVE-2026-0001.patch"]
    assert rec.changelog_date == WHEN
    by_role = {d["role"]: d for d in rec.downloads}
    orig_sha = hashlib.sha256(files[BASE + "pkg_1.0.orig.tar.gz"]).hexdigest()
    assert by_role["orig"]["sha256"] == orig_sha
    # every download landed in its own fresh directory
    dirs = list((tmp_path / "work" / "downloads").glob("test-line-*/*"))
    assert sorted(p.name.split("-")[0] for p in dirs) == sorted(
        ["debian", "debian", "dsc", "orig", "orig"]
    )
    assert [c.patch for c in distro_commits(repo, rec.tip)] == [
        "CVE-2026-0001.patch",
        "fix-empty.patch",
    ]


def test_build_commits_an_orig_delta_when_the_tarball_differs(repo: Path, tmp_path: Path) -> None:
    files = sources(orig_init="VERSION = (1, 0, 'debian')\n")
    rec = distro.build(repo, tmp_path / "work", SPEC, fetch=fake_fetch(files), urls=list(files))

    assert len(rec.orig_diff_django) == 1 and "__init__.py" in rec.orig_diff_django[0]
    assert rec.orig_delta_commit is not None
    msg = git(repo, "log", "-1", "--format=%B", rec.orig_delta_commit)
    assert msg.startswith("orig delta: pkg_1.0.orig.tar.gz django/ differs from tag 1.0")
    assert "Distro-Orig-Delta: pkg_1.0.orig.tar.gz" in msg
    shown = git(repo, "show", f"{rec.tip}:django/__init__.py")
    assert shown == "VERSION = (1, 0, 'debian')\n"
    # The walk passes the delta commit and stops at the upstream tag.
    assert len(distro_commits(repo, rec.tip)) == 2


def test_build_refuses_a_tarball_that_does_not_match_the_dsc(repo: Path, tmp_path: Path) -> None:
    files = sources(corrupt=True)
    with pytest.raises(DistroBuildError, match=r"does not match the \.dsc"):
        distro.build(repo, tmp_path / "work", SPEC, fetch=fake_fetch(files), urls=list(files))


def test_extract_refuses_members_outside_the_destination(tmp_path: Path) -> None:
    evil = tmp_path / "evil.tar.gz"
    evil.write_bytes(tarball({"top/ok.txt": "ok", "../escape.txt": "no"}, "w:gz"))
    dest = tmp_path / "dest"
    dest.mkdir()
    with pytest.raises(tarfile.OutsideDestinationError):
        extract(evil, dest)
    assert not (tmp_path / "escape.txt").exists()


# distro_revert: the line minus its own patch for the CVE (C4a on distro lines) ---------


def test_patches_for_prefers_the_patch_named_after_the_cve() -> None:
    commits = [
        DistroCommit("c3", "CVE-2025-13473.patch", ("CVE-2024-39329", "CVE-2025-13473")),
        DistroCommit("c2", "CVE-2024-39329.patch", ("CVE-2024-39329",)),
        DistroCommit("c1", "CVE-2026-1312-1.patch", ("CVE-2026-1312",)),
        DistroCommit("c0", "CVE-2026-1312-2.patch", ("CVE-2026-1312",)),
    ]
    assert [c.sha for c in patches_for(commits, "CVE-2024-39329")] == ["c2"]
    assert [c.sha for c in patches_for(commits, "CVE-2026-1312")] == ["c1", "c0"]
    assert [c.sha for c in patches_for(commits, "CVE-2026-131")] == []


def test_distro_revert_mutant_reverts_the_cve_patch_and_runs_the_probe(
    repo: Path, tmp_path: Path
) -> None:
    files = sources()
    rec = distro.build(repo, tmp_path / "work", SPEC, fetch=fake_fetch(files), urls=list(files))
    mut = tmp_path / "mut"
    git(repo, "worktree", "add", "-q", "--detach", str(mut), rec.tip)
    seen: list[str] = []

    def probe(tree: Path, name: str) -> ProbeRun:
        seen.append(name)
        fixed = "len(value) > 10" in (tree / "django/core/validators.py").read_text()
        return ProbeRun("PASS") if fixed else ProbeRun("FAIL", frozenset({"hl.T.test_long"}))

    m = distro_revert_mutant(repo, "CVE-2026-0001", rec.tip, lambda: mut, probe)
    assert m is not None
    assert (m.method, m.built, m.caught) == ("distro_revert", True, True)
    assert m.detail == "reverted CVE-2026-0001.patch"
    assert seen == ["distro_revert"]
    # the earlier, unrelated distro patch is still applied
    assert "not value.strip()" in (mut / "django/core/validators.py").read_text()
    # no patch for this CVE on the line: no distro_revert mutant at all
    assert distro_revert_mutant(repo, "CVE-2026-9999", rec.tip, lambda: mut, probe) is None
