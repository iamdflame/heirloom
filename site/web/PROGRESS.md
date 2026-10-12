# Site progress (B7a / B7b)

Spec: `~/brief/FRONTEND-BRIEF.md`. Live URL: https://iamdflame.github.io/heirloom/

## Milestones
- [x] M1 Toolchain: Node 22.23 (NodeSource), Playwright Chromium (headless shell 156) + deps, `heirloom export --out site/data` refreshed (summary now 13 AFFECTED / 1 NA / 5 UNPROVEN, matching the README).
- [ ] M2 Scaffold + Pages skeleton live
- [ ] M3 `scripts/build-data.mjs` → `public/site.json` + `src/data/types.ts`, vitest counts = README
- [ ] M4 Hero, Fig. 1 register, replay, receipt
- [ ] M5 QA cycle 1

## Decisions
- Toolchain resolved to Vite 8 / @vitejs/plugin-react 6 / TypeScript 7 / vitest 5 (current majors); Tailwind pinned to v3 and React to 18 per brief.
