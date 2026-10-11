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

## Demo

## Known limitations and next steps

- Run `gh auth refresh -h github.com -s workflow`, then push `stable/4.2.x-heirloom` (and the S2 demo branch) to the fork.
- Fix C4c (recursive provenance through refactors) and add an "added-condition" C4b mutant before L0; add both to the verdict-table unit tests.
- Pipeline must stage/commit before `git apply -R --3way` (C4a), and set `entire configure --checkpoint-remote github:<fork>` in every worktree.
- neatlogs: emit `heirloom.*` spans under an AGENT root (`@neatlogs.span`), confirm the attribute field spelling with a real hit, then create the five §5 detections; `identify()` has no `parent_session_id`.
- Install `gettext` (needs approval) to un-skip i18n extraction/compilation tests.

## Submission
