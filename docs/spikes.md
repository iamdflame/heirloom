# Spikes (BUILD-BRIEF §7 S0–S4)

Session date: 2026-10-11. Host: EC2 Ubuntu 24.04, 8 vCPU.
All logs referenced below live under `work/logs/` (gitignored); extracted numbers are in `evals/baseline_s3.json`.

## S0 · environment

| Item | State |
|---|---|
| python3.12 | 3.12.15 (uv-managed, `~/.local/bin/python3.12`); `python3.12 -m venv` works, so the apt `python3.12-venv` package is not needed |
| docker | `docker run --rm hello-world` → "Hello from Docker!" |
| postgis | container `heirloom-pg`, image `postgis/postgis:16-3.4`, 127.0.0.1:5432, `pg_isready` OK. PostGIS 3.4.3 / PG 16.4 |
| libgdal-dev, libgeos-dev | installed. Runtime libs seen by Django: GEOS 3.14.1, GDAL 3.12.2 |
| gh | logged in as `iamdflame`, scopes `gist, read:org, repo` (**no `workflow` scope**, see below) |
| Claude Code | 2.1.296 |
| Entire | `entire status` → "Enabled · branch main, Agents · Claude Code" |
| django clone | `~/work/django`, full (not shallow); tag `4.2.30` = `3396992e837d5146270ea8112bb622c83fa4a919` |
| fork | `gh repo fork django/django --clone=false` → https://github.com/iamdflame/django; remote `fork` added |
| fork branch | `stable/4.2.x-heirloom` created locally at `3396992e83`. **Push rejected**: `refusing to allow an OAuth App to create or update workflow .github/workflows/benchmark.yml without workflow scope`. Needs `gh auth refresh -h github.com -s workflow` (interactive) |
| test venv | `work/venv-django` (uv, py3.12): asgiref sqlparse tblib Pillow PyYAML jinja2 argon2-cffi bcrypt pytz tzdata `docutils<0.22` aiosmtpd pymemcache redis coverage, **plus `psycopg[binary]`** (needed for gis_tests on PostGIS; not in the §3 list) |

Test runner: `work/run.sh <worktree> <logname> <labels...>` runs
`cd $WT/tests && PYTHONPATH=$WT:work/settings python runtests.py <labels> --parallel=1 -v 2`
after asserting `realpath(django.__file__)` is inside `$WT` (exit 99 otherwise). PostGIS settings: `work/settings/test_postgis.py` (password read from the container env at run time, never written to disk).

## S3 · test runtimes and baselines

Trees (git worktrees under `work/wt/`):
- **L** = `3396992e83` (4.2.30)
- **U⁻(87975)** = `ff27883ca0^` = `dd0558d161`; **U⁺(87975)** = `ff27883ca0`
- **U⁻(77050)** = `02a69e3791^` = `f59aef2ee9`; **U⁺(77050)** = `02a69e3791`

Commands:
```
work/run.sh work/wt/L         S3-L-model_formsets       model_formsets
work/run.sh work/wt/Um-87975  S3-Um-87975-model_formsets model_formsets
work/run.sh work/wt/L         S3-L-i18n                 i18n
work/run.sh work/wt/Um-77050  S3-Um-77050-i18n          i18n
work/run.sh work/wt/L         S3-L-forms_tests          forms_tests
work/run.sh work/wt/Um-87975  S3-Um-87975-forms_tests   forms_tests
work/run.sh work/wt/L         S3-L-gis_tests            gis_tests --settings=test_postgis
work/run.sh work/wt/Um-87975  S3-Um-87975-gis_tests     gis_tests --settings=test_postgis
```

Results (every run asserted the right `django/__init__.py`):

| Label | Tree | Tests | Wall | Result |
|---|---|---:|---:|---|
| model_formsets | L | 74 | 1.9s | OK |
| model_formsets | U⁻ | 78 | 1.8s | OK |
| i18n | L | 232 | 1.0s | OK (skipped=83) |
| i18n | U⁻ | 237 | 1.7s | OK (skipped=88) |
| forms_tests | L | 950 | 2.6s | OK (skipped=2) |
| forms_tests | U⁻ | 1033 | 2.7s | OK (skipped=2) |
| gis_tests (PostGIS) | L | 560 | 45.8s | FAILED (failures=3, errors=4, skipped=21) |
| gis_tests (PostGIS) | U⁻ | 650 | 22.0s | FAILED (errors=2, skipped=48) |

Baseline failures on unmodified L (gis_tests), all environmental (4.2 predates GEOS 3.14 / GDAL 3.12):
- FAIL `geos_tests.test_io.GEOSIOTest.test02_wktwriter`, `test_wkt_writer_precision`, `test_wkt_writer_trim`: GEOS 3.12+ changed WKT trimming/precision defaults (`'POINT (5.0000000000000000 23.0000000000000000)' != 'POINT (5 23)'`).
- ERROR `gdal_tests.test_driver.DriverTest.test01_valid_driver`, `test03_aliases`: `Could not initialize GDAL/OGR Driver on input: TIGER` (driver dropped from GDAL 3.12). These two also ERROR on U⁻.
- ERROR `gdal_tests.test_srs.SpatialRefTest.test_unicode`, `geoapp.tests.GeoModelTest.test_empty_geometries` (`Geometry has Z dimension but column does not`).

Skips: i18n skips are all environmental: 63 × "xgettext is mandatory", 20 × "msgfmt is mandatory" (system `gettext` not installed). gis skips: GeoIP/GeoIP2 data absent, plus backend feature skips.

**Verdict: PASS.** Each of these labels runs in under 3 s, except gis_tests (~46 s on L), so 3× calibration runs are cheap. The baseline is recorded, and "green" means no new failures beyond the 7 gis ids above. Follow-ups: install `gettext` (apt; needs approval) to un-skip i18n extraction/compilation tests, which would otherwise count as ENV_SKIP. GIS CVEs touching GDAL drivers may hit ENV_SKIP/UNPROVEN on this host.

## S1 · calibration walk-through (CVE-2026-87975, CVE-2026-77050)

Probes are in `evals/spike_probes/hl_cve_2026_{87975,77050}/` and were copied into `tests/` of each worktree.
**Caveat:** these probes were written by hand during the spike by someone who had seen the fix diffs, so this is a walk-through of the gates, not a test of the independent porter.

### LOCATE
`git show origin/main:docs/releases/security.txt` (main @ `dab0a5c47f`). Entries use `` :cve:`2026-NNNNN` `` and `` * Django 5.2 :commit:`(patch) <40-hex>` ``, which the parser must match (a plain `grep CVE-2026` finds nothing).

| CVE | 5.2 sha | message check | django/ files | tests/ files |
|---|---|---|---|---|
| 87975 | `ff27883ca055aa9ab23015b50674a5b10dfe5a41` | "[5.2.x] Fixed CVE-2026-87975 …", "Backport of 83cbd21be5… from main" | `django/forms/models.py` | `tests/model_formsets/tests.py` (+3 tests) |
| 77050 | `02a69e3791e3df23d45ea4ea7e7fc489f0eef2be` | "[5.2.x] Fixed CVE-2026-77050 …" | `django/utils/translation/trans_real.py` | `tests/i18n/tests.py` (+2 tests) |

### C0 · upstream tests on U⁻ / U⁺ (3 runs each)
```
git show --format= <sha> -- tests/ | git -C work/wt/Um-<cve> apply
work/run.sh work/wt/{Um,Up}-<cve> S1-C0-<cve>-{Um,Up}-<n> <the new upstream test ids>
```
| CVE | U⁻ ×3 | U⁺ ×3 | C0 |
|---|---|---|---|
| 87975 | FAILED (failures=3), AssertionError (`False is not True`, `DoesNotExist not raised`) | OK | **holds** |
| 77050 | FAILED (**errors=2**): `AttributeError: module 'django.utils.translation.trans_real' has no attribute '_get_supported_language_variant'` | OK | **does not hold**: tests depend on fix internals, so a behavioural probe is required (ERROR ≠ FAIL) |

### C1 / C2 · probe on U⁻, U⁺, L (3 runs each)
- 87975 probe: 3 tests (forged DELETE outside queryset with an editable PK; the same through an inline formset where the parent link is the PK; forged initial form creating a row). Public API only (`modelformset_factory`, `inlineformset_factory`) plus its own `models.py`.
- 77050 probe: 50 distinct 90 kB language codes through `django.utils.translation.get_supported_language_variant`; deterministic signal = tracemalloc retained bytes after `gc.collect()`, asserted `< 1_000_000`. No wall-clock.

| CVE | U⁻ ×3 | U⁺ ×3 | L ×3 |
|---|---|---|---|
| 87975 | FAILED (failures=3) | OK | FAILED (failures=3) |
| 77050 | FAILED (failures=1), `retained 4512680 bytes` | OK | FAILED (failures=1), `retained 4512680 bytes` |

Failing-id sets are byte-identical across all 6 failing runs (U⁻×3 + L×3) per CVE (md5 of sorted `FAIL:` lines).
Nothing ERRORed or skipped on L, so **C1 and C2 hold for both**.

### C3 · reach
A scratch script used `ast` on U⁻ to find the innermost function enclosing each `-U0` fix hunk (pure insertions anchored on the preceding line), mapped it to L by qualname, and intersected it with `coverage run --include=<file>` executed lines from the probe run on L.

| CVE | symbol (U⁻ → L) | L lines | body lines hit |
|---|---|---|---|
| 87975 | `BaseModelFormSet.save_existing_objects` | 909–933 | 16 |
| 77050 | `get_supported_language_variant` | 492–540 | 17 |
| 77050 | `reset_cache` | 61–69 | 4 |

Every symbol exists in L under the same qualname, so no `git log --follow` or search fallback was needed. **C3 holds for both.** (`get_supported_language_variant` is byte-identical between L and U⁻.)

### Presence verdict (by hand)
- **CVE-2026-87975 → AFFECTED** (C1 ∧ C2 ∧ C3 ∧ L FAILs with the same ids as U⁻). L has the same logic as `if obj.pk is None:`, with no `_state.adding` check.
- **CVE-2026-77050 → AFFECTED** (same conditions; the upstream tests can't serve as the probe).

### C4 exercised on a fixed twin (87975)
C4 does not trigger on the real L, so it was exercised on **Lfix** = L + the hand-adapted one-line fix `if obj.pk is None or obj._state.adding:`.
- Lfix: probe + `model_formsets` → OK ×3 (77 tests; a preview of VERIFY: fail-before/pass-after with no new failures).
- **C4a** `git apply -R --3way fix.patch` on Lfix → `Applied patch … with conflicts` (`ours: obj.pk is None or obj._state.adding` vs `theirs: not obj._is_pk_set()`). Mutant not buildable, so fall through. (Without staging first, `--3way` fails with `does not match index`; the pipeline must commit or stage the tree before C4a.)
- **C4b** libcst transplant of U⁻'s `BaseModelFormSet.save_existing_objects` into Lfix → probe `FAILED (errors=3)` ×3: `AttributeError: 'Item' object has no attribute '_is_pk_set'`. ERROR is not a catch, so **MUTANT_UNBUILDABLE**, exactly as the brief anticipated.
- **C4c** provenance: the changed line on U⁻ (`if not obj._is_pk_set():`, line 938) blames to `5865ff5adc` (2024-09-10, "Refs #373 -- Added Model._is_pk_set() abstraction…"). It is **not** an ancestor of merge-base `9409312eef` (verified = `git merge-base 3396992e83 ff27883ca0`), there are 0 "Backport of 5865ff5adcf6…" commits in L, and `_is_pk_set` is absent from L's symbol. **All three conditions hold**, so C4c would "prove" NOT_AFFECTED.

**Finding: C4c as specified is unsound across refactors.** `5865ff5adc` *replaced* `if obj.pk is None:` with `if not obj._is_pk_set():`. The vulnerable behaviour predates the branch point; only its spelling changed. On the fixed twin the conclusion happens to be right, but C4c would reach the same conclusion if a weak probe passed on the *vulnerable* L, giving a false NOT_AFFECTED. Recommended rule changes before L0:
1. **C4c recursive provenance:** if blame commit C *modified* the line (the line has a predecessor in `C^`'s version of the hunk), recurse with `git blame C^` on the predecessor; accept only when the chain ends in a pure addition. Here the chain reaches `if obj.pk is None:` (pre-branch), so C4c fails, and the fixed twin becomes UNPROVEN: MUTANT_UNBUILDABLE rather than wrongly "proven".
2. **C4b fallback, "added-condition mutant":** when the fix only adds boolean operands (`or obj._state.adding`), remove those operands from L's mapped symbol instead of transplanting the whole function. That would catch it here without needing 5.x internals.
3. Unit-test both against this exact case (it belongs in the calibration verdict table tests).

**Verdict: PASS with findings.** Both CVEs are AFFECTED by the calibrated gates. 77050 confirms the "upstream tests ERROR on U⁻" path. The C4c soundness gap and the C4a staging requirement must be fixed in `calibrate.py`.

## S2 · headless Claude Code + Entire trailer

1. **Gateway curl.** `POST https://litellm.vision.aivar.app/v1/messages` with `model=claude-sonnet-4.6`, `max_tokens=20` → `http=200 t=0.71s`, `stop_reason=end_turn`, content `pong`.
2. **Entire-enabled worktree.** `git worktree add -b hl/s2-cve-2026-87975 work/wt/S2 stable/4.2.x-heirloom`, then `entire enable --agent claude-code --yes --local --telemetry=false` → "Installed 9 hooks for Claude Code … Configured project .entire/settings.local.json". Added `"commit_linking": "always"` to `.entire/settings.local.json` and `.claude/` and `.entire/` to `$(git rev-parse --git-common-dir)/info/exclude`. Git hooks were installed in the shared `~/work/django/.git/hooks` (commit-msg, post-commit, post-rewrite, pre-push, prepare-commit-msg).
3. **Headless adapter.** Env per §4 (`ANTHROPIC_BASE_URL=https://litellm.vision.aivar.app`, `ANTHROPIC_AUTH_TOKEN=$LITELLM_API_KEY`, `ANTHROPIC_MODEL=claude-sonnet-4.6`, `ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku`, `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`), plus `env -u CLAUDECODE -u ANTHROPIC_API_KEY` (because it was launched from inside a Claude Code session), `PATH=work/venv-django/bin:$PATH` and `PYTHONPATH=$WT`. Ran the exact §4 `claude -p … --permission-mode acceptEdits --allowedTools … --disallowedTools … --max-turns 40 --max-budget-usd 2 --output-format json`. The prompt was the task, the "don't edit tests/" rule, the probe command and the upstream `django/` diff.
   - Result: `subtype=success`, `num_turns=7`, `total_cost_usd=0.2005`, `duration_ms=20418`, `session_id=d1713697-ec39-4602-aaa8-8fdd3288b0b2`. Adaptive-thinking 400s: none, so `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING` was not needed.
   - Diff: `if obj.pk is None:` → `if obj.pk is None or obj._state.adding:` plus the upstream comment rewording. The same as the S1 hand adaptation. 0 files under `tests/` touched.
   - stderr had one benign warning: "claude.ai connectors are disabled because ANTHROPIC_API_KEY or another auth source is set".
4. **Orchestrator verify + commit.** `work/run.sh work/wt/S2 S2-verify hl_cve_2026_87975 model_formsets` → `OK`. `git commit` (by the orchestrator, not the agent) with CVE, upstream sha, verdict and the "candidate backport — not an official Django release" label → commit `d4e768f`.
5. **Trailer.** `git log -1 --format=%B | grep '^Entire-Checkpoint:'` → `Entire-Checkpoint: 01M4M6CR7PEVT271C9117GNQS0`. Local ref `refs/entire/checkpoints/S0/01M4M6CR7PEVT271C9117GNQS0`. `entire checkpoint explain 01M4M6CR7PEVT271C9117GNQS0` shows session `d1713697-…`, 222.4k tokens, commit `d4e768f`, file `django/forms/models.py`, and the headless transcript.
6. **Checkpoint remote.** `entire status` initially said "Checkpoints sync to: origin", and `origin` is **django/django**. Fixed with `entire configure --checkpoint-remote github:iamdflame/django` → "Checkpoints sync to: dedicated checkpoint remote (iamdflame/django)". The pipeline must do this in every worktree before any push.
7. **Push.** `git push fork hl/s2-cve-2026-87975` → Entire's pre-push hook: `[entire] Pushing 1 checkpoint ref(s) to checkpoint remote.... done`. `git ls-remote` on the fork shows `refs/entire/checkpoints/S0/01M4M6CR7PEVT271C9117GNQS0` (**checkpoint visible on the fork**). The **branch** itself was rejected: `refusing to allow an OAuth App to create or update workflow .github/workflows/benchmark.yml without workflow scope`.

**Verdict: PASS (trailer + checkpoint), BLOCKED on branch push.** Trailers appear in headless mode, so the `entire-agent-heirloom` plugin fallback is **not needed**. Unblock: `gh auth refresh -h github.com -s workflow`, then push `stable/4.2.x-heirloom` and `hl/s2-cve-2026-87975`.

## S4 · neatlogs

- `uv sync` → `neatlogs 1.4.26`. Its CLI has only `doctor` and `trace get`, with **no `neatlogs schema search`**. The conditional syntax came from the Public API OpenAPI spec (`https://docs.neatlogs.com/openapi/public-api.json`, 285 operations).
- Public API facts (verified with real calls):
  - base `https://app.neatlogs.com/api/v1/public`; headers `Authorization: Bearer $NEATLOGS_SERVICE_TOKEN`, `x-project-id`.
  - `idempotency-key` **must be a UUIDv4 or high-entropy base64url** (`heirloom-s4-…` → `400 INVALID_IDEMPOTENCY_KEY`). Deterministic keys: `uuid.UUID(bytes=sha256(name)[:16], version=4)`.
  - Create body: `{displayName, groupId (required), type:"conditional", runOn:{frequency: trace|span_type|span_name, span_names|span_types}, config:{root:{type:"group", logic:AND|OR, children:[{type:"rule", field, operator, value}]}}}`. Operators: `= != > < >= <= contains not_contains in not_in is_empty is_not_empty`.
  - Built-in project detections use bare fields (`cost`, `status`). Groups: Positive / Negative / Neutral.
  - Hits: `GET /detections/{id}/hits?limit=`. Trends: `GET /detections/{id}/trends?granularity=hour&from=&to=`.
  - `POST /detections/preview` needs a user OAuth token (not the service token).
- Created **two** variants of `not_affected_without_calibration` (group Negative, `runOn span_name=["calibrate"]`, rule `verdict = "NOT_AFFECTED_PROVEN" AND calibrated = false`), because the attribute field spelling is undocumented:
  - `007f83c6-8086-485f-9f82-a8f29ab3bbe2`: field `heirloom.verdict` / `heirloom.calibrated` → 201
  - `cc80fec3-df7f-49c4-9c7b-8b66df828532`: field `attributes.heirloom.verdict` / `attributes.heirloom.calibrated` → 201
- Emitter `work/s4/emit.py`: `neatlogs.init(api_key=…, workflow_name="heirloom", instrumentations=["litellm"], tags=[…])` **before** `import litellm`; `with neatlogs.identify(session_id="campaign-s4-<run>")`; one matching span (verdict `NOT_AFFECTED_PROVEN`, calibrated `False`) and one non-matching span (`AFFECTED`, `True`), all §5 attributes set explicitly; one `litellm.completion` via the gateway; `flush()` → `True`; `shutdown()`.
- Findings:
  1. `neatlogs.identify()` in 1.4.26 has **no `parent_session_id` parameter** (signature: `session_id, end_user_id, end_user_metadata`). The campaign→CVE parent link from §5 must use a span attribute or tags instead.
  2. Run 1 (`20261011T004202`): only the **auto-instrumented LiteLLM span** was ingested (`traceName=openai/claude-haiku`, 1 span, ingested ~1 s after the call). The `neatlogs.trace("calibrate", kind="GUARDRAIL")` spans **never appeared**: `neatlogs trace get` → 404 for 5 min. The SDK only accepts `workflow/chain/agent/mcp_tool/llm` as root kinds (`neatlogs/_wrap_utils.py: _ROOT_KINDS`), and the docstring says custom code should use `@span(kind=…)`. Root GUARDRAIL spans appear to be dropped.
  3. Run 2 (`20261011T004919`), with `calibrate` nested under an AGENT root: the AGENT trace `cve-CVE-SPIKE-CLEAN` **did** appear (~90 s, `spansCount` 0 while still processing); the matching trace had not been ingested by t+120 s.
  4. `neatlogs doctor --probe` → `FAIL TRACE_READBACK_TIMEOUT … Ingestion: processing at pii_redaction`, so backend ingestion is lagging on this project.
  5. The LiteLLM span reports `totalCostUsd: 0` for gateway models, so cost must be set explicitly on spans (`heirloom.cost_usd`) from the gateway/`claude -p` output, not inferred.
  6. Hits and trends endpoints return 200 with empty `hits: []` / `buckets: []` for both detections at time-box end. Hits re-checked at session close: see the end-of-session note below.

**Verdict: PARTIAL.** init, sessions, LiteLLM auto-instrumentation, detection creation, and hits/trends reads all work. **Not yet shown:** a conditional detection matching a custom span attribute, because no custom-attribute span had finished ingesting within the box. The brief lists no specific fallback for S4 (only "don't depend on backfill"). My proposal, not from the brief: keep both detection variants active and create the five real detections only once the field spelling is confirmed by a hit. Emit `heirloom.*` spans under an AGENT root via `@neatlogs.span(kind=…)`. Mirror each detection's predicate locally in the ledger so the before/after numbers never depend solely on neatlogs ingestion.

## L0 follow-up · neatlogs span shapes (2026-10-11, SDK 1.4.26)

§9 said to nest stages under an AGENT root. Measured on this project, that does not ingest. Three emitter experiments (scratch scripts, one neatlogs session per variant), read back with `GET /api/v1/public/traces`:

| Experiment (UTC) | Variant | Result |
|---|---|---|
| exp1 01:06 | WORKFLOW root + TOOL child (string attr) | **finalized**, 2 spans |
| exp1 01:06 | AGENT root (no children / TOOL child / GUARDRAIL child / str, bool+num, empty-string attrs), CHAIN root, `@neatlogs.span(kind="AGENT")` decorator | `dlq` (all 7), 0 spans |
| exp1 01:06 | bare AGENT root, nothing else | never listed |
| exp2 01:09 | WORKFLOW root + GUARDRAIL child + AGENT child → TOOL grandchild, bool/float/empty attrs | never listed (`GET /traces/{id}` 404 after 8 min) |
| exp3 01:21 | 10 WORKFLOW-root variants (child kind TOOL/GUARDRAIL/AGENT, bool/float/int/empty-string attrs, root attrs) | after 11 min only 3 listed, all `dlq` (float attr, GUARDRAIL child, root attrs); the other 7, including the exp1-identical baseline, not listed |

The dead-lettered trace's export returns `409 TRACE_FINALIZATION_FAILED` ("could not be finalized for span projection"); no further reason is exposed. Earlier, `neatlogs doctor --probe` reported ingestion stuck at `pii_redaction`.

Conclusion: ingestion on this project is unreliable for custom spans, and only a WORKFLOW root has ever finalized. Heirloom therefore:
- emits a WORKFLOW root per CVE run, with stage children carrying every §5 attribute;
- takes span/trace ids from the span object (`opentelemetry.trace.get_current_span()` returns an invalid span because the SDK uses its own context);
- mirrors all five detection predicates locally in the ledger (`detection_hits`), so detection numbers never depend on ingestion;
- re-emits a `replay` span for cached stages in a resumed run (a SIGKILLed process never exports its batch or closes its root).

PR claim links point at the emitted span ids. Whether a given trace shows up in the app depends on the ingestion behaviour above.
