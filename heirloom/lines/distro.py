"""Distro lines (BUILD-BRIEF §10.4): a distribution's python-django source package,
rebuilt as a branch in the Django clone with one commit per distro patch.

1. Download the .dsc, the orig tarball and the debian tarball, each into a fresh,
   empty directory, and check them against the .dsc's Checksums-Sha256.
2. ``git worktree add -B distro/<name> <path> <upstream tag>``.
3. ``diff -r`` the tarball's django/ against the worktree's django/. A difference
   becomes one "orig delta" commit instead of being ignored.
4. Apply ``debian/patches/series`` in order with ``patch -p1`` (fuzz 0, as
   dpkg-source does), ONE COMMIT PER PATCH: message = the patch's DEP-3 header,
   trailer ``Distro-Patch: <file>``.
5. Record the URLs and sha256s of the downloads, every patch commit and the tip.

Downloads are untrusted data: tarballs are extracted with tarfile's ``data``
filter and their contents are only read, compared, copied or fed to ``patch``;
nothing in them is executed. Commits use a fixed identity and the changelog's
date, so rebuilding from the same sources reproduces the same tip sha.

Distro lines never publish (``kind="distro"``, ``publish=False``).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import tarfile
import tempfile
from collections.abc import Callable, Sequence
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlencode

from heirloom.git_ops import git, rev_parse
from heirloom.pipeline.presence import MutantOutcome, ProbeRun

CVE_ID = re.compile(r"CVE-\d{4}-\d{4,}")
PATCH_TRAILER = "Distro-Patch"
ORIG_DELTA_TRAILER = "Distro-Orig-Delta"
_TRAILER = re.compile(rf"^{PATCH_TRAILER}: (?P<file>\S+)\s*$", re.M)
_DELTA = re.compile(rf"^{ORIG_DELTA_TRAILER}: ", re.M)
BUILDER = ("Heirloom distro builder", "heirloom-distro@invalid")
LAUNCHPAD_API = "https://api.launchpad.net/1.0"
DEBIAN_POOL = "https://deb.debian.org/debian/pool/main"

# (body, final URL after redirects)
Fetch = Callable[[str], tuple[bytes, str]]


class DistroBuildError(RuntimeError):
    pass


@dataclass(frozen=True)
class DistroSpec:
    name: str
    archive: Literal["launchpad", "debian"]
    series: str
    package: str
    version: str  # with epoch, as the archive publishes it
    upstream_tag: str

    @property
    def branch(self) -> str:
        return f"distro/{self.name}"

    @property
    def version_noepoch(self) -> str:
        return self.version.split(":", 1)[-1]


DISTROS: dict[str, DistroSpec] = {
    "ubuntu-noble": DistroSpec(
        "ubuntu-noble", "launchpad", "noble", "python-django", "3:4.2.11-1ubuntu1.18", "4.2.11"
    ),
    "debian-trixie": DistroSpec(
        "debian-trixie", "debian", "trixie", "python-django", "3:4.2.28-0+deb13u2", "4.2.28"
    ),
}


# Parsing -------------------------------------------------------------------------


@dataclass(frozen=True)
class SeriesEntry:
    name: str
    strip: int = 1


def parse_series(text: str) -> list[SeriesEntry]:
    """quilt's ``debian/patches/series``: one patch per line, ``#`` comments, ``-pN``."""
    entries: list[SeriesEntry] = []
    for raw in text.splitlines():
        line = re.sub(r"(^|\s)#.*$", "", raw).strip()
        if not line:
            continue
        name, *opts = line.split()
        strip = 1
        for opt in opts:
            m = re.fullmatch(r"-p(\d+)", opt)
            if m is None:
                raise DistroBuildError(f"unsupported series option {opt!r} for {name}")
            strip = int(m[1])
        if name.startswith("/") or ".." in Path(name).parts:
            raise DistroBuildError(f"series entry escapes debian/patches: {name!r}")
        entries.append(SeriesEntry(name, strip))
    return entries


def dep3_header(text: str) -> str:
    """The patch's meta-information: everything before the diff (DEP-3 / format-patch)."""
    out: list[str] = []
    for line in text.splitlines():
        if line.rstrip() == "---" or line.startswith(("--- ", "diff ", "Index: ", "=== ")):
            break
        out.append(line.rstrip())
    return "\n".join(out).strip()


def header_subject(header: str) -> str:
    """Subject: (folded, as in format-patch), Description:'s first line, else line one."""
    lines = header.splitlines()
    for key in ("Subject:", "Description:"):
        for i, line in enumerate(lines):
            if line.startswith(key):
                text = line[len(key) :].strip()
                for more in lines[i + 1 :] if key == "Subject:" else ():
                    if not more.startswith(" ") or not more.strip():
                        break
                    text += " " + more.strip()
                return re.sub(r"^\[PATCH[^\]]*\]\s*", "", text)
    return next((line.strip() for line in lines if line.strip()), "")


def cves_in(*texts: str) -> list[str]:
    return sorted({m for t in texts for m in CVE_ID.findall(t)})


def parse_dsc(text: str) -> dict[str, str]:
    """``Checksums-Sha256`` of a .dsc: file name → sha256."""
    out: dict[str, str] = {}
    inside = False
    for line in text.splitlines():
        if line.startswith("Checksums-Sha256:"):
            inside = True
            continue
        if inside:
            if not line.startswith(" "):
                break
            sha, _size, name = line.split()
            out[name] = sha
    return out


def changelog_date(text: str) -> str:
    """The RFC 2822 date of the newest debian/changelog entry."""
    for line in text.splitlines():
        m = re.match(r"^ -- .+?>  (?P<date>\S.*)$", line)
        if m:
            return m["date"].strip()
    raise DistroBuildError("debian/changelog has no trailer line")


def commit_message(header: str, patch: str, line: str) -> str:
    body = header.strip() or patch
    return f"{body}\n\n{PATCH_TRAILER}: {patch}\nDistro-Line: {line}\n"


# Downloads -------------------------------------------------------------------------


def http_get(url: str) -> tuple[bytes, str]:
    import httpx

    with httpx.Client(follow_redirects=True, timeout=180) as client:
        resp = client.get(url)
        resp.raise_for_status()
        return resp.content, str(resp.url)


def source_urls(spec: DistroSpec, fetch: Fetch) -> list[str]:
    """The source package's file URLs, as the archive publishes them."""
    if spec.archive == "launchpad":
        query = urlencode(
            {
                "ws.op": "getPublishedSources",
                "source_name": spec.package,
                "exact_match": "true",
                "version": spec.version,
                "distro_series": f"{LAUNCHPAD_API}/ubuntu/{spec.series}",
            }
        )
        body, _ = fetch(f"{LAUNCHPAD_API}/ubuntu/+archive/primary?{query}")
        entries = json.loads(body)["entries"]
        if not entries:
            raise DistroBuildError(f"Launchpad publishes no {spec.package} {spec.version}")
        body, _ = fetch(f"{entries[0]['self_link']}?ws.op=sourceFileUrls")
        urls: list[str] = json.loads(body)
        return urls
    prefix = spec.package[:4] if spec.package.startswith("lib") else spec.package[0]
    base = f"{DEBIAN_POOL}/{prefix}/{spec.package}/"
    dsc = f"{base}{spec.package}_{spec.version_noepoch}.dsc"
    body, _ = fetch(dsc)
    return [dsc, *(base + name for name in parse_dsc(body.decode()))]


def classify_urls(urls: Sequence[str]) -> dict[str, str]:
    roles: dict[str, str] = {}
    for url in urls:
        name = url.rsplit("/", 1)[-1]
        if name.endswith(".dsc"):
            roles["dsc"] = url
        elif ".orig.tar." in name and not name.endswith(".asc"):
            roles["orig"] = url
        elif ".debian.tar." in name:
            roles["debian"] = url
    missing = {"dsc", "orig", "debian"} - set(roles)
    if missing:
        raise DistroBuildError(f"source package lacks {sorted(missing)}: {list(urls)}")
    return roles


@dataclass(frozen=True)
class Download:
    role: str
    name: str
    url: str
    final_url: str
    path: Path
    sha256: str
    size: int


def fresh_dir(parent: Path, prefix: str) -> Path:
    """A new, empty directory (never reused: downloads must not mix)."""
    parent.mkdir(parents=True, exist_ok=True)
    return Path(tempfile.mkdtemp(prefix=f"{prefix}-", dir=parent))


def download(role: str, url: str, dest: Path, fetch: Fetch) -> Download:
    if any(dest.iterdir()):
        raise DistroBuildError(f"{dest} is not empty")
    body, final = fetch(url)
    name = url.rsplit("/", 1)[-1]
    if not re.fullmatch(r"[\w.+~-]+", name):
        raise DistroBuildError(f"unexpected file name {name!r}")
    path = dest / name
    path.write_bytes(body)
    return Download(role, name, url, final, path, hashlib.sha256(body).hexdigest(), len(body))


def extract(tarball: Path, dest: Path) -> Path:
    """Extract into an empty directory (``data`` filter); return the single top directory."""
    if any(dest.iterdir()):
        raise DistroBuildError(f"{dest} is not empty")
    with tarfile.open(tarball) as tf:
        tf.extractall(dest, filter="data")
    tops = [p for p in dest.iterdir()]
    if len(tops) != 1 or not tops[0].is_dir():
        raise DistroBuildError(f"{tarball.name}: expected one top-level directory, got {tops}")
    return tops[0]


# Building ------------------------------------------------------------------------


def tree_diff(a: Path, b: Path) -> list[str]:
    """``diff -r -q`` between two directories (empty list: identical)."""
    proc = subprocess.run(["diff", "-r", "-q", str(a), str(b)], capture_output=True, text=True)
    if proc.returncode not in (0, 1):
        raise DistroBuildError(f"diff -r failed: {proc.stderr.strip()}")
    return [line for line in proc.stdout.splitlines() if line.strip()]


def _commit(wt: Path, message: str, when: str) -> str:
    env = {
        **os.environ,
        "GIT_AUTHOR_NAME": BUILDER[0],
        "GIT_AUTHOR_EMAIL": BUILDER[1],
        "GIT_COMMITTER_NAME": BUILDER[0],
        "GIT_COMMITTER_EMAIL": BUILDER[1],
        "GIT_AUTHOR_DATE": when,
        "GIT_COMMITTER_DATE": when,
    }
    cfg = ["-c", "core.autocrlf=false", "-c", "core.hooksPath=/dev/null"]
    subprocess.run(["git", "-C", str(wt), *cfg, "add", "-A"], check=True, capture_output=True)
    proc = subprocess.run(
        [
            "git", "-C", str(wt), *cfg, "-c", "commit.gpgsign=false", "commit", "-q",
            "--allow-empty", "--no-verify", "--cleanup=whitespace", "-F", "-",
        ],
        input=message, text=True, capture_output=True, env=env,
    )  # fmt: skip
    if proc.returncode != 0:
        raise DistroBuildError(f"git commit failed: {proc.stderr.strip()}")
    return rev_parse(wt, "HEAD")


@dataclass(frozen=True)
class PatchCommit:
    file: str
    sha256: str
    strip: int
    commit: str
    subject: str
    cves: list[str]
    files: list[str]


def apply_series(
    wt: Path, patches_dir: Path, entries: Sequence[SeriesEntry], line: str, when: str
) -> list[PatchCommit]:
    """Apply each series entry with ``patch`` (fuzz 0) and commit it on its own."""
    out: list[PatchCommit] = []
    root = patches_dir.resolve()
    for e in entries:
        path = (patches_dir / e.name).resolve()
        if root not in path.parents or not path.is_file():
            raise DistroBuildError(f"series entry {e.name!r} is not a file in {patches_dir}")
        data = path.read_bytes()
        header = dep3_header(data.decode("utf-8", errors="replace"))
        args = [
            "patch", f"-p{e.strip}", "-F0", "-N", "-t", "-u", "-E", "-V", "never",
            "--no-backup-if-mismatch", "--reject-file=-", "-d", str(wt), "-i", str(path),
        ]  # fmt: skip
        dry = subprocess.run([*args, "--dry-run"], capture_output=True, text=True)
        if dry.returncode != 0:
            raise DistroBuildError(f"{e.name} does not apply with fuzz 0:\n{dry.stdout[-2000:]}")
        real = subprocess.run(args, capture_output=True, text=True)
        if real.returncode != 0:
            raise DistroBuildError(f"{e.name} failed after a clean dry run:\n{real.stdout}")
        sha = _commit(wt, commit_message(header, e.name, line), when)
        touched = git(wt, "show", "--format=", "--name-only", sha).split()
        out.append(
            PatchCommit(
                file=e.name,
                sha256=hashlib.sha256(data).hexdigest(),
                strip=e.strip,
                commit=sha,
                subject=header_subject(header),
                cves=cves_in(e.name, header),
                files=touched,
            )
        )
    return out


def orig_delta(wt: Path, src_django: Path, orig_name: str, tag: str, line: str, when: str) -> str:
    """Make the worktree's django/ equal to the tarball's and commit that as one delta."""
    diffs = tree_diff(src_django, wt / "django")
    shutil.rmtree(wt / "django")
    shutil.copytree(src_django, wt / "django", symlinks=True)
    listing = "\n".join(f"  {d}" for d in diffs[:200])
    more = f"\n  … {len(diffs) - 200} more" if len(diffs) > 200 else ""
    msg = (
        f"orig delta: {orig_name} django/ differs from tag {tag}\n\n"
        f"diff -r -q between the tarball's django/ and the tag's django/:\n{listing}{more}\n\n"
        f"{ORIG_DELTA_TRAILER}: {orig_name}\nDistro-Line: {line}\n"
    )
    return _commit(wt, msg, when)


@dataclass
class BuildRecord:
    line: str
    archive: str
    series: str
    package: str
    version: str
    upstream_tag: str
    upstream_commit: str
    repo: str
    branch: str
    downloads: list[dict[str, Any]]
    dsc_sha256_verified: bool  # orig/debian tarballs match the .dsc's Checksums-Sha256
    dsc_signature_verified: bool  # the .dsc's OpenPGP signature (not checked: no keyring)
    orig_diff_django: list[str]
    orig_delta_commit: str | None
    changelog_date: str
    patches: list[dict[str, Any]] = field(default_factory=list)
    tip: str = ""

    def to_json(self) -> dict[str, Any]:
        return asdict(self)


def build(
    repo: Path, work: Path, spec: DistroSpec, *, fetch: Fetch = http_get, urls: Sequence[str] = ()
) -> BuildRecord:
    """Build (or rebuild) ``distro/<name>`` in ``repo``; ``work`` holds downloads and the tree."""
    name = spec.name
    session = fresh_dir(work / "downloads", name)
    resolved = classify_urls(urls or source_urls(spec, fetch))
    dls = {
        role: download(role, url, fresh_dir(session, role), fetch)
        for role, url in sorted(resolved.items())
    }
    expected = parse_dsc(dls["dsc"].path.read_text())
    for role in ("orig", "debian"):
        d = dls[role]
        if expected.get(d.name) != d.sha256:
            raise DistroBuildError(f"{d.name}: sha256 {d.sha256} does not match the .dsc")
    orig_src = extract(dls["orig"].path, fresh_dir(session, "orig-src"))
    deb_src = extract(dls["debian"].path, fresh_dir(session, "debian-src"))
    if deb_src.name != "debian":
        raise DistroBuildError(f"debian tarball top directory is {deb_src.name!r}")
    when = changelog_date((deb_src / "changelog").read_text(errors="replace"))

    wt = work / "distro" / name
    if wt.exists():
        git(repo, "worktree", "remove", "--force", str(wt), check=False)
        if wt.exists():
            shutil.rmtree(wt)
    git(repo, "worktree", "prune")
    wt.parent.mkdir(parents=True, exist_ok=True)
    git(repo, "worktree", "add", "-q", "-B", spec.branch, str(wt), spec.upstream_tag)
    base = rev_parse(wt, "HEAD")
    if base != rev_parse(repo, spec.upstream_tag):
        raise DistroBuildError(f"worktree HEAD {base} is not {spec.upstream_tag}")

    diffs = tree_diff(orig_src / "django", wt / "django")
    delta = None
    if diffs:
        delta = orig_delta(wt, orig_src / "django", dls["orig"].name, spec.upstream_tag, name, when)
    series = (deb_src / "patches" / "series").read_text()
    commits = apply_series(wt, deb_src / "patches", parse_series(series), name, when)
    tip = rev_parse(wt, "HEAD")
    if git(wt, "status", "--porcelain").strip():
        raise DistroBuildError(f"{wt} has uncommitted changes after the build")
    return BuildRecord(
        line=name,
        archive=spec.archive,
        series=spec.series,
        package=spec.package,
        version=spec.version,
        upstream_tag=spec.upstream_tag,
        upstream_commit=base,
        repo=str(repo),
        branch=spec.branch,
        downloads=[
            {k: str(v) if isinstance(v, Path) else v for k, v in asdict(d).items() if k != "path"}
            for d in dls.values()
        ],
        dsc_sha256_verified=True,
        dsc_signature_verified=False,
        orig_diff_django=diffs,
        orig_delta_commit=delta,
        changelog_date=when,
        patches=[asdict(c) for c in commits],
        tip=tip,
    )


def write_record(path: Path, rec: BuildRecord) -> None:
    data: dict[str, Any] = json.loads(path.read_text()) if path.exists() else {}
    lines = data.setdefault("lines", {})
    lines[rec.line] = rec.to_json()
    data["lines"] = dict(sorted(lines.items()))
    path.write_text(json.dumps(data, indent=2, sort_keys=False) + "\n")


def recorded_tip(path: Path, name: str) -> str:
    data = json.loads(path.read_text())
    tip: str = data["lines"][name]["tip"]
    return tip


# The line's own patches as mutants (C4a on distro lines) --------------------------


@dataclass(frozen=True)
class DistroCommit:
    sha: str
    patch: str
    cves: tuple[str, ...]


def distro_commits(repo: Path, tip: str) -> list[DistroCommit]:
    """The line's distro patch commits, newest first (first-parent walk from ``tip``)."""
    out: list[DistroCommit] = []
    log = git(repo, "log", "--first-parent", "-n", "5000", "--format=%H%x00%B%x1e", tip)
    for rec in log.split("\x1e"):
        rec = rec.strip("\n")
        if not rec:
            continue
        sha, body = rec.split("\x00", 1)
        m = _TRAILER.search(body)
        if m is None:
            if _DELTA.search(body):
                continue
            break
        out.append(DistroCommit(sha, m["file"], tuple(cves_in(body))))
    return out


def patches_for(commits: Sequence[DistroCommit], cve: str) -> list[DistroCommit]:
    """The patches named after ``cve`` (CVE-…[-N].patch); else those whose header cites it.

    Ubuntu's headers also cite earlier CVEs they build on (CVE-2025-13473.patch cites
    CVE-2024-39329), so the file name wins over a mention.
    """
    named = [c for c in commits if re.search(rf"(^|[^\d]){re.escape(cve)}([^\d]|$)", c.patch)]
    return named or [c for c in commits if cve in c.cves]


def distro_revert_mutant(
    repo: Path,
    cve: str,
    tip: str,
    tree: Callable[[], Path],
    run_probe: Callable[[Path, str], ProbeRun],
) -> MutantOutcome | None:
    """The line minus its own patch(es) for ``cve``; None when the line has none."""
    commits = patches_for(distro_commits(repo, tip), cve)
    if not commits:
        return None
    wt = tree()
    names = ", ".join(c.patch for c in commits)
    for c in commits:  # newest first
        patch = git(repo, "diff", "--binary", f"{c.sha}^", c.sha)
        ok = git_ok_apply(wt, patch, "-R", "--index") or git_ok_apply(wt, patch, "-R", "--3way")
        if not ok or "<<<<<<<" in git(wt, "diff", "HEAD", check=False):
            return MutantOutcome("distro_revert", False, None, f"{c.patch} does not revert on L")
    return MutantOutcome("distro_revert", True, run_probe(wt, "distro_revert"), f"reverted {names}")


def git_ok_apply(wt: Path, patch: str, *args: str) -> bool:
    proc = subprocess.run(
        ["git", "-C", str(wt), "apply", *args], input=patch, capture_output=True, text=True
    )
    return proc.returncode == 0
