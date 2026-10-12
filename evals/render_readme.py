"""Render README.md's numbers from the evals/*.json files (numbers only from runs).

    python evals/render_readme.py

Rewrites only the blocks between <!-- top:start --> / <!-- top:end --> (the first
screen: campaign, matrix, backtest summary, verify links, limits), <!-- e1:start --> /
<!-- e1:end --> (the full E1 backtest table) and <!-- detail:start --> /
<!-- detail:end --> (per-CVE campaign table, full matrix, detections).
Inputs: results_live.json, campaign_evidence.json, matrix.json, distro_lines.json,
results.json, detections.json, detections_flag_check.json, recovery_b4.json, git log.
"""

from __future__ import annotations

import json
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
RESULTS = ROOT / "evals" / "results.json"
README = ROOT / "README.md"
START, END = "<!-- e1:start -->", "<!-- e1:end -->"
EVALS = ROOT / "evals"
LABELS = {
    "v2": "v2 · Heirloom (calibrated)",
    "v1": "v1 · naive (cherry-pick + LLM, no calibration)",
}


def pct(x: float | None) -> str:
    return "n/a" if x is None else f"{100 * x:.0f}%"


def cost_note(data: dict[str, Any]) -> str:
    rows = [r for runs in data.get("runs", {}).values() for r in runs.values()]
    priced = [r for r in rows if r.get("cost_usd")]
    est = [r for r in priced if r.get("cost_estimated", True)]
    return (
        f"$ figures: {len(priced) - len(est)} of {len(priced)} priced cases use provider-reported "
        f"cost (OpenRouter `usage.cost`, `claude -p` `total_cost_usd` on OpenRouter); the other "
        f"{len(est)} are token × list-price estimates from the LiteLLM gateway, which billed "
        "roughly twice that on 2026-10-11 (see hackathon.md), so treat those as lower bounds."
    )


def table(data: dict[str, Any]) -> str:
    rows = [
        "| Pipeline | Cases | Verdict accuracy (decided) | False NOT_AFFECTED | "
        "False AFFECTED | UNPROVEN | Fellows' 4.2 test passes | Escalation rate | "
        "$ / case | Min / case |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for name in ("v2", "v1"):
        s = data.get("summary", {}).get(name)
        if not s:
            continue
        usd = "n/a" if s["usd_per_case"] is None else f"${s['usd_per_case']:.2f}"
        unknown = f" (+{s['cost_unknown_cases']} unknown)" if s["cost_unknown_cases"] else ""
        rows.append(
            f"| {LABELS[name]} | {s['cases']} | {pct(s['verdict_accuracy'])} "
            f"({s['decided']} decided) | **{s['false_not_affected']}** | "
            f"{s['false_affected']} | {s['unproven']} | {s['fellows_test_pass']} | "
            f"{pct(s['escalation_rate'])} | {usd}{unknown} | {s['minutes_per_case']} |"
        )
    per_case = [
        "",
        "<details><summary>Per case</summary>",
        "",
        "| CVE | Case | Truth | v2 verdict | v2 fellows' test | v1 verdict | v1 fellows' test |",
        "|---|---|---|---|---|---|---|",
    ]
    runs = data.get("runs", {})
    keys = sorted(set(runs.get("v2", {})) | set(runs.get("v1", {})))
    for k in keys:
        a, b = runs.get("v2", {}).get(k, {}), runs.get("v1", {}).get(k, {})
        base = a or b
        reason = f" ({a['reason']})" if a.get("reason") not in (None, "NONE") else ""
        per_case.append(
            f"| {base['cve']} | {base['kind']} | {base['truth']} | "
            f"{a.get('verdict', '—')}{reason} | "
            f"{a.get('fellows_test_passes', '—')} | {b.get('verdict', '—')} | "
            f"{b.get('fellows_test_passes', '—')} |"
        )
    per_case += ["", "</details>"]
    note = (
        f"\n_Set `{data.get('set')}`; rendered from [`evals/results.json`](evals/results.json) "
        "by `evals/render_readme.py`. Accuracy counts only decided cases; UNPROVEN means "
        "Heirloom declined to claim either way and would ask a human. "
        f"{cost_note(data)}_"
    )
    return "\n".join(rows) + note + "\n" + "\n".join(per_case)


def load(name: str) -> Any:
    return json.loads((EVALS / name).read_text())


def num(url: str) -> str:
    return url.rstrip("/").rsplit("/", 1)[-1]


def link(url: str) -> str:
    return f"[#{num(url)}]({url})"


VERDICTS = ("AFFECTED", "NOT_AFFECTED_PROVEN", "UNPROVEN", "no_calibrated_probe")
LINE_LABELS = {"4.2.30": "Django 4.2.30", "debian-trixie": "Debian 13 trixie",
               "ubuntu-noble": "Ubuntu 24.04 noble"}  # fmt: skip
SHORT = {"AFFECTED": "AFFECTED", "NOT_AFFECTED_PROVEN": "not affected (proven)",
         "UNPROVEN": "UNPROVEN", "no_calibrated_probe": "no probe"}  # fmt: skip
NOBLE_LOGS = (
    "https://github.com/iamdflame/heirloom/tree/82c160324de18f5da85166318a18891bb280f143"
    "/matrix/b4-20261011/CVE-2026-87890"
)
NOBLE_FINDING = (
    "noble's CVE-2026-15307 backport leaves the bytes path that upstream closed as "
    "CVE-2026-87890; our calibrated probe shows it."
)


def first_commit() -> str:
    out = subprocess.run(
        ["git", "-C", str(ROOT), "log", "--reverse", "--format=%h %aI", "main"],
        capture_output=True, text=True, check=True,
    ).stdout.split("\n")[0]  # fmt: skip
    sha, date = out.split()
    return f"`{sha}` on {date.replace('T', ' ').replace('+00:00', ' UTC')}"


def top(live: dict[str, Any], ev: dict[str, Any], mx: dict[str, Any], bt: dict[str, Any],
        distro: dict[str, Any], rec: dict[str, Any]) -> str:  # fmt: skip
    sm, per = live["summary"], live["per_cve"]
    v = sm["verdicts"]
    prs = sorted(sm["prs"], key=lambda u: int(num(u)))
    f2p = [x for x in ev["fail_to_pass"] if x["fail_to_pass"]]
    n_before = min(len(x["probe_before"]) for x in f2p)
    n_after = min(len(x["probe_after"]) for x in f2p)
    issues = sorted(sm["evidence_issues"], key=lambda u: int(num(u)))
    unproven = [c for c, r in per.items() if r["verdict"] == "UNPROVEN"]
    proven_na = [c for c, r in per.items() if r["verdict"] == "NOT_AFFECTED_PROVEN"]
    (q,) = ev["questions"]  # the campaign asked exactly one question; fail loudly otherwise
    prec = next(p for p in ev["precedents"] if p["issue"] == q["issue"])
    reused = [a for a in prec["applied_by"] if a["cve"] != q["asked_by"]]
    asker = next(a for a in prec["applied_by"] if a["cve"] == q["asked_by"])
    stacked = [(c, r) for c, r in per.items() if r["depends_on"] and "/pull/" in r["link"]]
    ev_by = {e["cve"]: e for e in live["events"] if e.get("pr")}
    out = [
        "**Heirloom is an agent that keeps end-of-life software patched.** For each new upstream "
        "security fix it writes an independent probe, calibrates it on upstream's own before/after "
        "commits, proves on the old line whether the bug is there, and then publishes either a "
        "verified candidate backport or the evidence of why it could not decide.",
        "",
        f"### What it did, unattended: Django 4.2 after its EOL ({live['campaign']} campaign)",
        "",
        f"- **{sm['cves']} post-EOL Django CVEs on 4.2:** "
        + " · ".join(f"**{v.get(k, 0)}** {k}" for k in VERDICTS[:3])
        + " ([results_live.json](evals/results_live.json)).",
        f"- **{len(prs)} candidate backport PRs**, {len(f2p)} of {len(prs)} with the probe "
        f"FAIL ×{n_before} before → PASS ×{n_after} after the fix: "
        "[iamdflame/django/pulls](https://github.com/iamdflame/django/pulls) "
        f"({link(prs[0])}–{link(prs[-1])}; [fail→pass](evals/campaign_evidence.json)).",
        f"- **{len(issues)} evidence issues, no code,** for the rest: {len(unproven)} UNPROVEN "
        f"(it could not prove either way) and {len(proven_na)} NOT_AFFECTED_PROVEN: "
        + " ".join(link(u) for u in issues)
        + ".",
        f"- **{len(ev['questions'])} question asked:** {link(q['issue'])}, by {q['asked_by']} "
        f"(`{prec['kind']}`). "
        + "".join(
            f"{c} hit the same kind and waited on it instead of asking again. " for c in q["waited"]
        )
        + f"The answer (`{prec['answer']}`) became precedent {prec['id']}; "
        + ", ".join(f"{a['cve']}'s {link(a['pr'])} reused it without asking" for a in reused)
        + f" (and {asker['cve']}'s own {link(asker['pr'])} applied it).",
    ]
    for c, r in stacked:
        e = ev_by.get(c, {})
        dep = e.get("depends_on", r["depends_on"])[0]
        base = per[dep]["link"]
        blame = (e.get("blamed_into") or [""])[0][:10]
        out.append(
            f"- **Stacked:** {c}'s fix rewrites lines that {dep}'s fix introduced "
            f"(git blame `{blame}`), so {link(r['link'])} is stacked on Heirloom's own "
            f"{dep} backport {link(base)} (base `{e.get('base_branch', '')}`)."
        )
    # matrix: the campaign's CVEs on 3 lines
    cells = [c for c in mx["cells"] if c["cve"] in per]
    lines = list(mx["lines"])
    count = {ln: Counter(c["verdict"] for c in cells if c["line"] == ln) for ln in lines}
    out += [
        "",
        f"### The same {sm['cves']} CVEs on three 4.2 lines "
        "([matrix.json](evals/matrix.json), $0, probes reused)",
        "",
        "| Line | " + " | ".join(SHORT[k] for k in VERDICTS) + " |",
        "|---|" + "---:|" * len(VERDICTS),
    ]
    for ln in lines:
        ver = distro.get(ln, {}).get("version")
        label = LINE_LABELS.get(ln, ln) + (f" (`{ver}`)" if ver else "")
        out.append(f"| {label} | " + " | ".join(str(count[ln].get(k, 0)) for k in VERDICTS) + " |")
    cross = [x for x in mx["summary"]["distro_patched_cross_check"]
             if x["cve"] in per and x["line"] == "ubuntu-noble"]  # fmt: skip
    met = [x["cve"] for x in cross if x["met"]]
    unmet = [f"{x['cve']} is {x['verdict']} ({x['reason']})" for x in cross if not x["met"]]
    noble = next(c for c in cells if c["cve"] == "CVE-2026-87890" and c["line"] == "ubuntu-noble")
    runs = {k: Counter(r["outcome"] for r in v) for k, v in noble["runs"].items()}
    out += [
        "",
        f"**Ubuntu cross-check:** of the {len(cross)} of these CVEs that noble already patches, "
        f"{len(met)} come out NOT_AFFECTED_PROVEN on noble ({', '.join(met)})"
        + (f"; {'; '.join(unmet)} there" if unmet else "")
        + ".",
        "",
        f"**Ubuntu finding:** {NOBLE_FINDING} The probe is hand-written and calibrated on "
        f"Django's own fix commits (FAIL ×{runs['um']['FAIL']} before `dd0558d1`, "
        f"PASS ×{runs['up']['PASS']} after; FAIL ×{runs['lt']['FAIL']} on noble's tree; "
        f"[raw logs]({NOBLE_LOGS}), "
        "[draft report](docs/outreach/ubuntu-cve-2026-87890.md), not filed).",
    ]
    # backtest summary
    out += [
        "",
        "### Backtest: does calibration help? ([results.json](evals/results.json))",
        "",
        "| Pipeline | Cases | Accuracy (decided) | **False NOT_AFFECTED** | UNPROVEN "
        "| Escalation |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for name in ("v1", "v2"):
        b = bt["summary"][name]
        out.append(
            f"| {LABELS[name]} | {b['cases']} | {pct(b['verdict_accuracy'])} ({b['decided']}) | "
            f"**{b['false_not_affected']}** | {b['unproven']} | {pct(b['escalation_rate'])} |"
        )
    out += [
        "",
        "A false NOT_AFFECTED is the dangerous error (a vulnerable line declared safe). "
        "Full table, cost and per-case rows [below](#e1-backtest-django-42-2026-cves).",
    ]
    # verify links
    fail = next(s_ for s_ in rec["stages"] if s_["status"] == "failed")
    traces = sorted({s_["trace_id"] for s_ in rec["stages"] if s_.get("trace_id")})
    out += [
        "",
        "### Verify it yourself",
        "",
        "- **Backport PRs:** [iamdflame/django/pulls](https://github.com/iamdflame/django/pulls). "
        "Every PR shows its verdict, the probe's FAIL on U⁻ and FAIL→PASS on 4.2, calibration "
        "logs, a neatlogs span per claim and its Entire checkpoint.",
        "- **Evidence issues and the question:** "
        "[iamdflame/heirloom/issues](https://github.com/iamdflame/heirloom/issues?q=is%3Aissue) "
        "(#10 is closed: superseded by #21).",
        "- **Entire checkpoints:** build sessions on this repo's `main` commits "
        "(`Entire-Checkpoint:` trailers; "
        "`git log --format='%h %(trailers:key=Entire-Checkpoint,valueonly)'`) "
        "and runtime checkpoints on every backport commit, refs under `refs/entire/checkpoints/` "
        "on both repos. `entire review`, `recap` and `checkpoint explain` outputs: "
        "[docs/entire/](docs/entire/).",
        "- **neatlogs:** traces live in the owner's private neatlogs org, so judges see the trace "
        "ids (in every PR and issue) and the detections JSON: "
        "[detections.json](evals/detections.json), "
        "[detections_flag_check.json](evals/detections_flag_check.json).",
        "- **Business plan (cfo.ai, read-only):** "
        "[Base](https://app.cfo.ai/s/25vRDQClPxqPWB5g) · "
        "[Bear](https://app.cfo.ai/s/iY4Wmzs_IFo0SBTz) · "
        "[Bull](https://app.cfo.ai/s/ASqxTf1hUwtztmtT); inputs and sources in "
        "[docs/business-plan.md](docs/business-plan.md).",
        f"- **Recovery from a failed action:** [recovery_b4.json](evals/recovery_b4.json): "
        f"{rec['cve']}'s `{fail['stage']}` #{fail['attempt']} failed (`{fail['error']}`), "
        f"the same run `{rec['runs'][0]['run_id']}` resumed from the ledger; "
        f"traces {', '.join(f'`{t}`' for t in traces)}.",
        "- **Everything mapped to the hackathon's evidence list:** [EVIDENCE.md](EVIDENCE.md); "
        "Definition-of-Done check: [docs/DOD-status.md](docs/DOD-status.md).",
        "",
        "### What's real / known limits",
        "",
        "- These are **candidate backports, not Django releases**; nobody has reviewed or "
        "merged them.",
        "- Tests run on **SQLite and PostGIS only**; backend-specific fixes (MySQL, Oracle, "
        "SpatiaLite) cannot be exercised.",
        "- **UNPROVEN is by design** for what Heirloom cannot exercise: it publishes evidence, "
        "never a guess.",
        "- The porter sees the advisory and upstream's test diff, **never the fix's code hunks**.",
        "- The CVE-2026-87890 matrix probe is **hand-written** (the campaign's own 87890 probe "
        "came from the porter).",
        "- The recovery shown was a **worker killed during a harness-fix restart**, not an "
        "injected fault.",
        "",
        f"**Built during neatHack:** all code was written during the event; first commit "
        f"{first_commit()}. Build log: [hackathon.md](hackathon.md).",
    ]
    return "\n".join(out)


def detail(live: dict[str, Any], mx: dict[str, Any], det: dict[str, Any],
           flag: dict[str, Any]) -> str:  # fmt: skip
    per = live["per_cve"]
    out = [
        "## Campaign detail",
        "",
        "| CVE | Outcome | Verdict | Link | $ (ledger) | min |",
        "|---|---|---|---|---:|---:|",
    ]
    order = live["story_order"] + sorted(c for c in per if c not in live["story_order"])
    for c in order:
        r = per[c]
        why = f" ({r['reason']})" if r["reason"] not in ("NONE", None) else ""
        out.append(
            f"| {c} | {r['status']} | {r['verdict']}{why} | {link(r['link'])} | "
            f"{r['ledger_cost_usd']:.2f} | {r['minutes']} |"
        )
    sm = live["summary"]
    ov = live["overflow"]
    out += [
        "",
        f"_Ledger model cost ${sm['ledger_cost_usd']:.2f}; campaign spend against its cap "
        f"(provider-billed) ${ov['spent_usd']:.2f} of ${ov['cap_usd']:.0f}; "
        f"escalation rate {pct(sm['escalation_rate'])}. From "
        "[results_live.json](evals/results_live.json)._",
        "",
        "<details><summary>Full matrix (the campaign's CVEs × 3 lines)</summary>",
        "",
        "| CVE | " + " | ".join(LINE_LABELS.get(ln, ln) for ln in mx["lines"]) + " |",
        "|---|" + "---|" * len(mx["lines"]),
    ]
    by = {(c["cve"], c["line"]): c for c in mx["cells"]}
    for c in order:
        row = []
        for ln in mx["lines"]:
            cell = by.get((c, ln))
            if cell is None:
                row.append("—")
                continue
            why = f" ({cell['reason']})" if cell.get("reason") else ""
            row.append(SHORT.get(cell["verdict"], cell["verdict"]) + why)
        out.append(f"| {c} | " + " | ".join(row) + " |")
    out += ["", "</details>", "", "### neatlogs detections", ""]
    out += [
        f"At {det['at']} (rule `{det['condition']['runOn']}`, "
        f"`{det['condition']['field']} {det['condition']['operator']} "
        f"{det['condition']['value']}`):",
        "",
        "| Detection | neatlogs hits | local ledger mirror |",
        "|---|---:|---:|",
    ]
    for name, d in det["neatlogs"].items():
        local = det["local_mirror"].get(name)
        local_n = local if isinstance(local, int) else (local or {}).get("hits", local)
        out.append(f"| `{name}` | {d['hits']} | {local_n} |")
    out += [
        "",
        f'A v1-style "not affected" claim without calibration (a throwaway sample run, '
        f"`{flag['run_id']}`) raised `{flag['detection']['name']}` in neatlogs after "
        f"{flag['seconds_waited']} s (hits {flag['neatlogs_hits_before']} → "
        f"{flag['neatlogs_hits_after']}, trace `{flag['trace_id']}`). "
        "See hackathon.md (B4) for what each hit was.",
    ]
    return "\n".join(out)


def splice(text: str, start: str, end: str, block: str) -> str:
    if start in text and end in text:
        head, rest = text.split(start, 1)
        _, tail = rest.split(end, 1)
        return head + f"{start}\n{block}\n{end}" + tail
    return text.rstrip() + f"\n\n{start}\n{block}\n{end}\n"


def main() -> int:
    data = json.loads(RESULTS.read_text())
    live, mx = load("results_live.json"), load("matrix.json")
    text = README.read_text()
    text = splice(
        text, "<!-- top:start -->", "<!-- top:end -->",
        top(live, load("campaign_evidence.json"), mx, data, load("distro_lines.json"),
            load("recovery_b4.json")),
    )  # fmt: skip
    text = splice(text, START, END, table(data))
    text = splice(
        text, "<!-- detail:start -->", "<!-- detail:end -->",
        detail(live, mx, load("detections.json"), load("detections_flag_check.json")),
    )  # fmt: skip
    README.write_text(text)
    print(f"rendered {README}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
