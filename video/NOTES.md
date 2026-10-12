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

## Pass 3: real captures in (V-CAP clips replace the placeholders)

| Moment | What I saw | Fix |
|---|---|---|
| S01 / S04 b-roll | BR01 (skeleton balance wheel) and BR02 (gilt train) are superb macro plates; the title fought the engraved "SWISS MADE" lettering behind it. | Left gradient darkened to 0.94 → 0.82 at 38%. BR02 sits behind the hallmark and dims to 45% as the wordmark lands (R3D01 takes over if V-CAP delivers it). |
| S06 SH03 | At 1× the dial only reached Jul 7 before the cut to the PR list. | 1.4× so the campaign reaches Oct before the cut; the second SH03 segment resumes at 10.4 s (or SH10, the evidence locker, when present). |
| S06 GH04 | The 5 s clip would freeze for 4 s in a 9 s slot. | Played at 0.6×; the "Note: Stacked on #20" paragraph stays in view under the lower third. |
| S07 GH02 | The answer comment only appears at the end of the 9 s scroll. | 1.6× from 1 s: question, then `/heirloom answer adopt-upstream-tests`, inside the 4.8 s slot. |
| S08 GH01 / GH05 | PR #13's claims table is in the second half of the clip; the `Entire-Checkpoint:` trailer is tiny at window scale. | GH01 from 5.5 s at 1.3×; GH05 gets a deliberate 32% push toward the trailer (origin 10% 56%). |
| S09 CFO01 | The first take had a sign-up modal and a Cloudflare box over the right side; the light page also turned grey in the vignette corners. | 1.3× crop anchored top-left (the "Model cost per CVE USD 0.217" row stays in frame, matching the $0.22 count-up); vignette 0.12 on this light page. V-CAP's re-take has no modal. |
| Pipeline | A clip being rewritten by V-CAP broke a still render (hard links share the inode). | `link-captures.mjs` now takes snapshot copies, probes them, and skips files still being written. |
| Speed | 5.4 fps with V-CAP's Chrome on the same 8 cores; the rotating 1500 px rosette was re-rasterised every frame. | The ground watermark is a pre-engraved SVG image (`scripts/make-rosette.mjs`); captions render as a transparent layer overlaid by ffmpeg; the mix is an audio-only render muxed onto the master. |

## Pass 4: the encoded scenes (frames pulled from `~/video-out/scenes/*.mp4`)

| Scene | What I saw | Fix |
|---|---|---|
| S01 | Encodes as H.264 High, yuv420p, BT.709, 60 fps, 540 frames. Black → tick → date → "end of life" in order; no dead frames after 0.4 s. | Kept. |
| S02 / S03 | Plates → cascade → counter; date lock → the real noble log (FAIL ×3) → AFFECTED → the claim. All legible at 1080p. | Kept. |
| S05 | Triangle and gates read; the SH05 receipt panel text is small inside the window. | A slow 12% push toward the receipt (origin 88% 42%). |
| S07 | SH07 → issue #6 → P001 seal → PR #19 with its "Per precedent P001" note visible above the lower third. | Kept (re-rendered with V-CAP's SH07 re-take). |
| S08 | The Heirloom half of the backtest sat empty for 4 s waiting for its number. | Labels and captions arrive with the split; a dim dot holds the place; the "0" lands on "Heirloom: zero times". |
| S08 render | Chrome crashed at frame 7470 during the first batch and the render hung (memory/CPU contention with V-CAP's SwiftShader capture). A still at that frame renders fine. | Re-rendered S08 alone at concurrency 6: clean in 150 s. `CONC` env sets render concurrency. |
| S04 / S10 | SH01 (hero) and SH11 (finale) are 3D captures that V-CAP renders at ~1–3 s per frame. | S04 holds the logo reveal if SH01 is under 3 s; S10 uses BR03 (slowed) if SH11 is missing. |

## Pass 5: re-timed to the owner's VO (12:13)

The owner's ElevenLabs VO (S01–S10, 146.95 s of scenes) and `music.mp3` arrived in `public/audio/`. `retime.mjs` set each scene to 0.4 s + VO + 0.6 s (S10: + 4 s), so the film is now 2:26.95. Inner beats scale with each scene.

| Check | Finding | Fix |
|---|---|---|
| S08 at 0.8× | The 6 s neatlogs slot pushed GH05 and the `entire` terminal to under 1 s. | When a scene runs short, the backtest and PR #13 give way (8.6 s / 2.2 s), the slot stays 6.00 s, GH05 1.3 s, the terminal gets the rest. |
| S10 at 0.69× | The end-card guard (`frames − 9 s`) would have put the card at 1.4 s, cutting the finale. | Guard is now `frames − 5 s`: finale, then the card from 3.7 s, holding through the 4 s tail. |
| S04 / S10 fallbacks | SH01 arrived (8 s) just before the final render; SH11 did not. | S04 uses SH01; S10 uses the site's finale frame (`public/site-finale.jpg`, from `site/web/public/finale-poster.webp`) with an eased push to the H medallion instead of BR03 (which shows a watch brand on the rotor). |
| Captions | 40 cues; burned in by overlaying 40 transparent PNG cues with 0.13 s alpha fades on the silent master (one x264 pass instead of a second full render). | — |
| Mix | VO at the scene start + 0.4 s; music −18 dB, ducked to −24 dB under each VO line with 0.3 s ramps, faded over the last 2 s. | Audio-only render muxed onto the silent master's picture (no re-encode of video). |
