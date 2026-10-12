# Heirloom: hackathon log

## Project

Heirloom is an agent that keeps end-of-life software patched. It backports new upstream security fixes to old release lines that distributions still ship, proves which lines are actually vulnerable, adapts and verifies the fix, and asks a person only when it can't prove something. First target: Django 4.2 (EOL 2026-04-07).

## Team

- Dflame (@iamdflame)

## Stack

- Python 3.12, uv, Typer, FastAPI
- LiteLLM (model gateway), headless Claude Code (adapter)
- neatlogs (agent observability, detections)
- Entire (agent sessions as git checkpoints)
- PostGIS in Docker (GIS tests)

## Build log

### 2026-10-11 · S0–S4 spikes and repo skeleton

**Done**
- S0: verified python 3.12.15, docker (hello-world), gh (`iamdflame`), Claude Code 2.1.296 and Entire, plus the existing PostGIS container `heirloom-pg` (postgis/postgis:16-3.4) and GDAL/GEOS dev libs. Nothing needed installing. Repo skeleton committed and published at https://github.com/iamdflame/heirloom.
- Forked django → https://github.com/iamdflame/django. `~/work/django` is a full clone with remote `fork`. Branch `stable/4.2.x-heirloom` was created locally at `3396992e83` (4.2.30); **the push is blocked**, see Known limitations.
- Trimmed test venv `work/venv-django` (§3 list + `psycopg[binary]` for PostGIS).
- Spikes, full detail in [docs/spikes.md](docs/spikes.md):
  - **S3 PASS.** Runtimes and baselines on L and U⁻ (`evals/baseline_s3.json`).
  - **S1 PASS with findings.** CVE-2026-87975 and CVE-2026-77050 both AFFECTED by hand-walked gates C0–C3. 77050's upstream tests ERROR on U⁻ (fix internals), so the behavioural tracemalloc probe was required. C4 exercised on a fixed twin: C4a conflicts, C4b → MUTANT_UNBUILDABLE (`_is_pk_set`), and **C4c is unsound across refactors** (it would "prove" NOT_AFFECTED via the `_is_pk_set()` refactor commit `5865ff5adc`).
  - **S2 PASS (trailer + checkpoint), branch push BLOCKED.** Headless `claude -p` via the gateway: 7 turns, $0.2005, 20 s. Orchestrator commit `d4e768f` has `Entire-Checkpoint: 01M4M6CR7PEVT271C9117GNQS0`; the checkpoint ref was pushed to the fork after pointing Entire's checkpoint remote at the fork instead of django/django.
  - **S4 PARTIAL.** neatlogs init, sessions, LiteLLM auto-instrumentation, conditional detection creation (2 field-spelling variants) and hits/trends reads all work. No custom-attribute span finished ingesting within the box, so no detection hit has been observed yet.

**Tests that actually ran** (Django `runtests.py --parallel=1 -v 2`, Python 3.12.15, every run asserted `django.__file__` inside the worktree)
| What | Tree | Result |
|---|---|---|
| model_formsets | L (4.2.30) | 74 tests, OK |
| model_formsets | U⁻ (dd0558d161) | 78 tests, OK |
| i18n | L | 232 tests, OK (skipped=83, no gettext) |
| i18n | U⁻ (f59aef2ee9) | 237 tests, OK (skipped=88) |
| forms_tests | L | 950 tests, OK (skipped=2) |
| forms_tests | U⁻ (dd0558d161) | 1033 tests, OK (skipped=2) |
| gis_tests (PostGIS) | L | 560 tests, FAILED (failures=3, errors=4, skipped=21): env baseline |
| gis_tests (PostGIS) | U⁻ (dd0558d161) | 650 tests, FAILED (errors=2, skipped=48): env baseline |
| upstream CVE-2026-87975 tests ×3 | U⁻ / U⁺ | FAIL×3 (failures=3) / OK×3 |
| upstream CVE-2026-77050 tests ×3 | U⁻ / U⁺ | ERROR×3 (errors=2) / OK×3 |
| probe hl_cve_2026_87975 ×3 | U⁻ / U⁺ / L | FAIL (3) / OK / FAIL (3) |
| probe hl_cve_2026_77050 ×3 | U⁻ / U⁺ / L | FAIL (1) / OK / FAIL (1) |
| probe 87975 + model_formsets ×3 | L + hand fix | OK |
| probe 87975 ×3 | L + hand fix + C4b transplant | ERROR (3), AttributeError `_is_pk_set` |
| probe 87975 + model_formsets | S2 (L + headless-adapted fix) | OK |

No heirloom pytest suite exists yet; no pipeline code was written this session.

**Failures that remain**
- Push of `stable/4.2.x-heirloom` and `hl/s2-cve-2026-87975` to the fork is rejected: the gh token lacks the `workflow` scope.
- S4: no detection hit observed yet; the custom-attribute field spelling is unconfirmed.
- 7 environmental gis_tests failures on L (GEOS 3.14 / GDAL 3.12 vs Django 4.2); 83 i18n skips (no system gettext).

**Links**
- Spikes: [docs/spikes.md](docs/spikes.md) · baselines: [evals/baseline_s3.json](evals/baseline_s3.json) · probes: [evals/spike_probes/](evals/spike_probes/)
- Fork: https://github.com/iamdflame/django (checkpoint ref `refs/entire/checkpoints/S0/01M4M6CR7PEVT271C9117GNQS0`)

**Entire**
- `entire status` (heirloom): `● Enabled · branch main · Agents · Claude Code · Checkpoints sync to: origin`. `entire checkpoint list`: 0 checkpoints on main.
- `entire status` (work/wt/S2): `Checkpoints sync to: dedicated checkpoint remote (iamdflame/django)`. `entire checkpoint list`: 1 checkpoint, `01M4M6CR7PEVT271C9117GNQS0` → `d4e768f`.

### 2026-10-11 · L0 golden path: `heirloom cve CVE-2026-87975 --line 4.2`

**Done**
- Pushed `stable/4.2.x-heirloom` (= `3396992e83`, tag 4.2.30) and the S2 demo branch `hl/s2-cve-2026-87975` to the fork once the `workflow` scope was granted.
- Built the pipeline in the brief's order:
  - `ledger.py` (SQLite, `(cve, line, stage, attempt)`, an interrupted effect becomes `unknown` and pauses until reconciled);
  - `sources/django_security.py`;
  - `verify/runner.py` (outcome classifier where ERROR never counts as FAIL, plus an in-process `django.__file__` worktree guard);
  - the PRESENCE verdict table with the §9 calibration fixes (staged C4a, added-condition mutant, recursive C4c provenance);
  - LOCATE → PROBE (independent porter with a leakage guard) → CALIBRATE → PRESENCE → ADAPT (headless Claude Code in an Entire worktree) → VERIFY → BEHAVIOUR → DECIDE → PUBLISH (commit, push, artifacts, PR).
- Every stage runs inside a neatlogs child span of a per-CVE WORKFLOW root that carries all §5 attributes; the five detection predicates are mirrored in the ledger.
- Acceptance is scripted in `evals/l0.py` and recorded in [`evals/results_l0.json`](evals/results_l0.json). Every number below comes from that file.

**Results (final code, `c08f4a7`)**
| Check | Result |
|---|---|
| 3× from a clean state (`clean --remote` → `cve`) | 3/3 pass: 75.3 s / 77.8 s / 76.7 s; $0.187 / $0.209 / $0.183 per CVE; every stage succeeded first time; PRs #6, #7, #8 (each closed by the next clean) |
| Kill + resume | SIGKILL of the process group while ADAPT's `claude -p` was running (adapt #1 failed, #2 done), then `resume` with injected crashes right after publish.commit, publish.push and publish.pr (each exit 137), then `resume` to completion: exit 0 |
| No duplicates after resume | 1 commit on the fork branch, 1 open PR ([#9](https://github.com/iamdflame/django/pull/9)), each publish effect done exactly once; all three crashed effects paused as `unknown` and reconciled as "happened" against git/`ls-remote`/`gh` |
| Re-run of a published CVE | no-op in 4.5 s: same commit, same PR, no new stage attempts |
| PR #9 | verdict AFFECTED (C1 C2 C3), `Entire-Checkpoint: 01M4MAKVSBHAHH00AQ3PSJM4HN` with the ref on the fork, 12 claims, 0 struck, escalations 0, ledger cost $0.168 (excludes the killed adapt attempt, see below) |
| pytest / ruff / mypy --strict | 83 passed / clean / clean (39 files) |

**Tests that actually ran**
- pytest (83): `test_ledger` (12), `test_django_security` (7, incl. a live check that all 19 post-EOL CVEs have a 5.2 commit and no 4.2 commit), `test_runner` (21, incl. two real runs on the 4.2.30 tree), `test_presence` (13, incl. weakened probe ⇒ UNPROVEN), `test_calibrate` (8, incl. the real `_is_pk_set` refactor trap), `test_probe_rules` (10), `test_claims` (5), `test_detections` (3), `test_decide` (4).
- Inside every pipeline run (Django `runtests.py --parallel=1 -v 2`):
  - the 3 upstream 87975 tests 3× on U⁻ (FAIL) and on U⁺ (PASS);
  - the porter's probe 3× each on U⁻ (FAIL), U⁺ (PASS) and L (FAIL), with coverage on L;
  - the probe 3× on L+fix (PASS);
  - `inline_formsets model_forms model_formsets` (266 tests) on unmodified L and on L+fix: 0 new failures, 0 new skips;
  - the probe + upstream tests on U⁺ and L+fix (BEHAVIOUR: same on all 5 comparable tests).

**Bugs found by the runs (fixed, with tests)**
- The probe validator rejected `from .models import …`, which surfaced as a bogus PROBE_ERROR question ([issue #1](https://github.com/iamdflame/heirloom/issues/1), closed with an explanation).
- Django's `tests/.coveragerc` (`source = django`) overrode `--include`, and coverage keys did not match the mapped paths, so every probe looked like NO_REACH ([issue #2](https://github.com/iamdflame/heirloom/issues/2), closed).
- Artifacts were keyed on the run id, so re-running a published CVE re-published artifacts and edited the PR. They are now keyed on the pushed commit.

**Failures / open problems**
- **neatlogs ingestion:**
  - Of the ~10 pipeline traces, only one has finalized: `d1389e2383`, the 4-second no-op rerun with 14 replay spans and no LLM span. Full runs are `dlq` or `pending` with 0 spans, including PR #9's trace `d67121e6…`, so its span links currently lead to nothing.
  - AGENT/CHAIN roots always dead-letter. Hypothesis under test: the porter's ~120 KB LiteLLM payload breaks server-side PII redaction (`doctor --probe` showed ingestion stuck at `pii_redaction`). The fallback per §9 is the local ledger mirror (0 detection hits across all runs).
  - The five §5 detections are not created yet, and the two S4 test detections are still active, because the attribute field spelling is still unconfirmed by a real hit.
- **Unverified trace link format:** the app documents no deep links, so trace URLs use a configurable template (`NEATLOGS_TRACE_URL`). The trace and span ids are printed beside each link.
- **Lost cost from a killed agent:** a killed `claude -p` attempt's spend is not recorded (the process dies before reporting `total_cost_usd`).
- **Evidence-only publishing missing:** publishing for NOT_AFFECTED_PROVEN/UNPROVEN, and `/heirloom answer` polling for open questions, are not built yet (L1).
- **No Entire trailers for this build session:** it started in a repo with no commits (the §9.3 trap), so its commits (`8b3f885`…`c08f4a7`) carry no `Entire-Checkpoint`. Recover with `entire session attach` as was done for B1.

**Entire**
- `entire status` (heirloom): `● Enabled · branch main · Agents · Claude Code · Checkpoints sync to: origin`. `entire checkpoint list`: 1 checkpoint, `01M4M7HFXFT5DBGHYNDES4J73Y` → `acba7e5`.
- Pipeline worktree (`work/cve/CVE-2026-87975-4.2/trees/Lfix`): checkpoints sync to `iamdflame/django`. `entire checkpoint explain --generate 01M4MAKVSBHAHH00AQ3PSJM4HN` (summary model set to `claude-sonnet-4.6` via `entire configure --summarize-model`, run through the gateway):

  > **Checkpoint 01M4MAKVSBHAHH00AQ3PSJM4HN** · session `030f083b-38a0-4506-8ce7-1c8b0032bb7f` · 2026-10-11 01:53:08 · 199.2k tokens · commit `8e263e5` [4.2.x] Fixed CVE-2026-87975 -- Prevented forging actions in model formsets with editable PKs.
  >
  > **Intent:** Backport security fix for CVE-2026-87975 from Django 5.2 to Django 4.2, preventing forged POST data from deleting or creating objects outside a ModelFormSet's queryset via editable primary keys.
  >
  > **Outcome:** Successfully applied a one-line fix to `django/forms/models.py` adding `or obj._state.adding` to the existing `obj.pk is None` guard in `save_existing_objects()`. All 3 CVE probe tests and all 74 `model_formsets` regression tests pass.
  >
  > **Learnings (repository):** Django 4.2 uses `obj.pk is None` directly rather than the `obj._is_pk_set()` helper introduced in 5.x, so backports must preserve the older idiom. Django sets `_state.adding = False` only after a successful database fetch; instances constructed in memory (via `construct_instance()` or `BaseInlineFormSet` parent-link assignment) retain `_state.adding = True` even if their PK field is later populated.
  >
  > **Learnings (code):** `django/forms/models.py:909-933`: `BaseModelFormSet.save_existing_objects()` iterated `initial_forms` and used `obj.pk is None` as the sole guard against acting on instances not fetched from the queryset. With editable PKs, `construct_instance()` or inline parent-link logic could populate the PK, bypassing this guard. The fix adds `or obj._state.adding` to catch all freshly constructed instances regardless of PK population.
  >
  > **Learnings (workflow):** The upstream 5.2 diff was directly translatable to 4.2 by substituting the 5.x `_is_pk_set()` helper call with the 4.2 idiom (`obj.pk is None`) and appending the new `obj._state.adding` condition. Running both the targeted CVE probe (`hl_cve_2026_87975`) and the touched module's full test suite (`model_formsets`) in parallel is an efficient way to confirm correctness without broader test runs.
  >
  > **Open items:** No commit or push was made per the task rules; the fix remains as a local working-tree change only. The fix covers `BaseModelFormSet`; it was not verified whether `BaseInlineFormSet` subclass overrides of `save_existing_objects` need a parallel guard in 4.2.

  The agent was told not to commit; the orchestrator committed `8e263e5` after VERIFY. Heirloom's VERIFY also ran `inline_formsets` (0 new failures), which partly covers the inline open item.

**Links**
- PR: https://github.com/iamdflame/django/pull/9 · run artifacts: the `artifacts` branch of this repo (`runs/<run-id>/CVE-2026-87975-4.2/`)
- Results: [evals/results_l0.json](evals/results_l0.json) · neatlogs findings: [docs/spikes.md](docs/spikes.md#l0-follow-up--neatlogs-span-shapes-2026-10-11-sdk-1426)

### 2026-10-11 (session B3) · Day-2 foundation, E1 backtest, distro lines

This session was tracked by Entire from the start: `entire session current` showed session `f5117257-5211-42ae-823c-32aa228a28d9` active. Two threads ran: A (this conversation) and B (a subagent in its own worktree, Django clone and work dir, merged as `28504fe`). 37 commits on `main` since `042d547`.

**Spikes**
- **LiteLLM budget** ([evals/litellm_budget.json](evals/litellm_budget.json), from `GET /key/info`):
  - At the start: $2.96 spent of $20 (30-day window, resets 2026-11-01).
  - At the end (15:22 UTC): **$20.35 of $20, so the key is exhausted.** After that the router overflowed to the OpenRouter key under the new policy: 26 calls between 14:40 and 15:22, $3.76 of the $25 cap (all v1 conflict resolutions).
  - Heirloom's own cost records (token × list price, plus `claude -p`'s `total_cost_usd`) come to roughly half of what the gateway billed today. See open problems.
- **neatlogs** ([evals/neatlogs_ingestion.json](evals/neatlogs_ingestion.json)):
  - With the §10.2 settings (16 KB attribute mask that always returns the dict, LLM input/output capture off, `pii_span_types` = TOOL/GUARDRAIL/CHAIN/WORKFLOW, WORKFLOW root, flush + shutdown), the eval-line run of CVE-2026-87975 (`heirloom cve … --line eval-4.2.30 --kind eval`) was stored: trace `b6559615…`, **finalized, 12 spans**, including the LLM span. The 12- to 21-span backtest traces that followed finalized too.
  - Detections do evaluate on this project: a control detection `status = OK` on `presence` spans got 23 hits.
  - **Ten spellings of a custom attribute** (`heirloom.stage`, `attributes.heirloom.stage`, `span.attributes.…`, `metadata.…`, `heirloom_stage`, `attributes["heirloom.stage"]`, `span_attributes.…`, `custom_attributes.…`, `attributes.heirloom_stage`, plus `name`) **got 0 hits**. So the five §5 detections were *not* created, and the two S4 test detections were *not* deleted (both conditional on a confirmed spelling). The probe detections were deleted again; deletion needs `{"confirmation": <id>}`.
  - The earlier unmasked 100 KB experiment trace also finalized eventually, so the old dead-lettering was at least partly transient on neatlogs' side.

**Foundation (§10.2), Thread A**
- **`LineSpec`:** gains `kind` (release/eval/distro), `publish` and `upstream_fallbacks`. Runtime lines come from `heirloom cve CVE --line NAME --tip REF --kind eval|distro`, and the spec is stored with the run for `resume`.
- **Deny-by-default publish guard** (`heirloom/guard.py`): it runs inside every GitHub write and every `git push`. `tests/test_publish_guard.py` (12 tests) proves eval and distro lines can never open an issue or PR, or push, at the spec level, at every writer, and through a full `pipeline()` run.
- **Multi-commit fixes:** the parser keeps every fix commit per series, including the "5.2.18" follow-up of CVE-2026-15830. LOCATE uses upstream fallbacks (CVE-2025-27556 → 5.1).
- **Calibration split:** `reference()` covers U⁻/U⁺ and is shared across lines; `on_line(tip)` covers C2–C4. Reach ignores docstring- and comment-only hunks. Reuse mode needs a C1-discriminating probe and never retries.
- **Fixes found by the backtest:**
  - Python 3.12 `[msg]` subtest headers had been classified as ERROR.
  - Message-literal BEHAVIOUR check.
  - The adapter must keep upstream messages.
  - Leakage guard narrowed (new whole lines only; not the L-source sections).
  - Probe imports widened to the stdlib minus time/network/process.
  - Changed (not only added) test methods count as test ids.
  - GIS fixes run on PostGIS (`heirloom/verify/django_settings/test_postgis.py`).
  - Empty coverage means zero reach.
  - Overflow only after the key is exhausted, with a global cap.
  - Transient gateway 5xx/429 retried.
- **Eval leakage guard:** ADAPT on eval/distro lines runs in a one-commit repo (`git init` + depth-1 fetch of L) with `git log`/`git show` disallowed. A test proves the fellows' fix is unreachable from it.

**E1 backtest** ([evals/results.json](evals/results.json), table in README via `evals/render_readme.py`)

| | v2 (Heirloom) | v1 (naive) |
|---|---|---|
| Cases | 27 (16 decided) | 27 (27 decided) |
| **False NOT_AFFECTED** | **0** | **1** (CVE-2026-1285: v1's own upstream tests FAILED, yet the empty patch counted as "not affected") |
| False AFFECTED | 1 (CVE-2025-27556) | 3 (CVE-2025-27556, 25673 and 33034 twins) |
| Accuracy on decided | 93.8% | 85.2% |
| UNPROVEN / escalation rate | 9 / 37% | 0 / 0% |
| Fellows' own 4.2 test passes on our patch | 7/13 | 11/13 |
| $ total (estimate) / min per case | $3.59 / 1.0 | $3.99 / 1.96 |

- **Spike:** v2 ran first on CVE-2026-1287 and CVE-2026-25674, then from a clean state after fixing what it found. False NOT_AFFECTED stayed 0 throughout, so there was no stop.
- **v2 UNPROVEN positives:** 1207 (NON_DISCRIMINATING), 1285, 25674 and 3902 (NO_REACH: the probe missed one of the fix's call sites), 25673 (PROBE_ERROR). The 1207 and 25673 twins were skipped (no C1 probe to reuse).
- **CVE-2026-1287 (v2 AFFECTED, fellows' test fails):** a genuine choice. Upstream changed the alias error message. 4.2's existing tests assert the old message, so adopting the new one broke them and the adapter may not edit tests. VERIFY forced the old message back, BEHAVIOUR flagged the difference, and DECIDE recorded `would_ask`. The fellows solved it by editing their tests.
- **CVE-2025-27556 (both pipelines AFFECTED; truth not affected):**
  - Django's 2025-04-02 advisory lists only main, 5.2 (RC), 5.1 and 5.0.
  - 4.2.20's vendored `_urlsplit` never runs the NFKC netloc check.
  - The probe asserted the fix's *mitigation* (a URL length cap) rather than the slow mechanism, and C1–C3 all held. This is a known gap: calibration cannot yet tell a mitigation probe from a mechanism probe.
- **v1's higher fellows'-test rate is real.** Cherry-picking the upstream fix wholesale (tests included) matches the fellows' 4.2 commits closely, while v2 declines to patch what it cannot prove.

**Distro lines, Thread B** ([evals/distro_lines.json](evals/distro_lines.json), [evals/matrix.json](evals/matrix.json), [evals/cve_2026_87890.json](evals/cve_2026_87890.json), [evals/cve_2026_53878.json](evals/cve_2026_53878.json), [evals/new_probes.json](evals/new_probes.json))
- **Lines built, one commit per patch** (DEP-3 header + `Distro-Patch:` trailer; `diff -r` of django/ against the orig tarball empty; sha256s recorded):
  - ubuntu-noble 3:4.2.11-1ubuntu1.18: 48 patches, tip `f566e91a2c`.
  - debian-trixie 3:4.2.28-0+deb13u2: 6 patches, tip `5c81215443`.
- **CVE-2026-87890:** the hand-written bytes-recorder probe (labelled as such, not from the porter) FAILs ×3 on dd0558d1^ and PASSes ×3 on dd0558d1. It is **AFFECTED on 4.2.30 and on ubuntu-noble**: noble's CVE-2026-15307 backport leaves the bytes path open.
- **CVE-2026-53878:** **NOT_AFFECTED_PROVEN on 4.2.30** via the absent-symbol path:
  - C1 holds.
  - L ERRORs ×3 with an `ImportError` naming `DomainNameValidator`.
  - `blame -C -C` provenance of the 14 changed lines ends at 4971a9afe5, a pure addition committed *after* the merge base. Its 2016 author date is misleading; the brief's "re-add" premise is wrong and is covered by a synthetic test instead.
- **Matrix** (33 CVEs, reused probes, $0 model spend):
  - 4.2.30: 7 AFFECTED, 7 NOT_AFFECTED_PROVEN, 6 UNPROVEN, 13 without a probe.
  - debian-trixie: 11 / 4 / 5 / 13.
  - ubuntu-noble: 3 / 11 / 6 / 13.
  - Cross-check against Ubuntu's own patches: 10 of the 15 CVEs Ubuntu patched are NOT_AFFECTED_PROVEN on noble, 5 UNPROVEN, **0 AFFECTED**. Of the 5 post-EOL CVEs Ubuntu fixed, 4 are NOT_AFFECTED_PROVEN; 15307 is UNPROVEN (NO_REACH, the probe design overrides a fix symbol).
- **Thread B spent $0.81** of its $3 cap (LiteLLM only).

**Tests that actually ran**
- pytest at `HEAD` after the merge: **162 passed**: test_absent 12, test_backtest 7, test_calibrate 11, test_claims 5, test_decide 4, test_detections 6, test_distro 17, test_django_security 9, test_handwritten 4, test_ledger 12, test_matrix 5, test_overflow 5, test_presence 13, test_probe_rules 16, test_publish_guard 12, test_runner 23, test_runner_import_error 1.
- ruff check, ruff format --check and mypy --strict: clean (58 files).
- Runs:
  - the eval line for CVE-2026-87975 (twice: once fresh, once re-calibrating);
  - E1 v2, 27 cases; E1 v1, 27 cases;
  - Thread B: distro builds, 87890 calibration and runs, 53878 three porter attempts, `heirloom new-probe` for 5766/35192/6907/8404/15307, and the matrix.
- One real PostGIS check: `gis_tests.rasterapp` on 4.2.30, 19 tests OK.

**Entire**
- `entire status`: `● Enabled · branch main`, active session `f5117257-5211-42ae-823c-32aa228a28d9`.
- `entire checkpoint list`: 3 on main. They are this session's temporary checkpoint (`f5117257-521`, latest 09:50) plus the B1 and B2 link checkpoints `01M4M7HFXFT5DBGHYNDES4J73Y` and `01M4MDN1QK7ZJ4B793F1XPZQ9W`.

### 2026-10-11 (session B4) · §11 fixes, E2 campaign replay, matrix, read API

Session `225b7a56-c495-4dd8-b388-71381b6416ff`, started headless at 20:43 UTC. `entire session current` showed it active (not the old f5117257 conversation). Every number below comes from `evals/results_live.json`, `evals/matrix.json`, `evals/results.json`, `evals/detections*.json` or `evals/recovery_b4.json`.

**Decisions (headless; recorded as made)**
- **Provider-reported cost:** OpenRouter calls send `usage: {include: true}` and record `usage.cost`; `claude -p` records `total_cost_usd`. A check on 2026-10-11 found `claude -p` on OpenRouter reported $0.10849875 and the OpenRouter key's billed usage rose by exactly that amount (≈60 s later), so it counts as provider-reported there. Gateway-era costs stay flagged `cost_estimated`. The overflow cap uses the larger of our records and the key's billed `usage` (`GET /api/v1/key`), which also covers killed calls whose cost we never saw.
- **Campaign cap:** the campaign stores the overflow total at its start ($3.8636) and allows $18 on top. Before claiming each event a worker requires `spent + $1.50 × (running + 1) ≤ $18`, so the campaign stops before it can cross the cap.
- **Porter model ladder:** the first porter attempt uses `claude-haiku` (Haiku 4.5 on OpenRouter); retries with calibration feedback use `claude-sonnet-4.6`. ADAPT stays on Sonnet 4.6 (`claude -p`).
- **Coverage:** `concurrency = thread` is in the runner's rcfile and in the calibrate ledger key, so reach evidence measured before §11 is recomputed rather than reused.
- **Detections:** the built-in condition is `status = OK` (the only built-in field verified to hit on this project). `latency_ms` from the brief is unverified, so it is not used.
- **UNPROVEN on the release line** publishes an evidence issue, which serves as the escalation. It does not open a blocking question: only real choices (`BEHAVIOUR_DIFF`, `ADAPT_FAILED`) do.
- **Probe reuse:** porter probes already calibrated on the 4.2.30 tree (AFFECTED or NOT_AFFECTED_PROVEN there) are reused on line 4.2. The UNPROVEN 15307 probe and the hand-written 87890 probe are not reused, so the porter runs for those.
- **CVE-2026-87975** is recorded as `skipped / ALREADY_PUBLISHED` (PR #9). It gets no new run and no new PR.
- **Disk:** removed the E1 backtest worktrees (6.8 GB of `work/cve/*-bt-*/trees`); logs and ledger rows are kept.
- **Parallelism:** 3 worker processes share the Django clone. Git lock contention is retried, and artifacts publishing takes a lock.
- **Matrix scope:** I re-ran only the 19 post-EOL CVEs × 3 lines, one process per line. The 14 Feb–Apr CVEs keep their B3 cells, labelled `carried_from`. A full 99-cell re-run would not fit the 30-minute box, and those CVEs gained no new probe.
- **Stacking:** if 87890's dependency (15307) waits on a question, 87890 is blocked rather than evaluated on the bare line. Its backport would then sit on top of a branch that does not exist yet. The dependency is noted on question #6.
- **Leakage guard:** the B3 merge had silently dropped `ef0e7fb`'s exemption for fix lines that the upstream test diff also shows. It was restored after it refused CVE-2026-35193's porter over `patch_vary_headers,`.
- **New question kind `UPSTREAM_TEST_CHANGE`:** this applies when a backport passes the probe and edits no test, yet the only new failures are 4.2 tests that upstream rewrote in the same fix commit. Re-adapting cannot fix that without diverging from upstream, so ADAPT stops and DECIDE asks once. Options: `publish-evidence` (default), `adopt-upstream-tests` (the orchestrator, never the adapter, applies upstream's own hunks to those test files and verifies again), or `skip`. The path that applies `adopt-upstream-tests` is implemented, but it has not run, since nobody has answered yet.
- **Restarts:** I stopped and restarted the campaign workers four times to deploy harness fixes found by the run itself. Every restart resumed from the ledger, so finished stages were never redone and nothing was published twice.

**§11 quick fixes (≈15 min)**
- **(a) Cost:** see Decisions. The router now skips a known-exhausted gateway key, and `claude -p` on OpenRouter uses OpenRouter's model slugs (`anthropic/claude-sonnet-4.6`).
- **(b) Thread coverage:** I re-ran the CVE-2026-3902 E1 pair. Reach was recomputed (new ledger attempts) and is **unchanged: UNPROVEN (NO_REACH)** on both the positive and the fixed twin. The probe executes `ASGIRequest.__init__` (33 body lines) but never calls `AsyncRequestFactory.generic`, so this is a probe-design gap, not a threading one. The E1 v2 summary is unchanged: 27 cases, 16 decided, accuracy 93.8%, **false NOT_AFFECTED 0**, 9 UNPROVEN. README table re-rendered; its cost note now separates provider-reported from estimated cases (14 v2 cases are estimates).
- **(c) Detections:**
  - Created the five §5 detections (runOn `span_name heirloom.flag.<predicate>`, condition `status = OK`) and deleted the two S4 test detections.
  - A v1-style flag span (`evals/emit_flag_sample.py`: CVE-2026-1285 "not affected" without calibration, in a throwaway ledger) produced **a neatlogs hit after 90 s** on `not_affected_without_calibration` (`evals/detections_flag_check.json`, trace `cf03051e54fc0325304db42ddf2f1823`).
  - At 21:54 UTC (`evals/detections.json`), neatlogs vs the local mirror:

    | Detection | neatlogs hits | local mirror |
    |---|---:|---:|
    | `claim_without_span` | 13 | 13 |
    | `probe_never_reached_region` | 4 | 9 |
    | `not_affected_without_calibration` | 1 (the v1 sample) | 0 |
    | `fix_applied_where_probe_passed` | 0 | 0 |
    | `test_edited_after_red` | 0 | 0 |

    `claim_without_span` caught a real bug: 9 PRs were created while the C2/V1 claims pointed at a log name that no longer exists. Those claims were struck automatically; after the fix and a re-render, the PRs show 0 unlinked claims. `probe_never_reached_region` fires on CVE-2026-53878's absent-symbol proof, where reach is undefined: a false positive of that predicate.

**E2 campaign replay** (`heirloom campaign --line 4.2 --replay --workers 3 --cap 18 --id b4-replay`; `evals/results_live.json`)
- **Plan:**
  - 6 archive commits → 19 new advisories + 1 follow-up (CVE-2026-15830 + `1eafa1a8` at `904349fcbe`).
  - Story CVEs first.
  - `git blame` on CVE-2026-87890's U⁻ links it to CVE-2026-15307's `115ffd04`, with no hand-written link.
- **Outcome per CVE** (19):

| CVE | Outcome | Verdict | Link | $ (ledger) | min |
|---|---|---|---|---:|---:|
| CVE-2026-15307 | waiting_human | AFFECTED | [issue #6](https://github.com/iamdflame/heirloom/issues/6) | 0.50 | 12.57 |
| CVE-2026-87890 | blocked | PENDING (DEPENDENCY on 15307) | — | 0.00 | 0.0 |
| CVE-2026-15830 | evidence | UNPROVEN (NO_REACH) | [issue #4](https://github.com/iamdflame/heirloom/issues/4) | 0.87 | 5.87 |
| CVE-2026-53878 | evidence | NOT_AFFECTED_PROVEN | [issue #3](https://github.com/iamdflame/heirloom/issues/3) | 0.00 | 1.87 |
| CVE-2026-35192 | published | AFFECTED | [PR #11](https://github.com/iamdflame/django/pull/11) | 0.11 | 11.26 |
| CVE-2026-5766 | published | AFFECTED | [PR #12](https://github.com/iamdflame/django/pull/12) | 0.14 | 9.0 |
| CVE-2026-6907 | published | AFFECTED | [PR #13](https://github.com/iamdflame/django/pull/13) | 0.09 | 7.63 |
| CVE-2026-35193 | evidence | UNPROVEN (NON_DISCRIMINATING) | [issue #5](https://github.com/iamdflame/heirloom/issues/5) | 0.07 | 1.39 |
| CVE-2026-48587 | published | AFFECTED | [PR #10](https://github.com/iamdflame/django/pull/10) | 0.12 | 5.01 |
| CVE-2026-6873 | published | AFFECTED | [PR #14](https://github.com/iamdflame/django/pull/14) | 0.19 | 4.45 |
| CVE-2026-7666 | evidence | UNPROVEN (PROBE_ERROR) | [issue #7](https://github.com/iamdflame/heirloom/issues/7) | 0.20 | 4.68 |
| CVE-2026-8404 | published | AFFECTED | [PR #16](https://github.com/iamdflame/django/pull/16) | 0.11 | 4.87 |
| CVE-2026-48588 | published | AFFECTED | [PR #17](https://github.com/iamdflame/django/pull/17) | 0.11 | 4.88 |
| CVE-2026-53877 | published | AFFECTED | [PR #15](https://github.com/iamdflame/django/pull/15) | 0.13 | 2.84 |
| CVE-2026-15337 | evidence | UNPROVEN (NON_DISCRIMINATING) | [issue #8](https://github.com/iamdflame/heirloom/issues/8) | 0.12 | 1.7 |
| CVE-2026-15920 | published | AFFECTED | [PR #18](https://github.com/iamdflame/django/pull/18) | 0.23 | 2.41 |
| CVE-2026-77050 | evidence | UNPROVEN (PROBE_ERROR) | [issue #9](https://github.com/iamdflame/heirloom/issues/9) | 0.11 | 1.88 |
| CVE-2026-84429 | waiting_human | AFFECTED | [issue #6](https://github.com/iamdflame/heirloom/issues/6) | 0.35 | 3.04 |
| CVE-2026-87975 | skipped | AFFECTED (ALREADY_PUBLISHED) | [PR #9](https://github.com/iamdflame/django/pull/9) | — | — |

- **Totals:**
  - **Verdicts:** 12 AFFECTED, 1 NOT_AFFECTED_PROVEN, 5 UNPROVEN, 1 PENDING (blocked).
  - **Publications:**
    - 9 new PRs (#10–#18);
    - 6 evidence issues (#3, #4, #5, #7, #8, #9);
    - **1 question (#6)**, which is waited on by 15307 and 84429; 87890 is blocked on it.
  - **Escalation:** 7 escalated (2 questions + 5 UNPROVEN), rate **36.8%**.
  - **Cost and time:** ledger model cost $3.45; wall time over all runs 85.3 min (3 workers in parallel).
- **Overflow (provider-reported):**
  - The campaign spent **$4.22 of its $18 cap**. Its overflow total started at $3.86, and the OpenRouter key's billed usage was $8.09 at the end.
  - The ledger records $3.45; the ≈$0.77 gap is spend that interrupted calls never reported. That is why the cap uses the billed figure.
  - Before the campaign, this session spent $0.11 on a `claude -p` connectivity check.
- **Ask-once in practice:**
  - **15307:** the porter's Haiku probe failed the gates and Sonnet's probe passed: AFFECTED.
    - Its first adaptation added `DisallowedRasterLookup` as upstream did and passed the probe.
    - It then broke `test_all_gis_lookups_with_rasters`, `test_dwithin_gis_lookup_output_with_rasters`, `test_lhs_with_index_rhs_without_index` and `test_lookup_value_error`, all four rewritten by upstream in `115ffd04`. That opened question #6.
  - **84429** later hit the same kind (`utils_tests.test_http.ParseHeaderParameterTests.test_rfc2231_wrong_title`, rewritten by its upstream fix). DECIDE found #6 by its marker and asked nothing new.
  - **87890** is blocked on #6 by its blame dependency. Its stacked PR (base `heirloom/cve-2026-15307-4.2`) and the comment on 15307's PR happen only once 15307 is published.
- **Follow-up:** 15830's first fix was UNPROVEN (NO_REACH), so there was no branch to fast-forward. Its follow-up event re-evaluated the whole fix at `904349fcbe` (still NO_REACH) and updated evidence issue #4 in place. The fast-forward path (stacked line, `done_fixes`, PR comment) is implemented but did not run.
- **Recovery** (`evals/recovery_b4.json`):
  - CVE-2026-35192's worker was SIGTERMed mid-ADAPT (`adapt #1 failed: SystemExit: 143`; the killed `claude -p` never reported its cost) to deploy a fix.
  - `campaign --continue` resumed the same run `20261011T210815Z-e826` from the ledger: adapt #2 ($0.106), verify, behaviour, decide, commit, push, artifacts.
  - A later harness bug failed `publish.pr` after the push. The next pass reconciled into exactly one PR (#11).
  - Traces: killed attempt `00000b0f2ae0082898a888d7ec8eea0d`, resumed run `b4459b250cdec7a84bf1023b0275cdf7`.
- **Bugs the campaign found (all fixed, with tests):**
  1. Marker issues looked up through the lagging search index.
  2. Reused probes missing the porter's record (`KeyError` in the PR claims).
  3. The lost leakage-guard exemption.
  4. Haiku's invalid probes never escalating to Sonnet (CVE-2026-7666).
  5. Deletion-only test hunks not counted as changed tests.
  6. Claim links to renamed calibration logs.
  7. A reused probe citing the wrong origin run.

**Matrix** (`evals/matrix.json`, 99 cells, $0 model spend)
- **Coverage:** the 19 post-EOL CVEs × 4.2.30 / debian-trixie / ubuntu-noble were re-run with the campaign's new probes (57 cells, one process per line, about 2 min each). The 14 Feb–Apr CVEs' 42 cells are carried over from the B3 matrix and labelled `carried_from: 2026-10-11T14:19:06Z`.
- **Setup:** the distro branches were fetched into the main clone from Thread B's clone (same SHAs as `evals/distro_lines.json`).
- **Verdicts by line:**
  - 4.2.30: 14 AFFECTED, 7 NOT_AFFECTED_PROVEN, 6 UNPROVEN, 6 without a probe.
  - debian-trixie: 18 / 4 / 5 / 6.
  - ubuntu-noble: 9 / 11 / 7 / 6.
- **Post-EOL CVEs:**
  - **Coverage:** 15 of the 19 now have a calibrated probe. There is none for 7666, 35193, 15337 or 77050.
  - **ubuntu-noble cross-check:** of the 5 post-EOL CVEs Ubuntu fixed, 4 are NOT_AFFECTED_PROVEN on noble (5766, 35192, 6907, 8404). 15307 is UNPROVEN (NO_REACH) there, while AFFECTED on 4.2.30 and trixie.
  - **Distro-patched cells overall:** 10 of 15 meet the NOT_AFFECTED_PROVEN expectation.

**Read API (§10.6)**
- `heirloom serve` (FastAPI, read-only, JSON only) answers `/`, `/matrix`, `/campaign`, `/backtest`, `/cve/{id}` (404 for unknown ids), `/line/{id}`, `/runs` and `/events`. It was started on port 8077, queried, and stopped.
- `heirloom export --out site/data/` wrote 43 files (2.8 MB). Checked: no secret values in them.

**Tests that actually ran**
- pytest: **181 passed** (new: test_campaign 7, test_api 2, test_coverage_threads 3, plus additions to test_overflow, test_detections, test_decide, test_probe_rules and test_publish_guard). ruff check, ruff format --check (heirloom, tests) and mypy --strict: clean (64 files).
- Django `runtests.py` runs inside the pipeline, every one asserting `django.__file__` inside its worktree:
  - the E1 3902 pair's calibration on L;
  - every campaign CVE's C0 (where the upstream tests exist), calibration 3× on U⁻/U⁺/L, VERIFY baselines and after-runs for the touched labels (e.g. `gis_tests` on PostGIS for 15307), and BEHAVIOUR for the published ones;
  - 57 matrix cells.

**Entire**
- `entire status`: `● Enabled · branch main · Checkpoints sync to: origin`; active session `225b7a56-c495-4dd8-b388-71381b6416ff`.
- `entire checkpoint list`: 21 checkpoints on main by 21:54 UTC. Every B4 commit carries an `Entire-Checkpoint` trailer (e.g. `0be06ff` → `01M4PBNQ7NQQAXAZADG1G2B7HH`, `50c2330` → `01M4PFB2C18E3HT0EY4RQ5MHDJ`).
- Runtime checkpoints: each campaign backport commit on the fork carries its `claude -p` session's checkpoint (e.g. PR #11: `01M4PCTVJ7PVT3G8S56D54RWW9`, ref pushed to `iamdflame/django`).

## Demo

## Known limitations and next steps

- **Question #6 (resolved in B5):** answered `adopt-upstream-tests`; stored as precedent P001 and applied by CVE-2026-15307 (PR #20) and CVE-2026-84429 (PR #19); CVE-2026-87890 then published stacked as PR #21. Nothing waits on a human now.
- **Budget:**
  - The LiteLLM key is exhausted ($20.35 of $20 until 2026-11-01).
  - Overflow: the OpenRouter key's billed usage is $8.09 of the $25 cap (the B4 campaign spent $4.22 of its $18 cap).
  - Costs recorded before §11 (LiteLLM gateway) are estimates and lower bounds. OpenRouter-era costs are provider-reported.
- **neatlogs:**
  - Detections run on flag span names because no custom-attribute spelling has ever matched.
  - `probe_never_reached_region` fires on absent-symbol NOT_AFFECTED_PROVEN, where reach is undefined: a false positive of the predicate.
  - `NEATLOGS_TRACE_URL` (the real deep-link format) is still unset.
- **Calibration gaps:**
  - A mitigation-asserting probe (CVE-2025-27556) passes every gate.
  - **NO_REACH:**
    - NO_REACH when the fix spans backend-specific code that cannot run here (CVE-2026-15830 touches the MySQL/Oracle/SpatiaLite converters; tests run on PostGIS).
    - E1 positives with several call sites (CVE-2026-3902: `AsyncRequestFactory.generic` never called).
  - **No calibrated probe:**
    - CVE-2026-7666's fix is in the SMTP backend, and probes may not open sockets; a local SMTP fixture would be a design change.
    - CVE-2026-77050's porter probes ERROR on U⁺ (S1 needed a tracemalloc probe).
    - CVE-2026-35193 and CVE-2026-15337: the probes do not discriminate.
- **Not run yet:** the follow-up fast-forward (no follow-up event has had a published first fix). The stacked PR path ran in B5 (PR #21 on #20).
- **Outreach:** four drafts in `docs/outreach/` (B5b); none filed.
- **`entire review` findings left (B6):** medium #1, `rerender` calls `campaign.prepare`, which can recompute the stacked base and the reusable probe instead of replaying what the original run used, so a re-render may raise `ReplayMiss` or render a different note (fix: persist spec, head, reuse and note on the campaign event; >10 min, not done). Lows not fixed: `reach_feedback` can print an empty "Not executed" list; the reach retry does not re-check the budget cap; `relink` hardcodes line 4.2 and one failed `gh view` aborts the loop.
- **Not live:** no EC2 `watch` timer (systemd or cron) runs; the ledger, work tree and artifacts worktree stay on the build box. The read API runs only locally (`heirloom serve`); `site/data/` is the static export.
- **Not verified:** Entire redaction (CLI 0.11.4 exposes no setting); B6 scanned every object in every ref for `.env` secret values instead (0 hits).
- **Owner items:** walkthrough video, screenshots in `docs/`, `#neatHack` build-in-public links, and `/code-review` (high) on this repo (only `entire review` ran).
- **Housekeeping:** install `gettext` (needs approval) to un-skip i18n extraction tests.

## Submission

- README first screen: [README.md](README.md); evidence map: [EVIDENCE.md](EVIDENCE.md); DoD check: [docs/DOD-status.md](docs/DOD-status.md).
- **Build-in-public links tagged #neatHack (PLACEHOLDER: owner to fill; nothing was posted from the build machine):**
  - [ ] …
  - [ ] …

## B5b: headless continuation (2026-10-12, session 0a27285b)

### 87890 outcome (step 0)

- **CVE-2026-87890: AFFECTED, published as [PR #21](https://github.com/iamdflame/django/pull/21).**
  - The PR is stacked: base `heirloom/cve-2026-15307-4.2` (the branch of PR #20, CVE-2026-15307), head `heirloom/cve-2026-87890-4.2`, one commit `5cf157ce31`.
  - Its body carries the note "Stacked on …/pull/20 … Merge that PR first." (blame: `115ffd0463`).
  - Gates C1 C2 C3 passed; 0 claims without evidence; escalations 0; checkpoint `01M4PR917WADTM34J6J3AY17Z9`.
  - The PR was created 2026-10-12 00:30:28Z, from run `20261012T002657Z-0879` ($0.45), i.e. in the `--continue` run after #6 was answered.
- **What the `--requeue` re-run (log `campaign-87890-20261012T012019Z.log`) actually did:** it finished in 4 s with cost $0.00 and kept status `published` with the same PR. It was a no-op on an already-published record, so the reach retry was not exercised on 87890 and nothing new was published.
- Campaign totals after the re-run (`work/campaign/b4-replay.json`): 19 CVEs; 13 AFFECTED, 5 UNPROVEN, 1 NOT_AFFECTED_PROVEN; 12 published, 6 evidence, 1 skipped; ledger $3.91 against the $18 cap.
- **"Asked once" trace:** CVE-2026-15307 opened question [#6](https://github.com/iamdflame/heirloom/issues/6) (`UPSTREAM_TEST_CHANGE`, django/4.2) at 2026-10-11 21:20:17Z, asking trace `2976b1584b28`. The owner answered `adopt-upstream-tests` at 23:56:11Z and Heirloom recorded precedent P001 at 00:00:19Z. [PR #20](https://github.com/iamdflame/django/pull/20) (15307) was re-rendered with the question and trace cited.
- **"Reused without asking" trace:** CVE-2026-84429 ([PR #19](https://github.com/iamdflame/django/pull/19), created 2026-10-12 00:00:39Z) applied P001 directly: its D1 claim reads "Decision publish-fix by stored precedent P001", ledger `runs/20261012T000021Z-ae48/CVE-2026-84429-4.2/ledger.json`, and its note cites #6 and the asking trace. It opened no new question; #6 recorded only a comment "CVE-2026-84429 also waits on this answer (same kind, same scope; asked once)".

### Entire depth (step 1; outputs in [docs/entire/](docs/entire/))

- **`entire review`** ([review-main.txt](docs/entire/review-main.txt)):
  - First run asked for a profile (no profile configured; the wizard is interactive). I configured one non-interactively (`entire review --configure --local --set-agents claude-code --set-model claude-code=sonnet --set-judge claude-code=sonnet --set-output local`, saved to the untracked `.entire/settings.local.json`) and ran `entire review general --base 7bbe5e5~1`, i.e. main against the commit before the B5 work (6 commits, 15 files). Reviewing `main` against its own default base would have been an empty diff.
  - One reviewer (sonnet) plus judge, 1 succeeded. Verdict "approve with nits", no definite correctness bug; it read the diff and did not run tests. Findings, not acted on here: `rerender` calls `prepare`, which can recompute the stacked base and reusable probe instead of replaying (medium); `_notes` can say "no new question" when the ledger row is missing (medium); a precedent with no issue renders `[#]()` (low); `reach_feedback` can print an empty "Not executed" list (low); the reach retry does not re-check the budget cap (low); `relink` hardcodes line 4.2 and one failed `gh view` aborts the loop (low).
- **`entire recap --static --week`** ([recap-week.txt](docs/entire/recap-week.txt)): ran non-interactively, but reports 0 sessions, 0 checkpoints for 2026-10-06..13. The recap is server-analysed ("Labels require server analysis"), so it does not reflect the local checkpoints; I record it as returned.
- **`entire checkpoint explain 01M4PD5ZE2YST8SFD7AMRSWCN6`** (PR #13, CVE-2026-6907 runtime checkpoint; [output](docs/entire/checkpoint-pr13-01M4PD5ZE2YST8SFD7AMRSWCN6.txt)):
  - It is not in this repo's checkpoints and `--repo gh/iamdflame/django` is refused ("not onboarded to Entire"). I fetched `refs/entire/checkpoints/*` from the fork into `~/work/django` and ran it there.
  - It shows the headless adapter session `96d41bc2`, 165.1k tokens, created 2026-10-11 21:16:27, touching only `django/middleware/cache.py`. The recorded prompt is the porter task: the upstream 5.2 diff, the rules (edit only `django/`, never `tests/`), and the failing probe's two `Vary: *` failures on 4.2. The transcript shows Read, Edit, two test runs, and the adapter's summary. "Commits: (none on this branch)" is expected: the checkpoint is linked from the fork's commit trailer, not from this repo.
- **`entire checkpoint explain 01M4PR1YH3WPKT57E94SCTPJQ9`** (B5 build checkpoint; [output](docs/entire/checkpoint-B5-01M4PR1YH3WPKT57E94SCTPJQ9.txt)): session `906e2055` (B5), 4336.7k tokens, created 2026-10-12 00:26:32, linked to commit `a444c2a` ("Precedent PRs cite their question and asking trace; replay-only rerender"); 8 files (campaign.py, cli.py, ledger.py, pipeline/{context,publish,run}.py, two test files). Its "Intent" is empty ("no prompt recorded") and the summary is not generated (needs `--generate`); the transcript scope shows the tool calls of that step, including the link check of a neatlogs deep link and the diff proving #20's test hunks identical to upstream's `115ffd04`.

### Outreach drafts (step 2; nothing filed)

[docs/outreach/](docs/outreach/): `ubuntu-cve-2026-87890.md`, `debian-cve-2026-53878.md`, `neatlogs-pii-dlq.md` (+ the S4 emitter `neatlogs-pii-dlq-emit_s4.py`), `entire-empty-repo-session.md`. Each links its evidence and states what it does not claim.
- **Ubuntu:** the required sentence is used verbatim; the probe is stated as hand-written and calibrated on Django's own fix commits (FAIL ×3 on `dd0558d1^`, PASS ×3 on `dd0558d1`); no exploitability claim and no jammy claim. **No candidate noble patch is included**, because none exists (the stacked 4.2 PR #21 was verified on 4.2.30, not noble's tree). The raw noble probe logs are local files (`work/cve/…`), not on GitHub; the draft tells the filer to attach them.
- **Debian:** built on evidence issue #3 and its blame provenance chain (14 → `4971a9afe5`). Nothing in the repo records what the Debian tracker currently says, so the draft tells the filer to check the tracker first.
- **neatlogs:** the brief's premise (large attributes stall `pii_redaction`) is not supported by our own records: the S4 emitter used small attributes, and later large-ish traces finalized. The draft reports what was observed and marks the large-payload cause as unconfirmed.
- **Entire:** reproduced for real today in a scratch repo with Entire CLI 0.11.4. Before the first commit, `claude -p` left no session (`entire session list` → "No sessions."), and `.entire/logs/entire.log` has `failed to initialize session: failed to get HEAD: reference not found`. After one commit the same command was tracked.

### cfo.ai business plan (step 3)

`claude mcp list` showed `cfoai` connected. Built in the only workspace on the account ("Kumasi Technical University"): inputs and monthly plan tables, scenarios Base (renamed from Main Scenario), Bear, Bull, and three read-only share links (a link opens one scenario). Links and the table of every input with its source are in [docs/business-plan.md](docs/business-plan.md). Measured: model cost per CVE $0.217, 5.13 machine minutes, publish rate 0.667, escalation rate 0.278, EC2 t2.2xlarge $0.3712/h (third-party aggregators; instance type and region unconfirmed). #6's open-to-answer time (155.9 min) is elapsed time and one observation, so the human-minutes input is an assumption. Result: Base reaches break-even in Dec 2027 with $73.5k of $150k cash left; Bear runs out of cash in Nov 2027; Bull is cash-positive from about month 3. All of that rests on assumed prices and volumes.

### Log (2026-10-12, B5b, session 0a27285b)

- Verified the 87890 outcome: PR #21 AFFECTED, stacked on PR #20's branch, with the merge-first note. The `--requeue` re-run itself did nothing new (4 s, $0.00).
- Saved `entire review` (one sonnet reviewer + judge, 6 B5 commits), `entire recap` (0 sessions; server-analysed) and two `entire checkpoint explain` outputs under docs/entire/.
- Wrote the four outreach drafts and the business plan. Filed nothing. No PRs for 87975; no `clean --remote`; no `.env` values printed. The $18 overflow cap: campaign spend recorded in `b4-replay.json` is $4.67 of $18, and this step spent no campaign money (the review and one probe `claude -p` call ran on this session's account).

## B6: hardening, README and evidence (2026-10-12, session ea42def1)

Started headless at 01:40 UTC. `entire session current` showed `ea42def1-7e83-4778-8eee-e5ca17bee164`, active, not f5117257. No model-spending runs, no new PRs, no `clean --remote`, no `.env` values printed.

**Loose ends (step 1)**
- **Issue #10** (CVE-2026-87890 UNPROVEN, NO_REACH, run `20261012T000126Z-90e8`): I edited it in place. It now opens with "Superseded by iamdflame/django#21", names the reach-retry run `20261012T002657Z-0879` (presence #4 still NO_REACH; the reach-retry probe #4 reached `BaseSpatialField.get_prep_value` and `GDALRaster.check_raster_lookup_value`; presence #5 calibrated → AFFECTED), its ledger, trace `a64e2127…` and checkpoint, and keeps the original record below. The title was updated and the issue closed.
- **`evals/results_live.json`** was committed in its final state: 13 AFFECTED, 5 UNPROVEN, 1 NOT_AFFECTED_PROVEN; 12 published, 6 evidence, 1 skipped; 13 PRs; 6 evidence issues (#10 dropped); escalation 26.3%; ledger $3.91; campaign spend $4.67 of the $18 cap.
- **Noble probe logs:** I published 9 raw logs of the 87890 matrix probe (`2e97ddd6`) to the `artifacts` branch at `matrix/b4-20261011/CVE-2026-87890/` (commit `82c16032`): `Um`/`Up`/`L` on 4.2.30 and `L` on noble. They were checked against every `.env` value (0 hits; the only sensitive-looking content is local paths). The Ubuntu draft now links them, and both raw URLs return 200.
- **`entire review` mediums:** #2 is fixed (`_asking` returns the asking CVE, orders its query, and "no new question" appears only when the ledger shows another CVE asked), together with the `[#]()` low, plus a test. #1 (`rerender`/`prepare`) is listed under known limitations because it is more than 10 minutes of work.

**DoD (step 2):** [docs/DOD-status.md](docs/DOD-status.md) has 23 PASS, 5 PARTIAL, 3 FAIL and 1 NOT LIVE. Fixes made because items failed:
- `gh` (120 s), `git` (900 s; push 300 s), `entire` (300 s) and `claude -p` (1800 s) had no timeouts. Each now raises its module's error, and `tests/test_timeouts.py` covers them.
- The CLI prints `heirloom: error: …` instead of a traceback.
- `heirloom cve` on a publishing line checks the fork and its base branch before any model spend.
- The per-CVE budget guard has a unit test (`tests/test_budget_guard.py`). No real run has hit the cap.
- Added `heirloom report --cve` (local replay from the ledger, with a test) and an MIT `LICENSE`.
- Bad-input checks that ran: unknown CVE, unknown line, missing sha, unreachable fork (by remote name and by URL). The unknown-CVE check left one failed `locate` row for CVE-2099-0001 in the ledger.
- The read API was queried locally on ports 8078 and 8079.
- **Correction recorded:** the DoD says CVE-2026-87890 reused the precedent. In the ledger it was CVE-2026-84429 (PR #19). 87890 was stacked on 15307 instead.

**README (step 3):** `evals/render_readme.py` now renders three blocks: the first screen, the full E1 table, and a campaign detail block (per-CVE table, full 3-line matrix, detections). New: `evals/export_campaign_evidence.py` writes `evals/campaign_evidence.json` from the ledger. It covers fail→pass for all 13 PRs (13 of 13 FAIL×3 → PASS×3), the single question #6 (asked by 15307; 84429 waited on it) and precedent P001 (applied by #20 and #19). The Ubuntu sentence is verbatim. The ×3 counts come from the matrix cell's runs.

**EVIDENCE.md (step 4):** each item on the evidence list is mapped to links. Build-in-public is a marked placeholder.

**Tests that actually ran (B6):** pytest **197 passed**; `ruff check heirloom tests` clean; `ruff format --check heirloom tests` 67 files formatted; `mypy --strict heirloom tests` no issues in 67 files. Plus the targeted DoD subset (10 passed). Re-run at the end of the session; the result is recorded in the final commit.

