# Heirloom demo film: review notes (V-MO)

Stills are rendered with `node scripts/stills.mjs [outDir] [S03:12.2 …]` (one bundle, key moments in `KEY`), then read frame by frame.
Renders live in `video/out/` and `~/video-out/` and are never committed.

## Pass 1: key moment of every scene (placeholders for captures)

| Scene | What I saw | Fix |
|---|---|---|
| S01 | Title, brass underline and dial over the macro movement photo read well; the serif at 150 px holds the frame. | Kept. The date comes from `site.eol`, the source line from `site.eol_source`. |
| S02 | The third CVE column ran off the right edge (stamps clipped); the date column wrapped (`2026-05-` / `05`); header plates shrank to 0.62 (version text about 18 px). | Dropped the date column (the order is already chronological), 3 columns that fit inside the 5% margins, 30 px ids, 20 px stamps; plates enter at 1.2× and settle at 0.78× (mono ≥ 22 px). |
| S03 | Terminal mono at 20 px (under the 22 px floor); `CVE-2026-` / `15307` broke across lines on the date plate; the AFFECTED chip landed on top of the first test line. | 22 px mono everywhere; ids `nowrap`, plates 640 px; the chip moved to the empty bottom-right corner of the terminal; lifted plates at 0.8× (not 0.6×). |
| S03 claim | The exact sentence from `site.finding.claim`, centred, chip above, the calibration caption below. Strong. | Kept. |
| S04 | Hallmark, wordmark and tagline are clean. | Kept. |
| S05 | The triangle reads: U⁻ FAIL ×3, U⁺ PASS ×3, L FAIL ×3 → AFFECTED. The gate C3 note wrapped (`(same-` / `path)`). | Notes `nowrap`, the list moved to x 900. C4 is honest: on Django 4.2.30 only C1–C3 apply (an AFFECTED verdict), so C4 is shown on the same receipt's Ubuntu 24.04 cell ("NOT AFFECTED · distro_revert mutant caught"), as the data says. |
| S07 | `adopt-upstream-tests` overflowed the seal. | The answer sits under the seal as `/heirloom answer adopt-upstream-tests`. |
| S08 | Backtest split is clear: 1 (red) vs 0 (green), 27 cases each, both from `evals/results.json`. | The Heirloom side now lands on the VO beat "Heirloom: zero times" (7.4 s), the naive side on "A naive pipeline…" (3.4 s). |
| S09 | My sub-line "campaign model spend ÷ advisories" was my own wording, and it was wrong (3.9053 / 19 ≠ 0.217). | Replaced with the data's label: "model cost per advisory (measured)" (`site.economics.inputs`, status `measured`). |
| S10 | End card is clean; the caption sits below it. | Kept. |
| All | The guilloché watermark reads as a faint grey "donut" on flat ink. | Opacity 0.07 → 0.05. |

## Pass 2: motion moments in S01–S05 (the first 45 s), captions on

| Moment | What I saw | Fix |
|---|---|---|
| S01 0.8 s | The dial ticks once over a dark photo; the first caption is up at 0.4 s. Good opening. | Kept. |
| S01 4.6 s | The date lifts and blurs out while "Django 4.2 ·" rises: a clean hand-off, no empty frame. | Kept. |
| S03 3.3 s | The plates lock and the "5 days" band starts to glow on the lock. | Kept. |
| S04 0.35 s (iris) | The brass iris is good, but inside it the fallback rosettes were drawing on as half-finished squiggles. | Fallback rings are now fully engraved and fade in. |
| S05 4.0 s | The kinetic line exits while the caption has already moved on, which is fine. But the caption split "hasn't failed. For each advisory, Heirloom" across a sentence. | New caption chunker: one or two balanced lines of ≤ 42 chars, never across a sentence end, breaks after punctuation preferred (71 fragments → 40 cues). Two-line cues use a rounded pill. |
| S06 lower thirds | The lower third (y 860) collided with the captions (bottom 64 px). | Lower thirds moved to y 742. |
