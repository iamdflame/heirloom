# Evidence map (neatHack evidence list → links)

Every number here comes from a committed file or a public GitHub object linked beside it.
The README's numbers come from `evals/render_readme.py`.

## 1. A before-and-after run showing the agent improved

- **Backtest v1 (naive cherry-pick + LLM) vs v2 (Heirloom with calibration)**, same 27 cases:
  [README table](README.md#backtest-does-calibration-help-resultsjson), source
  [evals/results.json](evals/results.json). v1 has 1 false NOT_AFFECTED (a vulnerable line
  declared safe) and v2 has 0. v2 says UNPROVEN on 9 cases instead of guessing.
- **The same check as a neatlogs detection:** a v1-style "not affected without calibration" claim
  raised `not_affected_without_calibration` in neatlogs (0 → 1 hit after 90 s;
  [evals/detections_flag_check.json](evals/detections_flag_check.json)). The v2 campaign has
  0 hits on that detection ([evals/detections.json](evals/detections.json)).
- **One CVE that improved between runs:** CVE-2026-87890 was UNPROVEN (NO_REACH) in run
  `20261012T000126Z-90e8` (evidence issue [#10](https://github.com/iamdflame/heirloom/issues/10)).
  The reach retry in run `20261012T002657Z-0879` made it AFFECTED and produced
  [PR #21](https://github.com/iamdflame/django/pull/21). #10 was updated to say so and closed.
  [Ledger](https://github.com/iamdflame/heirloom/blob/e74cb04277e3454e798701912b4b73673d59b950/runs/20261012T002657Z-0879/CVE-2026-87890-4.2/ledger.json).
- **Demo video (2:27):** <https://youtu.be/L4Zw555RuMs> shows the naive-vs-Heirloom backtest (1 false NOT_AFFECTED vs 0 over 27 cases) in the proof scene.

## 2. neatlogs traces or screenshots

- The traces live in the owner's **private** neatlogs org, so judges can't open them. Every PR and
  evidence issue prints its trace id and span id next to each claim, e.g. PR #21: trace
  `a64e212753c43adb4c39cc7c120a56b0`. The README lists the recovery traces; question #6's
  asking trace is `2976b1584b28aa7100fdee51b7eeed07`.
- Detections and their hit counts (neatlogs vs the local ledger mirror):
  [evals/detections.json](evals/detections.json),
  [evals/detections_flag_check.json](evals/detections_flag_check.json). Ingestion findings:
  [docs/spikes.md](docs/spikes.md), [evals/neatlogs_ingestion.json](evals/neatlogs_ingestion.json).
- **Screenshots: none are saved in this repo yet.** _Owner: add neatlogs screenshots to `docs/`._

## 3. Entire checkpoints / entire-graph output

- **Build sessions:** 45+ of the commits on `main` carry an `Entire-Checkpoint:` trailer, and the
  checkpoint refs are pushed to `refs/entire/checkpoints/*` on this repo. To list them:
  `git log --format='%h %(trailers:key=Entire-Checkpoint,valueonly)'`.
- **Runtime sessions:** each backport commit on the fork carries the checkpoint of the headless
  `claude -p` session that adapted it, with refs on
  [iamdflame/django](https://github.com/iamdflame/django). Example: PR #21 →
  `01M4PR917WADTM34J6J3AY17Z9` →
  [ref commit](https://github.com/iamdflame/django/commit/29b817bf96752cd61194537ecc830b69c7fedb61).
- **Entire's own outputs** are in [docs/entire/](docs/entire/):
  - `entire review`: [review-main.txt](docs/entire/review-main.txt). Medium finding #2 is fixed;
    #1 is listed as a known limit in hackathon.md.
  - `entire recap`: [recap-week.txt](docs/entire/recap-week.txt). It reports 0 sessions because it
    is server-analysed.
  - two `entire checkpoint explain` outputs: one for a runtime checkpoint (PR #13) and one for a
    build checkpoint (B5).

## 4. cfo.ai business plan (pricing, costs, revenue, runway)

- Read-only Pages: [Base](https://app.cfo.ai/s/25vRDQClPxqPWB5g) ·
  [Bear](https://app.cfo.ai/s/iY4Wmzs_IFo0SBTz) · [Bull](https://app.cfo.ai/s/ASqxTf1hUwtztmtT).
- [docs/business-plan.md](docs/business-plan.md) lists every input with its source. The measured
  inputs come from `evals/results_live.json`: model cost per CVE, machine minutes, publish rate and
  escalation rate. Prices and volumes are assumptions, and the doc labels them as such.

## 5. A run showing recovery from a failed action

- [evals/recovery_b4.json](evals/recovery_b4.json): CVE-2026-35192's worker was SIGTERMed
  mid-ADAPT (`SystemExit: 143`) during a harness-fix restart. `campaign --continue` resumed the same
  run `20261011T210815Z-e826` from the ledger. A later `publish.pr` failure, after the push, was
  reconciled into exactly one PR, [#11](https://github.com/iamdflame/django/pull/11). Traces:
  `00000b0f2ae0082898a888d7ec8eea0d` (killed attempt) and `b4459b250cdec7a84bf1023b0275cdf7`
  (resumed run).
- A deliberate fault run on the golden path:
  - SIGKILL during ADAPT, then injected crashes after commit, push and PR. `resume` reconciled each
    one, leaving 1 commit and 1 PR ([#9](https://github.com/iamdflame/django/pull/9)).
  - Source: [evals/results_l0.json](evals/results_l0.json).
- **Demo video (2:27):** <https://youtu.be/L4Zw555RuMs> shows the campaign, the stacked follow-up PR, and the one question asked and answered once (precedent P001).

## 6. Build-in-public links tagged #neatHack

- **Submission post on X** (quote of the official neatlogs launch post, tagging @neatlogs, @EntireHQ and
  @arithecfo): <https://x.com/i_am_dflame/status/2109683012480749807>
- **Demo video (YouTube, 2:27):** <https://youtu.be/L4Zw555RuMs>, produced from [video/](video/) in this repo.
- Earlier #neatHack posts can be added here by the owner.

## 7. A public repo with commits dated during the event

- [iamdflame/heirloom](https://github.com/iamdflame/heirloom) is public and MIT-licensed. Its
  first commit is `a172b2d` on 2026-10-11T00:30:36Z, and `main` has 101+ commits over 2026-10-11
  and 2026-10-12, made across several build sessions (S0–S4, L0, B3, B4, B5, B5b, B6; see
  [hackathon.md](hackathon.md)).
- The fork [iamdflame/django](https://github.com/iamdflame/django) is public too. Its branch
  `stable/4.2.x-heirloom` is the base for PRs #9–#20, and #21 is stacked on #20.
