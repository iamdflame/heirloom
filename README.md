# Heirloom

**Live:** https://heirloom-proof.vercel.app

**Demo video (2:27):** https://youtu.be/L4Zw555RuMs

**Submission post:** https://x.com/i_am_dflame/status/2109675581776314381

<!-- top:start -->
**Heirloom is an agent that keeps end-of-life software patched.** For each new upstream security fix it writes an independent probe, calibrates it on upstream's own before/after commits, proves on the old line whether the bug is there, and then publishes either a verified candidate backport or the evidence of why it could not decide.

### What it did, unattended: Django 4.2 after its EOL (b4-replay campaign)

- **19 post-EOL Django CVEs on 4.2:** **13** AFFECTED · **1** NOT_AFFECTED_PROVEN · **5** UNPROVEN ([results_live.json](evals/results_live.json)).
- **13 candidate backport PRs**, 13 of 13 with the probe FAIL ×3 before → PASS ×3 after the fix: [iamdflame/django/pulls](https://github.com/iamdflame/django/pulls) ([#9](https://github.com/iamdflame/django/pull/9)–[#21](https://github.com/iamdflame/django/pull/21); [fail→pass](evals/campaign_evidence.json)).
- **6 evidence issues, no code,** for the rest: 5 UNPROVEN (it could not prove either way) and 1 NOT_AFFECTED_PROVEN: [#3](https://github.com/iamdflame/heirloom/issues/3) [#4](https://github.com/iamdflame/heirloom/issues/4) [#5](https://github.com/iamdflame/heirloom/issues/5) [#7](https://github.com/iamdflame/heirloom/issues/7) [#8](https://github.com/iamdflame/heirloom/issues/8) [#9](https://github.com/iamdflame/heirloom/issues/9).
- **1 question asked:** [#6](https://github.com/iamdflame/heirloom/issues/6), by CVE-2026-15307 (`UPSTREAM_TEST_CHANGE`). CVE-2026-84429 hit the same kind and waited on it instead of asking again. The answer (`adopt-upstream-tests`) became precedent P001; CVE-2026-84429's [#19](https://github.com/iamdflame/django/pull/19) reused it without asking (and CVE-2026-15307's own [#20](https://github.com/iamdflame/django/pull/20) applied it).
- **Stacked:** CVE-2026-87890's fix rewrites lines that CVE-2026-15307's fix introduced (git blame `115ffd0463`), so [#21](https://github.com/iamdflame/django/pull/21) is stacked on Heirloom's own CVE-2026-15307 backport [#20](https://github.com/iamdflame/django/pull/20) (base `heirloom/cve-2026-15307-4.2`).

### The same 19 CVEs on three 4.2 lines ([matrix.json](evals/matrix.json), $0, probes reused)

| Line | AFFECTED | not affected (proven) | UNPROVEN | no probe |
|---|---:|---:|---:|---:|
| Django 4.2.30 | 13 | 1 | 1 | 4 |
| Debian 13 trixie | 13 | 1 | 1 | 4 |
| Ubuntu 24.04 noble | 8 | 5 | 2 | 4 |

**Ubuntu cross-check:** of the 5 of these CVEs that noble already patches, 4 come out NOT_AFFECTED_PROVEN on noble (CVE-2026-35192, CVE-2026-5766, CVE-2026-6907, CVE-2026-8404); CVE-2026-15307 is UNPROVEN (NO_REACH) there.

**Ubuntu finding:** noble's CVE-2026-15307 backport leaves the bytes path that upstream closed as CVE-2026-87890; our calibrated probe shows it. The probe is hand-written and calibrated on Django's own fix commits (FAIL ×3 before `dd0558d1`, PASS ×3 after; FAIL ×3 on noble's tree; [raw logs](https://github.com/iamdflame/heirloom/tree/82c160324de18f5da85166318a18891bb280f143/matrix/b4-20261011/CVE-2026-87890), [draft report](docs/outreach/ubuntu-cve-2026-87890.md), not filed).

### Backtest: does calibration help? ([results.json](evals/results.json))

| Pipeline | Cases | Accuracy (decided) | **False NOT_AFFECTED** | UNPROVEN | Escalation |
|---|---:|---:|---:|---:|---:|
| v1 · naive (cherry-pick + LLM, no calibration) | 27 | 85% (27) | **1** | 0 | 0% |
| v2 · Heirloom (calibrated) | 27 | 94% (16) | **0** | 9 | 37% |

A false NOT_AFFECTED is the dangerous error (a vulnerable line declared safe). Full table, cost and per-case rows [below](#e1-backtest-django-42-2026-cves).

### Verify it yourself

- **Backport PRs:** [iamdflame/django/pulls](https://github.com/iamdflame/django/pulls). Every PR shows its verdict, the probe's FAIL on U⁻ and FAIL→PASS on 4.2, calibration logs, a neatlogs span per claim and its Entire checkpoint.
- **Evidence issues and the question:** [iamdflame/heirloom/issues](https://github.com/iamdflame/heirloom/issues?q=is%3Aissue) (#10 is closed: superseded by #21).
- **Entire checkpoints:** build sessions on this repo's `main` commits (`Entire-Checkpoint:` trailers; `git log --format='%h %(trailers:key=Entire-Checkpoint,valueonly)'`) and runtime checkpoints on every backport commit, refs under `refs/entire/checkpoints/` on both repos. `entire review`, `recap` and `checkpoint explain` outputs: [docs/entire/](docs/entire/).
- **neatlogs:** traces live in the owner's private neatlogs org, so judges see the trace ids (in every PR and issue) and the detections JSON: [detections.json](evals/detections.json), [detections_flag_check.json](evals/detections_flag_check.json).
- **Business plan (cfo.ai, read-only):** [Base](https://app.cfo.ai/s/25vRDQClPxqPWB5g) · [Bear](https://app.cfo.ai/s/iY4Wmzs_IFo0SBTz) · [Bull](https://app.cfo.ai/s/ASqxTf1hUwtztmtT); inputs and sources in [docs/business-plan.md](docs/business-plan.md).
- **Recovery from a failed action:** [recovery_b4.json](evals/recovery_b4.json): CVE-2026-35192's `adapt` #1 failed (`SystemExit: 143`), the same run `20261011T210815Z-e826` resumed from the ledger; traces `00000b0f2ae0082898a888d7ec8eea0d`, `1a6c4a2717d6478d2bcd78acce1e55e2`, `b4459b250cdec7a84bf1023b0275cdf7`.
- **Everything mapped to the hackathon's evidence list:** [EVIDENCE.md](EVIDENCE.md); Definition-of-Done check: [docs/DOD-status.md](docs/DOD-status.md).

### What's real / known limits

- These are **candidate backports, not Django releases**; nobody has reviewed or merged them.
- Tests run on **SQLite and PostGIS only**; backend-specific fixes (MySQL, Oracle, SpatiaLite) cannot be exercised.
- **UNPROVEN is by design** for what Heirloom cannot exercise: it publishes evidence, never a guess.
- The porter sees the advisory and upstream's test diff, **never the fix's code hunks**.
- The CVE-2026-87890 matrix probe is **hand-written** (the campaign's own 87890 probe came from the porter).
- The recovery shown was a **worker killed during a harness-fix restart**, not an injected fault.

**Built during neatHack:** all code was written during the event; first commit `a172b2d` on 2026-10-11 00:30:36Z. Build log: [hackathon.md](hackathon.md).
<!-- top:end -->

---

## How it works

For one CVE and one maintained line (here: the fork's `stable/4.2.x-heirloom` branch), Heirloom runs
LOCATE → PROBE → CALIBRATE → PRESENCE → ADAPT → VERIFY → BEHAVIOUR → DECIDE → PUBLISH, every stage
recorded in a SQLite ledger so a killed run resumes without repeating side effects.

- **PROBE:** an independent porter model writes a regression test from the advisory and upstream's
  test diff; a leakage guard refuses prompts that contain the fix's added code.
- **CALIBRATE / PRESENCE:** the probe must FAIL on upstream's pre-fix commit (U⁻) and PASS on the fix
  (U⁺) with stable failing ids, run cleanly on the old line, and reach the code the fix touches
  (coverage). Only then does its result on the old line count; otherwise the verdict is UNPROVEN.
- **ADAPT / VERIFY:** headless Claude Code (in an Entire-tracked worktree) adapts the fix to the old
  line without touching `tests/`; VERIFY needs the probe FAIL→PASS and no new failures or skips in
  the touched test labels.
- **DECIDE:** real choices (behaviour differences, upstream test rewrites) open one question issue;
  the answer is stored as a precedent and reused.
- **PUBLISH:** a PR with one claim per fact, each linked to its neatlogs span and run artifact (a claim
  missing either is struck), or an evidence issue when there is no verified fix.

## E1 backtest: Django 4.2, 2026 CVEs

<!-- e1:start -->
| Pipeline | Cases | Verdict accuracy (decided) | False NOT_AFFECTED | False AFFECTED | UNPROVEN | Fellows' 4.2 test passes | Escalation rate | $ / case | Min / case |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| v2 · Heirloom (calibrated) | 27 | 94% (16 decided) | **0** | 1 | 9 | 7/13 | 37% | $0.13 | 0.97 |
| v1 · naive (cherry-pick + LLM, no calibration) | 27 | 85% (27 decided) | **1** | 3 | 0 | 11/13 | 0% | $0.15 | 1.96 |
_Set `django-4.2-2026`; rendered from [`evals/results.json`](evals/results.json) by `evals/render_readme.py`. Accuracy counts only decided cases; UNPROVEN means Heirloom declined to claim either way and would ask a human. $ figures: 0 of 36 priced cases use provider-reported cost (OpenRouter `usage.cost`, `claude -p` `total_cost_usd` on OpenRouter); the other 36 are token × list-price estimates from the LiteLLM gateway, which billed roughly twice that on 2026-10-11 (see hackathon.md), so treat those as lower bounds._

<details><summary>Per case</summary>

| CVE | Case | Truth | v2 verdict | v2 fellows' test | v1 verdict | v1 fellows' test |
|---|---|---|---|---|---|---|
| CVE-2025-13473 | negative | NOT_AFFECTED | NOT_AFFECTED_PROVEN | — | NOT_AFFECTED | — |
| CVE-2025-13473 | positive | AFFECTED | AFFECTED | True | AFFECTED | True |
| CVE-2025-14550 | negative | NOT_AFFECTED | UNPROVEN (MUTANT_UNBUILDABLE) | — | NOT_AFFECTED | — |
| CVE-2025-14550 | positive | AFFECTED | AFFECTED | True | AFFECTED | True |
| CVE-2025-27556 | extra | NOT_AFFECTED | AFFECTED | — | AFFECTED | — |
| CVE-2026-1207 | negative | NOT_AFFECTED | SKIPPED (NO_CALIBRATED_PROBE) | — | NOT_AFFECTED | — |
| CVE-2026-1207 | positive | AFFECTED | UNPROVEN (NON_DISCRIMINATING) | — | AFFECTED | True |
| CVE-2026-1285 | negative | NOT_AFFECTED | NOT_AFFECTED_PROVEN | — | NOT_AFFECTED | — |
| CVE-2026-1285 | positive | AFFECTED | UNPROVEN (NO_REACH) | — | NOT_AFFECTED | — |
| CVE-2026-1287 | negative | NOT_AFFECTED | NOT_AFFECTED_PROVEN | — | NOT_AFFECTED | — |
| CVE-2026-1287 | positive | AFFECTED | AFFECTED | False | AFFECTED | True |
| CVE-2026-1312 | negative | NOT_AFFECTED | NOT_AFFECTED_PROVEN | — | NOT_AFFECTED | — |
| CVE-2026-1312 | positive | AFFECTED | AFFECTED | True | AFFECTED | True |
| CVE-2026-25673 | negative | NOT_AFFECTED | SKIPPED (NO_CALIBRATED_PROBE) | — | AFFECTED | — |
| CVE-2026-25673 | positive | AFFECTED | UNPROVEN (PROBE_ERROR) | — | AFFECTED | True |
| CVE-2026-25674 | negative | NOT_AFFECTED | UNPROVEN (NO_REACH) | — | NOT_AFFECTED | — |
| CVE-2026-25674 | positive | AFFECTED | UNPROVEN (NO_REACH) | — | AFFECTED | False |
| CVE-2026-33033 | negative | NOT_AFFECTED | NOT_AFFECTED_PROVEN | — | NOT_AFFECTED | — |
| CVE-2026-33033 | positive | AFFECTED | AFFECTED | True | AFFECTED | True |
| CVE-2026-33034 | negative | NOT_AFFECTED | UNPROVEN (MUTANT_UNBUILDABLE) | — | AFFECTED | — |
| CVE-2026-33034 | positive | AFFECTED | AFFECTED | True | AFFECTED | True |
| CVE-2026-3902 | negative | NOT_AFFECTED | UNPROVEN (NO_REACH) | — | NOT_AFFECTED | — |
| CVE-2026-3902 | positive | AFFECTED | UNPROVEN (NO_REACH) | — | AFFECTED | True |
| CVE-2026-4277 | negative | NOT_AFFECTED | NOT_AFFECTED_PROVEN | — | NOT_AFFECTED | — |
| CVE-2026-4277 | positive | AFFECTED | AFFECTED | True | AFFECTED | True |
| CVE-2026-4292 | negative | NOT_AFFECTED | NOT_AFFECTED_PROVEN | — | NOT_AFFECTED | — |
| CVE-2026-4292 | positive | AFFECTED | AFFECTED | True | AFFECTED | True |

</details>
<!-- e1:end -->

<!-- detail:start -->
## Campaign detail

| CVE | Outcome | Verdict | Link | $ (ledger) | min |
|---|---|---|---|---:|---:|
| CVE-2026-15307 | published | AFFECTED | [#20](https://github.com/iamdflame/django/pull/20) | 0.50 | 13.66 |
| CVE-2026-87890 | published | AFFECTED | [#21](https://github.com/iamdflame/django/pull/21) | 0.45 | 5.37 |
| CVE-2026-15830 | evidence | UNPROVEN (NO_REACH) | [#4](https://github.com/iamdflame/heirloom/issues/4) | 0.87 | 5.87 |
| CVE-2026-53878 | evidence | NOT_AFFECTED_PROVEN | [#3](https://github.com/iamdflame/heirloom/issues/3) | 0.00 | 1.95 |
| CVE-2026-15337 | evidence | UNPROVEN (NON_DISCRIMINATING) | [#8](https://github.com/iamdflame/heirloom/issues/8) | 0.12 | 1.7 |
| CVE-2026-15920 | published | AFFECTED | [#18](https://github.com/iamdflame/django/pull/18) | 0.23 | 2.41 |
| CVE-2026-35192 | published | AFFECTED | [#11](https://github.com/iamdflame/django/pull/11) | 0.11 | 11.26 |
| CVE-2026-35193 | evidence | UNPROVEN (NON_DISCRIMINATING) | [#5](https://github.com/iamdflame/heirloom/issues/5) | 0.07 | 1.39 |
| CVE-2026-48587 | published | AFFECTED | [#10](https://github.com/iamdflame/django/pull/10) | 0.12 | 5.01 |
| CVE-2026-48588 | published | AFFECTED | [#17](https://github.com/iamdflame/django/pull/17) | 0.11 | 4.88 |
| CVE-2026-53877 | published | AFFECTED | [#15](https://github.com/iamdflame/django/pull/15) | 0.13 | 2.84 |
| CVE-2026-5766 | published | AFFECTED | [#12](https://github.com/iamdflame/django/pull/12) | 0.14 | 9.0 |
| CVE-2026-6873 | published | AFFECTED | [#14](https://github.com/iamdflame/django/pull/14) | 0.19 | 4.45 |
| CVE-2026-6907 | published | AFFECTED | [#13](https://github.com/iamdflame/django/pull/13) | 0.09 | 7.63 |
| CVE-2026-7666 | evidence | UNPROVEN (PROBE_ERROR) | [#7](https://github.com/iamdflame/heirloom/issues/7) | 0.20 | 4.68 |
| CVE-2026-77050 | evidence | UNPROVEN (PROBE_ERROR) | [#9](https://github.com/iamdflame/heirloom/issues/9) | 0.11 | 1.88 |
| CVE-2026-8404 | published | AFFECTED | [#16](https://github.com/iamdflame/django/pull/16) | 0.11 | 4.87 |
| CVE-2026-84429 | published | AFFECTED | [#19](https://github.com/iamdflame/django/pull/19) | 0.35 | 3.43 |
| CVE-2026-87975 | skipped | AFFECTED (ALREADY_PUBLISHED) | [#9](https://github.com/iamdflame/django/pull/9) | 0.00 | 0.0 |

_Ledger model cost $3.91; campaign spend against its cap (provider-billed) $4.67 of $18; escalation rate 26%. From [results_live.json](evals/results_live.json)._

<details><summary>Full matrix (the campaign's CVEs × 3 lines)</summary>

| CVE | Django 4.2.30 | Debian 13 trixie | Ubuntu 24.04 noble |
|---|---|---|---|
| CVE-2026-15307 | AFFECTED | AFFECTED | UNPROVEN (NO_REACH) |
| CVE-2026-87890 | AFFECTED | AFFECTED | AFFECTED |
| CVE-2026-15830 | UNPROVEN (NO_REACH) | UNPROVEN (NO_REACH) | UNPROVEN (NO_REACH) |
| CVE-2026-53878 | not affected (proven) | not affected (proven) | not affected (proven) |
| CVE-2026-15337 | no probe | no probe | no probe |
| CVE-2026-15920 | AFFECTED | AFFECTED | AFFECTED |
| CVE-2026-35192 | AFFECTED | AFFECTED | not affected (proven) |
| CVE-2026-35193 | no probe | no probe | no probe |
| CVE-2026-48587 | AFFECTED | AFFECTED | AFFECTED |
| CVE-2026-48588 | AFFECTED | AFFECTED | AFFECTED |
| CVE-2026-53877 | AFFECTED | AFFECTED | AFFECTED |
| CVE-2026-5766 | AFFECTED | AFFECTED | not affected (proven) |
| CVE-2026-6873 | AFFECTED | AFFECTED | AFFECTED |
| CVE-2026-6907 | AFFECTED | AFFECTED | not affected (proven) |
| CVE-2026-7666 | no probe | no probe | no probe |
| CVE-2026-77050 | no probe | no probe | no probe |
| CVE-2026-8404 | AFFECTED | AFFECTED | not affected (proven) |
| CVE-2026-84429 | AFFECTED | AFFECTED | AFFECTED |
| CVE-2026-87975 | AFFECTED | AFFECTED | AFFECTED |

</details>

### neatlogs detections

At 2026-10-11T21:54:41Z (rule `span_name heirloom.flag.<predicate>`, `status = OK`):

| Detection | neatlogs hits | local ledger mirror |
|---|---:|---:|
| `test_edited_after_red` | 0 | 0 |
| `claim_without_span` | 13 | 13 |
| `probe_never_reached_region` | 4 | 9 |
| `fix_applied_where_probe_passed` | 0 | 0 |
| `not_affected_without_calibration` | 1 | 0 |

A v1-style "not affected" claim without calibration (a throwaway sample run, `20261011T205400Z-v1sample`) raised `not_affected_without_calibration` in neatlogs after 90 s (hits 0 → 1, trace `cf03051e54fc0325304db42ddf2f1823`). See hackathon.md (B4) for what each hit was.
<!-- detail:end -->

## Run it

```sh
uv sync
cp .env.example .env            # OpenRouter / neatlogs keys; never commit .env
uv run heirloom cve CVE-2026-87975 --line 4.2     # one CVE, golden path
uv run heirloom campaign --line 4.2 --replay --workers 3 --cap 18 --id b4-replay
uv run heirloom status CVE-2026-87890 --line 4.2  # the ledger, offline
uv run heirloom serve                             # read-only JSON API
uv run python evals/export_campaign_evidence.py && uv run python evals/render_readme.py
```

## License

Heirloom is MIT ([LICENSE](LICENSE)). Backport patches to Django remain under Django's BSD-3-Clause license.
