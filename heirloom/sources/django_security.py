"""Parse Django's security archive (``docs/releases/security.txt``).

Each entry looks like::

    October 6, 2026 - :cve:`2026-87975`
    -----------------------------------

    Privilege abuse in model formsets with editable primary keys.
    `Full description
    <https://www.djangoproject.com/weblog/2026/oct/06/security-releases/>`__

    * Django 5.2 :commit:`(patch) <ff27883ca055aa9ab23015b50674a5b10dfe5a41>`
"""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

HEADER = re.compile(r"^(?P<date>[A-Z][a-z]+ \d{1,2}, \d{4}) - :cve:`(?P<id>\d{4}-\d{4,})`\s*$")
COMMIT = re.compile(
    r"^\*\s+Django\s+(?P<branch>\d+(?:\.\d+)*)\s+:commit:`[^<`]*<(?P<sha>[0-9a-f]{40})>`"
)
FULL_DESCRIPTION = re.compile(r"`Full description\s*<(?P<url>[^>]+)>`__", re.S)


class AdvisoryError(LookupError):
    pass


@dataclass(frozen=True)
class Advisory:
    cve: str
    date: date
    title: str
    url: str | None
    commits: dict[str, str] = field(default_factory=dict)

    def fix_commit(self, branch: str) -> str:
        try:
            return self.commits[branch]
        except KeyError:
            raise AdvisoryError(
                f"{self.cve} has no Django {branch} commit (has: {sorted(self.commits)})"
            ) from None


def parse_security_txt(text: str) -> dict[str, Advisory]:
    lines = text.splitlines()
    starts = [i for i, line in enumerate(lines) if HEADER.match(line)]
    advisories: dict[str, Advisory] = {}
    for n, start in enumerate(starts):
        end = starts[n + 1] if n + 1 < len(starts) else len(lines)
        m = HEADER.match(lines[start])
        assert m is not None
        body = lines[start + 1 : end]
        if body and set(body[0].strip()) == {"-"}:
            body = body[1:]
        commits: dict[str, str] = {}
        prose: list[str] = []
        for line in body:
            c = COMMIT.match(line.strip())
            if c:
                commits[c["branch"]] = c["sha"]
            elif not commits and not line.startswith(("Versions affected", "~~~")):
                prose.append(line)
        text_block = " ".join(" ".join(prose).split())
        url_match = FULL_DESCRIPTION.search(text_block)
        title = text_block[: url_match.start()] if url_match else text_block
        cve = f"CVE-{m['id']}"
        advisories[cve] = Advisory(
            cve=cve,
            date=datetime.strptime(m["date"], "%B %d, %Y").date(),
            title=" ".join(title.split()),
            url=url_match["url"].strip() if url_match else None,
            commits=commits,
        )
    return advisories


def read_security_txt(repo: Path, ref: str = "origin/main") -> str:
    return subprocess.run(
        ["git", "-C", str(repo), "show", f"{ref}:docs/releases/security.txt"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout


def load(repo: Path, ref: str = "origin/main") -> dict[str, Advisory]:
    return parse_security_txt(read_security_txt(repo, ref))
