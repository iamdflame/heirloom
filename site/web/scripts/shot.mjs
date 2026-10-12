// Quick look during development: node scripts/shot.mjs <out.png> [width] [height] [light|dark] [scrollTo selector|y] [full]
// Serves nothing itself: expects `npm run preview` (or qa.mjs's server) on :4173.
import { chromium } from 'playwright';

const [out, w = '1440', h = '900', scheme = 'light', scroll = '', full = ''] = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, colorScheme: scheme, deviceScaleFactor: 1 });
const p = await ctx.newPage();
p.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log('console:', m.type(), m.text()));
await p.goto('http://localhost:4173/' + (process.env.HASH ?? ''), { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
if (scroll) {
  if (/^\d+$/.test(scroll)) await p.evaluate((y) => window.scrollTo(0, y), +scroll);
  else await p.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'start', behavior: 'instant' }), scroll);
  await p.waitForTimeout(300);
}
await p.screenshot({ path: out, fullPage: full === 'full' });
await browser.close();
