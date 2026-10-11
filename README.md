Heirloom is an agent that keeps end-of-life software patched.

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
