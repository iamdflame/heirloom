# Definition of Done: status (B6, 2026-10-12)

Each item from `~/brief/DOD.md` (the build brief, not in this repo) has the evidence for its status
beside it. **PASS** means the evidence shows the item is done. **PARTIAL** means part of it is shown
and the gap is named. **FAIL** means it is not done. **NOT LIVE** means it is explicitly not running.
The commands were run in session B6 (`ea42def1`) unless a row names an earlier session.

**Totals: 23 PASS · 5 PARTIAL · 3 FAIL · 1 NOT LIVE (32 items).**

## Works

| # | Item | Status | Evidence |
|---|---|---|---|
| W1 | Golden path `heirloom cve CVE-2026-87975 --line 4.2` 3× from a clean state, exactly one PR | PASS (L0, 2026-10-11) | [evals/results_l0.json](../evals/results_l0.json). Three passes after `clean --remote` took 75.3 / 77.8 / 76.7 s and produced PRs #6, #7 and #8, each closed by the next clean; the final one is [PR #9](https://github.com/iamdflame/django/pull/9). Not re-run in B6, because this session's brief forbids `clean --remote`. |
| W2 | Resume after a kill mid-ADAPT; no duplicate commits, pushes or PRs | PASS | L0 (`results_l0.json`): SIGKILL during ADAPT, then injected crashes after commit, push and PR; `resume` reconciled each "unknown" effect, leaving 1 commit and 1 PR (#9). Campaign (B4): a real SIGTERM mid-ADAPT, then `campaign --continue` on the same run, ending with one PR, #11 ([evals/recovery_b4.json](../evals/recovery_b4.json)). |
| W3 | Calibration negative test: weakened probe ⇒ UNPROVEN | PASS | `tests/test_presence.py::test_weakened_probe_on_vulnerable_line_is_unproven` and `::test_weakened_probe_with_only_unbuildable_mutants_is_unproven` pass (B6 run: `10 passed` together with W4/W7/X1). |
| W4 | ERROR never counts as FAIL; `django.__file__` guard on every run | PASS | `tests/test_runner.py::test_error_never_counts_as_fail_even_alongside_fails` (plus 10 more ERROR-classification tests in that file). Guard: `heirloom/verify/_runtests_shim.py` prints `HEIRLOOM_DJANGO_FILE=`, and `runner.py:324` rejects a run without the mark or from the wrong tree (exit 97). Every published log shows the line, e.g. the [noble probe log](https://github.com/iamdflame/heirloom/blob/82c160324de18f5da85166318a18891bb280f143/matrix/b4-20261011/CVE-2026-87890/ubuntu-noble/logs/calibrate/2e97ddd6/L-f566e91a2c-0.log). |
| W5 | Ask-once: 15307 opened exactly one question; the stored precedent was applied with issue + trace links | PASS (with a correction) | [evals/campaign_evidence.json](../evals/campaign_evidence.json): 1 question, [#6](https://github.com/iamdflame/heirloom/issues/6), asked by CVE-2026-15307 (asking trace `2976b1584b28…`); CVE-2026-84429 waited on #6 without opening a new one. Precedent P001 was applied by [#20](https://github.com/iamdflame/django/pull/20) and [#19](https://github.com/iamdflame/django/pull/19); #19's note cites #6 and the asking trace. **Correction:** the DoD names CVE-2026-87890 as the one reusing the precedent. In the real run it was CVE-2026-84429. 87890 was *stacked* on 15307 ([#21](https://github.com/iamdflame/django/pull/21) on #20) and never needed the precedent. |
| W6 | Every external call has a timeout and a recorded failure path; no stack traces in CLI output | PASS (fixed in B6) | Before B6, `gh`, `git`, `entire` and `claude -p` had no timeout. Now they have: gh 120 s, git 900 s (push 300 s), entire 300 s, `claude -p` 1800 s. LLM HTTP calls (600 s) and the neatlogs API (60 s) already had one. Each timeout raises the module's error, which the ledger stage wrapper records as a failed stage. Tests: `tests/test_timeouts.py` (gh, git push, entire). `heirloom.cli:main` prints `heirloom: error: <Type>: <msg>`, exit 1 (`HEIRLOOM_DEBUG=1` re-raises). |
| W7 | Budget guard: the per-CVE cap stops a runaway ADAPT and records UNPROVEN (BUDGET) | PASS (unit test only) | Added `tests/test_budget_guard.py`: ADAPT raises `BudgetExceeded`, is not retried, and the verdict is UNPROVEN (BUDGET). No real run has hit the per-CVE cap ($1.50); the ledger has no BUDGET verdict. |
| W8 | Bad input gives clear messages | PASS (fork check added in B6) | Unknown CVE → `heirloom: error: StageFailed: CVE-2099-0001 is not in security.txt at 0f34a4cf9f` (exit 1). Unknown line → `Invalid value: unknown line '9.9'; pass --tip and --kind for a new one` (exit 2). Missing sha → `GitError: git rev-parse --verify 000…bad^{commit} failed (128): fatal: Needed a single revision` (exit 1). Unreachable fork (`HEIRLOOM_FORK_REMOTE=nosuchremote`, or a non-existent repo URL) → `Invalid value: fork remote … unreachable: … Repository not found` (exit 2), checked **before** any model spend (new in B6). |

## Live

| # | Item | Status | Evidence |
|---|---|---|---|
| L1 | Public repo with a README first screen; fork branch `stable/4.2.x-heirloom`; one PR or issue per processed CVE | PASS | `gh repo view`: both repos PUBLIC. `git ls-remote` on the fork shows `stable/4.2.x-heirloom` at `3396992e83`. The 19 campaign CVEs map to 13 PRs (#9–#21) plus 6 open evidence issues (#3, #4, #5, #7, #8, #9) = 19 (`evals/results_live.json`). |
| L2 | Every PR has a verdict, probe log, calibration evidence, neatlogs trace link, Entire checkpoint link and the candidate label | PASS | Checked PRs #9–#21 with `gh pr view` in B6: all 13 contain "Candidate backport — not an official Django release.", a Verdict row, U⁻/U⁺ calibration claims (C1) with log links, neatlogs span links with trace ids, and an Entire checkpoint row with a ref link. |
| L3 | EC2 `watch` timer running through Oct 16, or explicitly listed as not live | NOT LIVE | No systemd timer or cron entry for heirloom exists (`systemctl list-timers`, `crontab -l`). Listed as not live in hackathon.md (B6) and in the known limits. |
| L4 | Read API (`/campaign`, `/cve/{id}`) responds with real data | PASS (local) | B6: `heirloom serve --port 8078`: `/campaign` returned `{"campaign":"b4-replay",…}` and `/cve/CVE-2026-87890` returned its 3 matrix cells and campaign record. It is not deployed publicly; `site/data/` holds the static export. |

## Sponsor evidence

| # | Item | Status | Evidence |
|---|---|---|---|
| S1 | Before/after run: E1 v1 vs v2 table from `evals/results.json`; detection trend (or the true numbers) | PASS (true numbers, no chart) | README tables rendered by `evals/render_readme.py`: v1 has 1 false NOT_AFFECTED and v2 has 0. The detections table (neatlogs vs local mirror) is rendered from `evals/detections.json`. The v1-style sample raised `not_affected_without_calibration`, 0 → 1 hit ([detections_flag_check.json](../evals/detections_flag_check.json)). There is no trend chart image. |
| S2 | neatlogs traces or screenshots (campaign session → CVE child sessions → stage spans) | PARTIAL | Trace and span ids are in every PR and issue, and the per-CVE root plus stage spans are recorded (hackathon.md L0/B4). The traces sit in the owner's private org. **No screenshots are saved**, and this session did not verify a campaign-level parent session above the per-CVE roots. |
| S3 | Entire: build checkpoints on main, runtime checkpoints on backports, explain/review/recap in docs/entire/ | PASS | 45 `main` commits carried `Entire-Checkpoint:` trailers at this check, with their refs pushed to origin. The fork has 22 `refs/entire/*` refs. [docs/entire/](entire/) has the review, recap and two checkpoint explains. |
| S4 | cfo.ai plan: pricing, costs, revenue, runway from measured inputs; shared Page link; docs/business-plan.md | PASS | [docs/business-plan.md](business-plan.md) (inputs table with sources). Pages: [Base](https://app.cfo.ai/s/25vRDQClPxqPWB5g) · [Bear](https://app.cfo.ai/s/iY4Wmzs_IFo0SBTz) · [Bull](https://app.cfo.ai/s/ASqxTf1hUwtztmtT). |
| S5 | A run recovering from a failed action (trace link + ledger excerpt) | PASS | [evals/recovery_b4.json](../evals/recovery_b4.json) (ledger excerpt; traces `00000b0f2ae0…`, `b4459b250cde…`); PR [#11](https://github.com/iamdflame/django/pull/11). |
| S6 | Build-in-public links tagged #neatHack (list in hackathon.md) | FAIL (owner) | Nothing has been posted from the build machine. Placeholder lists are in [EVIDENCE.md](../EVIDENCE.md#6-build-in-public-links-tagged-neathack) and hackathon.md (Submission). |
| S7 | Public repo with commits during the event (first commit after 2026-10-10 07:00 UTC) | PASS | First commit `a172b2d` at 2026-10-11T00:30:36Z; 81 commits dated 2026-10-11 and 20+ dated 2026-10-12. |

## Quality

| # | Item | Status | Evidence |
|---|---|---|---|
| Q1 | pytest green; ruff + mypy clean | PASS | B6 final: `197 passed`; `ruff check heirloom tests`: All checks passed; `ruff format --check`: 67 files already formatted; `mypy --strict heirloom tests`: no issues in 67 files. Re-checked at the end of B6 (hackathon.md). |
| Q2 | README eval table (v1 vs v2, false NOT_AFFECTED explicit, escalation rate, $/CVE, min/CVE) | PASS | README "E1 backtest" block (all columns) plus the first-screen summary, both rendered from `evals/results.json`. |
| Q3 | `/code-review` (high) findings fixed or deferred with a note | PARTIAL | `/code-review` was **not run** on this repo. `entire review` ran in its place (B5b, [review-main.txt](entire/review-main.txt)). Medium #2 and low #1 were fixed in B6 (`publish._asking/_notes`); medium #1 (`rerender` recomputing `prepare`) is deferred with a note in hackathon.md; the other lows are listed there. |
| Q4 | No secrets in repo or history; `.env.example` present; Entire redaction on | PARTIAL | `git log -p --all \| grep -iE 'sk-\|key=\|token'`: 24 hits, all grep command lines quoted in session transcripts, no values. A scan of every object in every ref (main, artifacts, 43 `refs/entire/*`) against each `.env` value of ≥12 chars: 0 hits for the 6 secret keys. The only hit is `HEIRLOOM_FORK` = the public fork name. `.env.example` is present. **Entire redaction:** CLI 0.11.4 exposes no redaction setting (`entire configure --help`), so "on" cannot be shown. The 0-hit scan of the checkpoint refs is the evidence that none leaked. |
| Q5 | Licenses: repo MIT; Django patches under BSD-3 | PASS (fixed in B6) | Added [LICENSE](../LICENSE) (MIT, with a scope note for Django-derived patches); `pyproject.toml` has `license = "MIT"`; the README says so too. |

## Legible

| # | Item | Status | Evidence |
|---|---|---|---|
| G1 | README first screen: one-liner, verify links, results, what's real, known limits, built during neatHack | PASS | [README.md](../README.md), `<!-- top:start -->` block. The order follows the B6 brief: results come before the verify links. |
| G2 | Every claim true today and traceable; no hand-typed numbers | PARTIAL | Every number in the README is rendered from `evals/*.json` or `git log`, and "How it works" has none. The ask-once and fail→pass facts come from `evals/campaign_evidence.json`, exported from the ledger by `evals/export_campaign_evidence.py`. **No video or post exists yet**, so those can't be checked. |
| G3 | hackathon.md complete, dated, only tests that ran | PASS | The B6 entry was added at the end of this session. |
| G4 | Commit history: small, meaningful commits over several sessions | PASS | 100+ commits across S0–S4, L0, B3, B4, B5, B5b and B6, one per step in B6 (`git log --oneline`). |

## Insured

| # | Item | Status | Evidence |
|---|---|---|---|
| I1 | Backup walkthrough video | FAIL (owner) | Not recorded. A headless session can't make one. |
| I2 | Screenshots of key screens in docs/ | FAIL (owner) | None saved. |
| I3 | Local replay: `heirloom report --cve <id>` renders from the ledger without network or model | PASS (added in B6) | `heirloom report --cve CVE-2026-87890 --line 4.2` prints verdict AFFECTED, gates C1–C3, verify `['FAIL'×3] -> ['PASS'×3]`, decision publish-fix, PR #21, earlier evidence #10 marked superseded, and ledger cost $0.4520. `tests/test_timeouts.py::test_report_renders_from_the_ledger_alone` runs it with every subprocess call made to fail. |
| I4 | After the deadline: main frozen, EC2 running or state documented | PARTIAL | This can only happen after 08:58 UTC. The EC2 state is documented in hackathon.md (B6): no watch timer runs, and the ledger and work tree stay on the box. |
