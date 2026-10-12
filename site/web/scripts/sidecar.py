"""Writes the two inputs the site build can't compute in CI, next to the export:

- site/data/advisories.json: title, date and URL of each CVE, from Django's
  docs/releases/security.txt (parsed with the repo's own parser);
- site/data/artifacts.json: the run/<CVE> directories published on the ``artifacts`` branch,
  pinned to its tip commit, so receipts can link raw logs.

    uv run python site/web/scripts/sidecar.py [/path/to/django] [ref]
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from heirloom.sources.django_security import load

ROOT = Path(__file__).resolve().parents[3]
repo = Path(sys.argv[1] if len(sys.argv) > 1 else "/home/ubuntu/work/django")
ref = sys.argv[2] if len(sys.argv) > 2 else "origin/main"
cves = json.loads((ROOT / "site/data/index.json").read_text())["cves"]
advisories = load(repo, ref)
out = {}
for cve in cves:
    a = advisories.get(cve)
    if a is None:
        sys.exit(f"{cve} is not in {repo}@{ref}:docs/releases/security.txt")
    out[cve] = {"date": a.date.isoformat(), "title": a.title, "url": a.url}
dest = ROOT / "site/data/advisories.json"
dest.write_text(
    json.dumps({"source": f"django {ref}:docs/releases/security.txt", "advisories": out}, indent=1)
    + "\n"
)
print(f"wrote {len(out)} advisories to {dest.relative_to(ROOT)}")

sha = subprocess.run(["git", "-C", str(ROOT), "rev-parse", "origin/artifacts"], check=True,
                     capture_output=True, text=True).stdout.strip()  # fmt: skip
tree = subprocess.run(["git", "-C", str(ROOT), "ls-tree", "-r", "--name-only", sha],
                      check=True, capture_output=True, text=True).stdout.split()  # fmt: skip
dirs = sorted({"/".join(f.split("/")[:3]) for f in tree if f.count("/") >= 3})
art = ROOT / "site/data/artifacts.json"
art.write_text(
    json.dumps(
        {"repo": "iamdflame/heirloom", "branch": "artifacts", "sha": sha, "dirs": dirs}, indent=1
    )
    + "\n"
)
print(f"wrote {len(dirs)} artifact dirs @ {sha[:10]} to {art.relative_to(ROOT)}")
