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

## Demo

## Known limitations and next steps

- neatlogs: find out why full pipeline traces dead-letter (large LLM payloads vs PII redaction: try a `mask=` that truncates long attributes), then confirm the attribute field spelling with one real hit, create the five §5 detections and delete the two S4 test detections. Confirm the app's trace URL format.
- Record the cost of a killed `claude -p` attempt (e.g. parse the session transcript) so budget accounting survives SIGKILL.
- L1: evidence-only PR/issue for NOT_AFFECTED_PROVEN and UNPROVEN; `/heirloom answer` polling and the precedent loop; `campaign`, `backtest`, `watch`, `report`, `serve` commands.
- Install `gettext` (needs approval) to un-skip i18n extraction/compilation tests.

## Submission
