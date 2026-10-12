// Writes the static guilloché SVGs: public/guilloche/{rosette,band}.svg, public/hallmark.svg and
// public/favicon.svg (+ favicon-32.png via scripts/favicon.mjs). The path maths lives in
// src/lib/guilloche.ts (Node 22 strips its types), so the page draws the same line-work inline.
import { mkdirSync, writeFileSync } from 'node:fs';
import { HALLMARK_H, hallmarkRing, rosette, waveBand } from '../src/lib/guilloche.ts';

const PUB = new URL('../public/', import.meta.url).pathname;
mkdirSync(PUB + 'guilloche', { recursive: true });
const BRASS = '#C8A86A';
const INK = '#08090A';
const paths = (ds, attrs) => ds.map((d) => `<path d="${d}" ${attrs}/>`).join('');

const ros = [
  ...rosette({ r: 46, amp: 3, lobes: 36, copies: 12, steps: 240 }),
  ...rosette({ r: 34, amp: 5, lobes: 24, copies: 10, steps: 240 }),
  ...rosette({ r: 20, amp: 4, lobes: 12, copies: 8, steps: 180 }),
];
writeFileSync(
  PUB + 'guilloche/rosette.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${paths(ros, `fill="none" stroke="${BRASS}" stroke-width="0.12"`)}</svg>\n`,
);
writeFileSync(
  PUB + 'guilloche/band.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 24" preserveAspectRatio="none">${paths(waveBand(), `fill="none" stroke="${BRASS}" stroke-width="0.6"`)}</svg>\n`,
);
const hallmark = (bg, copies, steps) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg ? `<circle cx="50" cy="50" r="50" fill="${INK}"/>` : ''}` +
  `<circle cx="50" cy="50" r="47" fill="none" stroke="${BRASS}" stroke-width="1.6"/>` +
  paths(hallmarkRing(copies, steps), `fill="none" stroke="${BRASS}" stroke-width="0.7"`) +
  `<circle cx="50" cy="50" r="35" fill="none" stroke="${BRASS}" stroke-width="1.2"/>` +
  `<path d="${HALLMARK_H}" fill="${BRASS}"/></svg>\n`;
writeFileSync(PUB + 'hallmark.svg', hallmark(false, 6, 240));
writeFileSync(PUB + 'favicon.svg', hallmark(true, 4, 120));
console.log('guilloche: rosette.svg, band.svg, hallmark.svg, favicon.svg');
