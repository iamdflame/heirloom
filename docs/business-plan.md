# Heirloom business plan (draft, 2026-10-12)

Model built in cfo.ai through its MCP: tables **Heirloom inputs** and **Heirloom monthly plan** on the page "Heirloom business plan", scenarios **Base (Main)**, **Bear**, **Bull**, monthly 2026-10 to 2027-12 (last close 2026-09-30).

**Shared read-only Page (one link per scenario; a cfo.ai share link opens one scenario):**
- Base: <https://app.cfo.ai/s/25vRDQClPxqPWB5g>
- Bear: <https://app.cfo.ai/s/iY4Wmzs_IFo0SBTz>
- Bull: <https://app.cfo.ai/s/ASqxTf1hUwtztmtT>

The only workspace on the connected cfo.ai account is named "Kumasi Technical University" (admin role); the model lives there. Anyone with a link has READ access; the links have no expiry and can be deactivated in cfo.ai.

**This is a hypothesis model, not a forecast.** No customer has been contacted, no price is validated, and nothing here was priced by a buyer.

## Buyers and pricing hypotheses

- **Buyers:** distro security teams and extended-support vendors for end-of-life open-source lines (the Django 4.2 backport work in this repo is the worked example).
- **Pricing (hypotheses):** a price per verified backport, plus a monthly subscription per package line. "Verified" means Heirloom's gates passed (a calibrated probe fails before and passes after, no test edited, no regression), as in the PR evidence tables.

## Inputs and sources

| Input (model name) | Base | Bear | Bull | Status | Source |
|---|---|---|---|---|---|
| Model cost per CVE USD | 0.217 | = | = | **measured** | $3.9053 ledger cost / 18 processed CVEs (19 in the campaign minus 1 skipped by policy). `evals/results_live.json` `summary.ledger_cost_usd`; `work/campaign/b4-replay.json`. Provider-reported for `claude -p` and OpenRouter calls; earlier LiteLLM-era costs are estimates and lower bounds (hackathon.md) |
| Machine minutes per CVE | 5.13 | = | = | **measured** | 92.3 minutes / 18 CVEs, `summary.minutes_total` as recorded per event (summed process minutes, not necessarily wall-clock) |
| EC2 USD per hour | 0.3712 | = | = | **measured price, one source** | t2.2xlarge on-demand, us-east-1, Linux: $0.3712/h per [Holori](https://calculator.holori.com/aws/ec2/t2.2xlarge/us-east-1) and $0.371/h per [DevZero](https://www.devzero.io/instances/aws/t2.2xlarge); both are third-party aggregators, not AWS's own price list, and the page did not break out Linux. The box is 8 vCPU / 31 GiB (consistent with t2.2xlarge); its instance type and region could not be read from instance metadata, so both are unconfirmed |
| Publish rate | 0.667 | = | = | **measured** | 12 published PRs / 18 processed CVEs (13 AFFECTED; 1 of them, 87975, was skipped by the budget policy; 5 UNPROVEN and 1 NOT_AFFECTED_PROVEN went to evidence issues). One campaign on one product line; not a general rate |
| Escalation rate | 0.278 | = | = | **measured** | 5 escalated / 18 (the campaign reports 0.263 = 5/19 including the skipped CVE) |
| Human minutes per escalation | 20 | 40 | 10 | **assumption** | The only observation: question [#6](https://github.com/iamdflame/heirloom/issues/6) opened 2026-10-11 21:20:17Z, answered 23:56:11Z = **155.9 minutes elapsed** (one observation). That is waiting time, not active human time; active minutes were not measured, so 20 is an assumption |
| Human cost per hour | 80 | = | = | **assumption** | loaded cost of a security engineer; not sourced |
| CVEs per line per month | 1.5 | 1.0 | 2.0 | **assumption** | the campaign processed 19 post-EOL CVEs in one replay; the rate per line per month is not measured |
| New lines per month | 1 | 0.5 | 2 | **assumption** | no customers yet |
| Monthly line churn | 0.03 | 0.06 | 0.02 | **assumption** | none observed |
| Price per verified backport | 400 | 150 | 800 | **assumption** | no buyer has been asked; unit cost below is ~$11 so the price is a hypothesis about value, not cost-plus |
| Subscription per line per month | 600 | 250 | 1200 | **assumption** | as above |
| Fixed monthly costs | 12000 | = | = | **assumption** | two part-time engineers plus tooling; not measured |
| Opening cash (2026-09) | 150000 | = | = | **assumption** | |
| Opening paying lines (2026-09) | 0 | = | = | **measured** | no paying customers |

"=" means the Bear and Bull scenarios inherit the base value.

## Unit economics from the measured inputs

Per processed CVE: model $0.217 + compute 5.13 min x $0.3712/h = $0.032 + human escalation 0.278 x 20 min x $80/h = $7.41 (the human term uses the **assumed** 20 minutes) = about $7.66; per verified backport (/0.667) about **$11.5**. Without the human term the measured cost is $0.25 per CVE. The measured model and compute costs are cents; the plan is decided by human time, fixed costs, line count and price.

## Results (read back from the cfo.ai model)

| | Base | Bear | Bull |
|---|---|---|---|
| Package lines, 2026-10 / 2027-03 / 2027-06 / 2027-12 | 1.0 / 5.6 / 8.0 / 12.2 | 0.5 / 2.6 / 3.6 / 5.0 | 2.0 / 11.4 / 16.6 / 26.1 |
| Total revenue, 2027-12 (USD/month) | 12,227 | 1,764 | 59,272 |
| Total costs, 2027-12 (USD/month) | 12,141 | 12,076 | 12,207 |
| Net cash flow, 2027-12 (USD/month) | +87 | -10,312 | +47,065 |
| Cash, 2027-12 | 73,544 | -14,574 | 464,759 |
| Runway | cash falls from 150,000 to 73,544 and net cash flow reaches break-even in Dec 2027 | cash exhausted in Nov 2027 (about 14 months) | net cash flow positive from about month 3; cash never falls below ~139,000 |

Runway months is also a row in the model (cash divided by the month's burn; null when net cash flow is not negative).

## Limits

- Every revenue-side number, the fixed costs, opening cash and churn are assumptions.
- The measured inputs come from one campaign (19 Django 4.2 CVEs) and the E1 backtest; they are not a distribution. Backtest numbers (`evals/results.json`: v2 $0.133 per case, 0.97 min per case, 27 cases, 14 cost-estimated) are not used here because the campaign ledger is the current pipeline.
- The model has no taxes, no payment terms, no sales cost, no support cost beyond the escalation term, and no capacity limit on a single machine.
