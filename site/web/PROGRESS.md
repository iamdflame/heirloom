# Site progress

## v2 "Proof instrument" (B8a, 2026-10-12, session 683e0760)

Spec: `~/brief/FRONTEND-BRIEF-v2.md`. **Live: https://heirloom-proof.vercel.app** (Vercel project `heirloom`, production; also https://heirloom-six-phi.vercel.app). GitHub Pages (v1 URL) keeps building from main with `VITE_BASE=/heirloom/`.

### Done (beats 1–6)
- **Vercel:** `vercel link --project heirloom`; `vercel.json` (framework vite, `npm run build`, output `dist`, immutable `/assets`, a `/heirloom/*` rewrite for old links; `dist/404.html` is served for unknown paths, checked: `/HL-nope` → 404 with the "Not in the register" page). Vite `base` comes from `VITE_BASE` (default `/`). Deploy: `vercel pull --yes --environment=production && vercel build --prod && vercel deploy --prebuilt --prod`. `heirloom-proof.vercel.app` was first set with `vercel alias set`, which put it behind Vercel Authentication (302); `vercel domains add heirloom-proof.vercel.app heirloom` made it a production domain (200). After each deploy, re-run the `alias set` (or it follows production automatically as a project domain; check with curl).
- **Design system:** dark tokens only (ink `#08090A/#0F1112/#16191B`, rule, bone, muted, brass/hi/deep, the five verdict pairs from the brief), v1 Tailwind names (`paper`, `ink`, `surface`, `ledger`…) remapped so untouched sections still render dark. Fonts: Instrument Serif 400 normal/italic, Geist 400–600, Geist Mono 400–500, subset by `scripts/subset-fonts.sh` (66 kB total). `src/lib/guilloche.ts` (rosettes, wave bands, the H) + `scripts/guilloche.mjs` → `public/guilloche/{rosette,band}.svg`, `public/hallmark.svg`, `public/favicon.svg` (+ `favicon-32.png`). `Hallmark.tsx` (ring draws itself in the nav), `Guilloche.tsx` (`Rosette`, `WaveBand`), `Photo.tsx` (AVIF/WebP srcset from `src/data/photos.json`). `Seal.tsx` now renders the hallmark (og/404 still import it).
- **Motion (`src/components/fx.tsx`):** `WordReveal` and `CountUp` are CSS-driven (`.word`, `.count` with `@property --n`), so the prerendered hero animates before JS and the client resumes with negative delays (`useSincePaint`); `CountUp` without `start` waits for in-view. `Magnetic` (spring, fine pointers only), `Reveal` (whileInView), `useSpotlight(selector)` (+ `.spotlight` class), `useSmoothScroll` (Lenis, lazy chunk, off under reduced motion; the receipt sheet has `data-lenis-prevent`).
- **Photography:** six Unsplash-License photos, graded dark/brass by `scripts/photos.mjs` to 640/1280/1920 AVIF+WebP (largest 137 kB). Ids, photographers, URLs in `ASSETS.md`; credits in the footer.
- **Beat 1 hero** (`Hero.tsx`, `HeroVisual.tsx`): word reveal "Old software, *kept honest.*", sub, count-ups 13 candidate backports (`summary.prs`) · 0 false "not affected" (`backtest.v2.false_not_affected`, labelled "on the 27-case backtest") · 1 question (`summary.questions`), magnetic CTAs (#watch, #finding). `HeroVisual` = the gears photo + a turning guilloché rosette + hallmark, mouse parallax and scroll dolly. **This is the slot for B8-3D's `src/three/HeroScene.tsx` + `hero-poster*`.**
- **Beat 2** (`Examines.tsx`): full-bleed movement photo with parallax, "Django stopped patching 4.2 in April. *Debian and Ubuntu still ship it.*", three engraved version plates from `site.lines`.
- **Beat 3** (`Campaign.tsx`, steps in `src/lib/campaign.ts`): pinned (`N×42+100vh`) from 1024 px: a bezel dial (Apr 7 → Oct 9, turns with scroll) under a 3D-tilted 19×3 tile register; tiles stamp in per batch; captions from data (batches with their candidate-backport counts, "CVE-2026-15307 asks the owner one question" with a pulsing ?, Ubuntu's patch, "Django amends it" with the brass connector drawing 87890 → 15307 "stacked on our own backport · PR #21 on #20", "CVE-2026-84429 reuses the answer without asking", the Oct 9 follow-up); live counters (advisories, candidate backports, evidence issues, question). Below 1024 px or under reduced motion: a vertical story with a mini register per step. Screen readers get an sr-only ordered list of the steps.
- **Beat 4** (`Finding.tsx`): Oct 1 / Oct 6 plates fly in and lock around a shimmering "5 days" band (computed), a terminal that types the calibrated run (U⁻ FAIL ×3, U⁺ PASS ×3, noble FAIL ×3; sr-only full text), the verbatim claim, the calibration sentence, the scope note (no exploitability claim), raw logs / receipt / draft links.
- **Beat 5** (`Register.tsx`): same logic (roving tabindex, filter, replay, goto, connector), restyled as an engraved certificate (wave band header, brass header, hairlines, brass accession numbers, sticky header) with a cursor-following brass spotlight on rows.
- **Beat 6** (`Receipt.tsx`, `ui/sheet.tsx`): slides in with a 3D tilt; guilloché band, "Certificate of proof" with a hallmark shimmer; the calibration triangle is an instrument (connectors draw in, FAIL lights blink red ×3, PASS lights go green); gates as an engraved checklist. Focus trap, Esc, focus return and `#HL-4.2-…` deep links unchanged.
- **Hidden for B8b:** Method, Query, Results (Backtest, Limits, Economics), Verify are not rendered (files untouched); nav lists only Watch it work / Finding / Register.

### QA (`PORT=4175 node scripts/qa.mjs v2c2`; port 4173 is held by a stale v1 preview)
qa.mjs now: dark only; full-page shots walk the page first so in-view reveals have played; hero after load; campaign start/middle/end; a 10 s scroll video (`scroll-10s.webm`), reviewed with `node scripts/frames.mjs <webm> <png> 12` (no ffmpeg on the box). Results: axe 0 serious/critical (6 runs), console 0, keyboard PASS, deep link #HL-4.2-018 → CVE-2026-87890, anchors 6/6, Lighthouse mobile 97 / 100 / 100 / 100, first-load JS 110.5 kB gz (budget 200), fonts 66 kB.
Defects found and fixed: full-page shots showed empty sections (reveals never fired) → pre-scroll; no robots.txt (SEO 92) → added; receipt lights still dim at 500 ms → start at 350 ms; the rosette rendered as one zigzag (copies phase-shifted by 2/lobes of a period) → shifted across a full period, now a real moiré.

Cycle 3 (`v2c3`, after 768 fixes: version plates 2-up below lg with `overflow-wrap:anywhere`, a `md` tile size for the story ≥640 px, a lighter hero overlay below lg, receipt PR/issue links as buttons): axe 0, console 0, keyboard PASS, Lighthouse mobile 96 / 100 / 100 / 100. **LCP is borderline** (2.4–2.6 s simulated over three runs; the LCP element is the hero photo). Only the display serif is preloaded now (the italic and Geist preloads competed with the photo). When the 3D lands, keep the poster/photo as the LCP element and the WebGL chunk out of the critical path.

### Next: B8b (beats 7–12, then merge site-3d)
1. Restyle and re-enable, in `App.tsx` order after `<Register>`: **7 The movement** (`Method.tsx` → SVG gear train, the rule in giant serif), **8 The question** (`Query.tsx` → message thread, P001 stamp, flip cards), **9 Proof in numbers** (from `Results.tsx` Backtest: 0 vs 1 split card, 13, 19, $0.22/CVE from `economics.inputs`), **10 Economics** (Base/Bear/Bull cards), **11 Evidence locker** (`Verify.tsx` over `archive`/`dial` photo, PR and issue cards, copy commands), **12 Finale** (back to the movement + footer colophon; the footer already has photo credits). Add each to `src/lib/sections.ts` as it lands (qa checks every `#` anchor).
2. After merging `site-3d`: mount `HeroScene` lazily inside `HeroVisual.tsx` (keep the photo as the fallback, swap to `hero-poster` on mobile / reduced motion / no WebGL) and in the finale. Keep first-load JS ≤200 kB gz.
3. Re-render the OG card in the v2 style (`og.tsx`, `npm run og`; base is `/` now) and update `index.html` image alt.
4. Unused now, delete or reuse: `Section.tsx` `Asterism`, `Code.tsx` parts, `Seal.tsx` wrapper.
5. Redeploy with the three vercel commands above, then curl https://heirloom-proof.vercel.app until 200.

---

## v1 (B7a / B7b)

Spec: `~/brief/FRONTEND-BRIEF.md`. Live URL: https://iamdflame.github.io/heirloom/

## Milestones
- [x] M1 Toolchain: Node 22.23 (NodeSource), Playwright Chromium (headless shell 156) + deps, `heirloom export --out site/data` refreshed (summary now 13 AFFECTED / 1 NA / 5 UNPROVEN, matching the README).
- [x] M2 Scaffold (Vite 8 + React 18 + TS strict + Tailwind 3 + Radix/shadcn-style ui), tokens light/dark, fonts, seal/favicon, nav/hero/footer skeleton, `.github/workflows/pages.yml`, Pages enabled (build_type=workflow)
- [x] M3 `scripts/build-data.mjs` → `public/site.json` (25 kB) + `public/receipts/<CVE>.json` (lazy receipt detail) + `src/data/types.ts`; `src/data/counts.test.ts` (7 tests) parses the README first screen and checks every count; `scripts/check-links.mjs` checks all 20 PR/issue URLs via `gh api` (20/20)
- [x] M4 Hero/abstract (numbers from site.json), Fig. 1 register (ledger sheet, sticky accession column with the double red margin rule, row totals, filter with live counts, roving tabindex with arrows/Home/End/Ctrl+Home/PageUp/Down), replay scrubber (range input, play over 8 stops at 1 s, aria-live status, ink-in with motion `m` + LazyMotion, default end state), the 87890→15307 connector (SVG in the right margin at ≥1280 px; inline text below that) and the `query #6` marker; mobile cards (<768 px); lazy Receipt sheet (right ≥768, bottom below) with Condition / Examination (calibration triangle, failing ids, gates, probe origin; Tabs per line) / Treatment / Evidence (copy buttons, reproduce command), `#HL-4.2-007` deep links, focus return to the cell
- [x] M5 QA cycle 1 (+ a verification run c2) — see below

## Decisions
- Toolchain resolved to Vite 8 / @vitejs/plugin-react 6 / TypeScript 7 / vitest 5 (current majors); Tailwind pinned to v3 and React to 18 per brief.
- Fonts (≤100 kB): the fontsource Newsreader latin opsz file is 132 kB alone, so `scripts/subset-fonts.sh` subsets it and instances wght to 400–500, keeping the full opsz axis (6–72): 81 kB. Plex Mono 400/500 are subset to ASCII plus the few marks used (7 kB each). Total ≈ 96 kB. Files live in `public/fonts/` so the display font can be preloaded at a stable URL.
- Seal: generated by `scripts/seal.mjs` (10-lobe blob with low-frequency wobble, ring + slab-serif H cut out with a mask, one flat colour `--seal`); `scripts/favicon.mjs` renders `favicon-32.png` with Playwright.
- Lucide has no GitHub icon any more; `GithubMark.tsx` inlines the mark.
- Theme: `data-theme` on <html> (light|dark) overrides `prefers-color-scheme`; stored in localStorage, applied by an inline head script before paint.
- Advisory titles/dates/URLs are not in the export (they come from Django's `security.txt`). `scripts/sidecar.py` (run locally with uv; uses `heirloom.sources.django_security`, no Python changes) writes `site/data/advisories.json` and `site/data/artifacts.json` (run dirs on the `artifacts` branch, pinned to its sha, for raw-log links). Both are committed; CI only reads them.
- Cells use the matrix verdicts (`site/data/matrix.json`), which agree with the campaign: AFFECTED on 4.2.30 with a PR = FIX READY (13); elsewhere AFFECTED. `no_calibrated_probe` = NO PROBE. Chip totals: FIX READY 13, AFFECTED 21, NOT AFFECTED 7, UNPROVEN 4, NO PROBE 12 (= 57 cells).
- Accession order: advisory date, then CVE year and number (numeric), so CVE-2026-5766 is HL–4.2–001.
- Replay stops come from data (EOL constant, advisory batches, CVE-2026-15830's follow-up on 10-09) plus the brief's 2026-10-01 "Ubuntu ships its CVE-2026-15307 patch". The noble changelog in `evals/distro_lines.json` is dated 2026-09-28; 10-01 is the brief's date, kept as the one editorial constant in `build-data.mjs`.
- Treatment run id: campaign_evidence's run (the run that did the work) beats the event's run id (a later resume that only published). Raw logs: that run's dir on `artifacts`, else the CVE's latest.
- Porter model names are not in the export, so receipts say "written by the independent porter" without a model (rule 8: hide what's missing).
- `site.json`/`receipts/` are build outputs (git-ignored); `npm run build` = build-data → tsc → vitest → vite build, so CI fails if counts drift from the README.
- Filter semantics: single-select; shows rows that have at least one cell with the chosen verdict and outlines the matching chips. Counts are live: they follow the replay position.
- Row total wording: "n of 3 lines affected", plus "· k undecided" when some cells are UNPROVEN/NO PROBE; "none of 3 decided" when no cell is decided (so a NO PROBE row never reads as "0 affected").
- Rows not yet arrived during the replay stay in place as empty ledger lines (accession only), so the sheet doesn't jump.
- Receipt: Examination uses Tabs (one per line); the clicked cell's line is preselected; a deep link opens on Django 4.2.30. Receipt JSON is fetched from `receipts/<CVE>.json` on open and cached.
- Data is bundled (`src/data/site.json`, ~6 kB gz) so the register renders without a fetch; `public/site.json` is the same file, published.

## QA cycle 1 (2026-10-12, `node scripts/qa.mjs c1`, 16 screenshots read)
Script results: axe 0 serious/critical on 10 runs (8 page views + receipt desktop/mobile); console 0 errors/warnings; keyboard flow PASS (Tab into register → ArrowRight/ArrowDown/End/Home → Enter opens #HL-4.2-002 → Esc closes → focus back on the same cell); deep link `#HL-4.2-018` opens CVE-2026-87890; replay middle reads "Aug 4 2026 · 15 of 19 advisories"; Lighthouse mobile 96 / 100 / 100 / 100; first-load JS 103.6 kB gz (budget 150), fonts 93.7 kB (budget 100). A pre-cycle run (c0) found axe `definition-list` (serious) in the receipt Evidence list (a copy button sat directly in the `<dl>` row), fixed before c1.

Defects seen in the PNGs:
1. **390 px: horizontal overflow.** The page renders 423 px wide: register cards grow to fit unbreakable mono identifiers in titles (`django.http.HttpRequest.get_signed_cookie`). (page-390x844-*)
2. **768 px: replay tick labels collide** ("Django 4.2 end of life" runs into "3 advisories"; "Ubuntu ships its…" into "4 advisories"). (page-768x1024-*)
3. **768 px: table clips** the Ubuntu column and the total column off the right edge (scrolls horizontally; sticky accession works, but half the row is hidden with no cue).
4. **1440/1920: "Lines affected" column too narrow**: "2 of 3 lines affected" wraps onto 3 lines, so rows are taller than the content needs; header "LINES AFFECTED" wraps too.
5. Lighthouse `label-content-name-mismatch`: filter toggles had an aria-label ("Fix ready, 13 cells") that differs from the visible text ("✓ FIX READY 13").
6. Receipt (390 px) Condition list: chips wrap under long line labels at different indents. Fixed between c0 and c1 (grid: label left, chip right); recheck in cycle 2.
7. Minor: the hero meta line breaks after "built" at 1440 ("built / during neatHack"), and the table leaves ~14rem of empty margin at 1440–1920 when the connector isn't the focus. Left as is: the margin holds the connector.

Fixes after cycle 1 (verified by re-running as `qa/c2` and reading the PNGs):
- (1) cards: `min-w-0` + `overflow-wrap:anywhere` on titles → the 390 px page is 390 px wide (page-390x844-light is 390×8673).
- (2) replay ticks: below 1024 px only the dates show; labels from `lg` up → no collisions at 768.
- (3) table: `table-fixed` + `<colgroup>` widths; the total column moves into the advisory cell below 1024 px → all three line columns fit at 768 with no horizontal scroll.
- (4) total column 11rem, each part nowrap ("2 of 3 lines affected" / "1 undecided") → one or two lines at 1440/1920. Long identifiers in titles get `<wbr>` after `.` and `_` instead of breaking mid-word.
- (5) filter toggles have no aria-label (visible text is the name); mobile card buttons use visible text + sr-only context. Lighthouse `label-content-name-mismatch` is gone.
- (6) receipt Condition rows on 390 px: label left, chip right, version below → checked in receipt-mobile.png.

## QA cycle 2 results (`qa/c2`)
axe 0 serious/critical (10 runs); console 0; keyboard PASS; Lighthouse mobile 96 / 100 / 100 / 100; first-load JS 103.7 kB gz; fonts 93.7 kB; lazy chunks: Receipt 4.9 kB gz + sheet (Radix dialog/tabs) 10.6 kB gz; site.json 24.7 kB.

## Remaining defects (for B7b)
- Lighthouse performance is 96, not 100: `render-blocking-insight` (~300 ms, the CSS file) and `max-potential-fid` 200 ms. Options: inline critical CSS, or split the 404 entry so `src-*.js` (react-dom) isn't shared as a separate preload.
- 390 px receipt: the sticky nav may sit above the sheet's dim overlay (in receipt-mobile.png the nav reads lighter than the dimmed page). Check the stacking (header z-40 vs overlay z-50) in a fresh screenshot.
- 768–1023 px: the advisory column is narrow (~13 rem), so titles take 3–5 lines; acceptable but dense.
- The replay range shows the 2 px focus outline around the whole input after keyboard use (correct, but heavy); consider outlining only the thumb.
- No OG image yet (`og.html` + `og.png`), so the OG/Twitter meta tags are not added yet.
- The porter model is not shown in receipts (not in the export).

## B7b (2026-10-12, session 1c8b3479)

### M1: design review items 1–4
- **Hero, two columns from 1024 px.** Right: the "Treatment record" index card (`CatalogueCard.tsx`): ledger paper, blue field rules, a red header rule, the seal pressed into the top-right corner (overhanging it, rotated). Fields in mono small caps, values in Newsreader, all from site.json (`object`, `eol` + `eol_source`, distro `version`s, summary counts, `query.issue`). Below the fields: the mini register (19 × 3 chips, accession order, line initials DJ/DE/UB as column heads with `<abbr>`, row heads 001–019), a per-verdict key with cell counts, and the caption "The whole register at a glance …". On mobile the card follows the abstract; fields stack label over value below 640 px. Sub paragraph measure 44ch.
- **Mini register squares** are buttons (20 px, 4 px spacing = 24 px pitch, so axe `target-size` holds) with aria-labels ("HL–4.2–001, CVE-2026-5766 on Django 4.2.30: Fix ready. Go to the row in Fig. 1"). One tab stop with roving tabindex and arrows/Home/End, like Fig. 1. Activating one dispatches `register:goto` (`lib/goto.ts`): the register resets the filter and the replay to the end, scrolls the row to the centre, focuses the same line's cell (desktop) or card button (mobile), and outlines the row until the next click elsewhere.
- **Replay timeline in proportion to real time.** The range input's value is now days since 2026-04-07 (0–185); arrows/PageUp/PageDown/Home/End jump stop to stop, and a drag snaps to the nearest stop. Ticks use the thumb-corrected position `calc(9px + (100% − 18px) × d/185)`. The track leaves a right gutter (4 rem md, 16 rem lg) for the October cluster: Oct 1 (Ubuntu's patch) is right-aligned to the left of its tick, Oct 6 (4 advisories, including Django's amendment CVE-2026-87890) is left-aligned to the right of its tick on a second row with leaders, and Oct 9 is on the first row in the gutter. A quiet band spans Oct 1 → Oct 6 on the track, labelled "5 days" (computed). Below lg only dates show.
- **Sticky register header** from 1024 px: the sheet stops being a horizontal scroll container (`lg:overflow-visible`; the table fits from md anyway) and `thead th` is sticky at `top: 3.5rem` under the nav with its own bottom rule. Line columns are 10 rem at xl so the Ubuntu header wraps less.
- **Receipt:** failing test ids use `<Breakable>` (`<wbr>` after `.` and `_`, shared with titles). The Treatment link is a prominent text button with an icon at the top of Treatment ("Open the candidate backport, PR #13" / "Open the evidence, issue #3").
- **Stacking check (B7a defect):** at 390 px with the receipt open, `elementFromPoint(100, 28)` is the overlay (z-50), so the overlay does cover the nav. The lighter-looking nav came from the sheet's 40 px shadow darkening the band just above the bottom sheet. The bottom sheet now has a small shadow (`0 −2px 12px`).
- Fixed a B7a data bug: `economics.pages` was empty (the regex expected `[Base](…)`, but business-plan.md uses `- Base: <…>`). build-data now fails unless it finds all three cfo.ai links.

### M2: sections 5–12
- **Data added to site.json by build-data** (each fails the build if missing): `finding` (the stacked CVE on noble: outcomes U⁻/U⁺/L from the matrix cell, fix commit, probe origin, matrix-logs URL, the date of the noble matrix part, the claim sentence read from the README's "Ubuntu finding", the draft report path, the reason the amended CVE stays UNPROVEN on noble); `method` (example PR #13, an evidence issue, and pipeline source files, each checked to exist); `limits` (restart count read from hackathon.md's "restarted the campaign workers four times"; recovery CVE/run from `evals/recovery_b4.json`); `economics.results` (the plan's results table) and `economics.plan`; `detection_check` (`evals/detections_flag_check.json`); `backtest.v*.false_not_affected_cves` (from results.json runs, cross-checked against the summary count); `files` (detections, results, EVIDENCE.md, docs/entire).
- **Fig. 2, The finding** (`Finding.tsx`): three dated steps (Oct 1 Ubuntu's patch, with the tested package version; Oct 6 Django's amendment, linked to the advisory; Oct 11 21:52Z the probe on noble, FAIL ×3 plus its chip), the verbatim claim in display type (curly apostrophe only), the hand-written/calibration sentence (FAIL ×3 before `dd0558d1`, linked to django/django, PASS ×3 after), a plain scope note (one package version, no exploitability claim, no other Ubuntu release; 15307 stays UNPROVEN on noble, with the reason), and links to the raw logs, the receipt (#HL-4.2-018) and the unfiled draft.
- **Method**: the rule in display type, then 01–05, each with one sentence and an "Artifact" line (fix commit + locate.py; probe sha + probe.py; calibration triangle + calibrate.py; "13 of 13 PRs FAIL ×3 → PASS ×3" + campaign_evidence.json + verify.py; PR #13 · evidence #3 · question #6 · decide.py).
- **The conservator's query**: a vertical timeline, 01–07, from `site.query` plus the connector (asked 21:20Z by 15307, 84429 waits, the answer `adopt-upstream-tests`, P001 stored 00:00Z, #20 applies, #19 reuses without asking, #21 stacked on #20), each with its issue, PR or trace id.
- **Table 2, Backtest**: v1 against v2, with the "False not affected" column tinted and its numbers at 2.25 rem (1, then **0** in medium). Below md the table is transposed (metric × pipeline) so that column never scrolls off. Two sentences: why the error is dangerous, and the neatlogs `not_affected_without_calibration` detection, which fired on the replayed v1 claim (CVE-2026-1285, run `…-v1sample`). That is its only hit, so it never fired on the campaign (both facts from the JSON).
- **Stated limits**: the seven items, with the restart count and the recovery run from data.
- **Economics**: measured (campaign $ and minutes, plus the "measured" rows of the inputs table) against a "Hypothesis" table (Base/Bear/Bull assumptions) and the modelled runway per scenario (labelled hypothesis). Links to the three cfo.ai pages and business-plan.md.
- **Verify it yourself**: all 13 PRs (number · CVE · title · line · FAIL×3 → PASS×3), all 6 evidence issues (number · CVE · verdict · reason) plus question #6, the Entire command with a copy button and docs/entire, the neatlogs detections with hits and JSON links, endoflife.date, the repository, EVIDENCE.md.
- **Colophon**: seal, tagline, record/object, type, data provenance, built with, page stack + source link, MIT + repo.
- Sections after a `* * *` drop their own rule. `Nb` keeps CVE ids and versions unbroken in prose. `qa.mjs` now checks that every `a[href^="#"]` resolves to an element id or a register row.

### M3: OG card and meta
- `og.html` + `src/og.tsx` (a third Vite entry, `noindex`): 1200×630 card on the page paper with the seal, "Heirloom", the record line, the H1, "19 advisories × 3 release lines, each verdict with a receipt", counts (13 fix ready · 1 not affected · 5 unproven · 1 question), the URL, and on a ledger panel the 19 × 3 mini register (DJ/DE/UB, rows 001–019) with a chip key. All values from site.json.
- `npm run og` (`scripts/og.mjs`) starts `vite preview` on :4174 and screenshots it with Playwright to `public/og.png` (82 kB). It is committed; CI only copies it.
- `index.html`: og:type/site_name/url/title/description/image (+ width, height, alt), twitter:card `summary_large_image` + title/description/image/alt. Canonical and description were already there. Checked in the built `dist/index.html` (all 16 tags present, absolute image URL).
- Two new vitest checks: the three meta descriptions state site.json's advisory count (and the EOL date where one is given), and `public/og.png` is a 1200×630 PNG.

## Next: B7b
1. Sections 5–12 from the brief: The finding (Fig. 2, three dated steps + verbatim claim), Method (5 stages), The conservator's query timeline (`site.query`, already in site.json), Table 2 — Backtest (`site.backtest`, emphasise false NOT AFFECTED 1 vs 0), Stated limits, Economics (`site.economics.inputs` + cfo.ai pages, label hypotheses), Verify it yourself (`site.links`, detections), full colophon. The nav links for those sections currently point at anchors that don't exist yet.
2. OG: `/og.html` view + Playwright render to `public/og.png` (1200×630), then the OG/Twitter meta.
3. Run QA cycles 3+ (`npm run build && node scripts/qa.mjs c3`), read every PNG, fix, redeploy.
4. Optional: chip contrast check script (all 10 chip pairs; AA verified so far only by axe on rendered pages).
