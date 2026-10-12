// Dev look: node scripts/look.mjs <outdir> <width> <height> <y|#sel>... (expects `npm run preview` on :4173)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [out, w, h, ...stops] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference' });
const p = await ctx.newPage();
p.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log('console:', m.type(), m.text()));
p.on('pageerror', (e) => console.log('pageerror:', String(e)));
await p.goto(`http://localhost:${process.env.PORT ?? 4180}/` + (process.env.HASH ?? ''), { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
let i = 0;
for (const s of stops) {
  if (/^\d+$/.test(s)) await p.evaluate((y) => window.scrollTo(0, y), +s);
  else if (s.startsWith('#')) await p.evaluate((sel) => window.scrollTo(0, document.querySelector(sel).getBoundingClientRect().top + scrollY), s);
  else if (s.startsWith('w')) {
    // w<frac>: a fraction through #watch
    const f = +s.slice(1);
    await p.evaluate((f) => { const el = document.querySelector('#watch'); const top = el.getBoundingClientRect().top + scrollY; window.scrollTo(0, top + f * (el.offsetHeight - innerHeight)); }, f);
  }
  await p.waitForTimeout(+(process.env.WAIT ?? 1600));
  await p.screenshot({ path: `${out}/${String(i++).padStart(2, '0')}-${s.replace(/[#.]/g, '')}.png` });
}
console.log('height', await p.evaluate(() => document.documentElement.scrollHeight));
await browser.close();
