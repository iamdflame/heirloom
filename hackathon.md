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

## Demo

## Known limitations and next steps

- **Budget:** the LiteLLM key is exhausted ($20.35 of $20 until 2026-11-01). Overflow has used $3.76 of the $25 cap. Heirloom's recorded costs undercount the gateway's billing by about 2×; reconcile per request (LiteLLM spend logs) before trusting any $ figure.
- **neatlogs:**
  - The attribute field spelling for custom span attributes is unknown; confirm it in the UI's detection editor, then run `NEATLOGS_ATTR_FIELD=… heirloom detections --create --delete-s4`.
  - `NEATLOGS_TRACE_URL` (the real deep-link format) is still unset.
- **Calibration gaps:**
  - A mitigation-asserting probe (CVE-2025-27556) passes every gate.
  - 5 positives are UNPROVEN, 3 of them NO_REACH on fixes with several call sites; the porter needs a per-call-site test hint.
  - CVE-2026-15307 needs a probe that does not override a fix symbol.
- **13 post-EOL CVEs have no calibrated probe yet;** E2 campaign replay (§10.5) is not started.
- **Not done:** `docs/outreach/` drafts (§10.7) and the read API (§10.6).
- **Housekeeping:** record the cost of a killed `claude -p` attempt (cost_unknown). Install `gettext` (needs approval) to un-skip i18n extraction tests.

## Submission
