// QA loop (brief §6): screenshots, keyboard flow, axe, console, Lighthouse, budgets.
// Usage: npm run build && node scripts/qa.mjs <cycle>   → qa/<cycle>/ (git-ignored)
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';

const WEB = new URL('..', import.meta.url).pathname;
const cycle = process.argv[2] ?? 'c1';
const OUT = join(WEB, 'qa', cycle);
mkdirSync(OUT, { recursive: true });
const PORT = +(process.env.PORT ?? 4300);
const URL_ = `http://localhost:${PORT}/`;
const report = { cycle, at: new Date().toISOString(), screenshots: [], axe: [], console: [], keyboard: null, lighthouse: null, budgets: null };

// ---------- serve dist ----------
const server = spawn(process.execPath, [`${WEB}node_modules/vite/bin/vite.js`, 'preview', '--port', String(PORT), '--strictPort'], { cwd: WEB, stdio: 'pipe' });
const stop = () => server.kill('SIGTERM');
process.on('exit', stop);
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(URL_);
    if (r.ok) break;
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 250));
}

// SwiftShader WebGL so the lazy 3D hero actually mounts headless
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const VIEWPORTS = [
  [390, 844],
  [768, 1024],
  [1440, 900],
  [1920, 1080],
];

async function page(opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: opts.w ?? 1440, height: opts.h ?? 900 },
    colorScheme: opts.scheme ?? 'dark',
    reducedMotion: opts.reduced ? 'reduce' : 'no-preference',
    deviceScaleFactor: 1,
  });
  const p = await ctx.newPage();
  const tag = `${opts.w ?? 1440}x${opts.h ?? 900}${opts.reduced ? '-reduced' : ''}`;
  p.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') report.console.push({ tag, type: m.type(), text: m.text() });
  });
  p.on('pageerror', (e) => report.console.push({ tag, type: 'pageerror', text: String(e) }));
  await p.goto(URL_ + (opts.hash ?? ''), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  return { p, ctx, tag };
}
// scroll the whole page once so every once-only in-view reveal has fired before a full-page shot
async function warm(p) {
  await p.evaluate(async () => {
    const H = document.documentElement.scrollHeight;
    for (let y = 0; y < H; y += Math.round(innerHeight * 0.6)) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 1600));
  });
}
const scrollToEl = (p, sel, frac = 0) =>
  p.evaluate(
    async ([sel, frac]) => {
      const el = document.querySelector(sel);
      const top = el.getBoundingClientRect().top + scrollY;
      window.scrollTo(0, top + (el.offsetHeight - (frac ? innerHeight : 0)) * frac);
      await new Promise((r) => setTimeout(r, 1500));
    },
    [sel, frac],
  );
const shot = async (p, name, full = true) => {
  const path = join(OUT, `${name}.png`);
  await p.screenshot({ path, fullPage: full });
  report.screenshots.push(`${name}.png`);
};
async function axe(p, tag) {
  const r = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  report.axe.push({
    tag,
    serious_or_critical: bad.length,
    violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes[0]?.target })),
  });
}

// ---------- screenshots (+ axe on each) ----------
for (const [w, h] of VIEWPORTS) {
  const { p, ctx, tag } = await page({ w, h });
  // the v2 page is ~30 000 px tall: no full-page shots (software rendering stalls); the beats are shot below
  await shot(p, `first-${tag}`, false);
  await warm(p);
  await axe(p, tag);
  await ctx.close();
}

// ---------- v2 beats in the viewport: hero with the live 3D, campaign middle, movement, finale ----------
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const { p, ctx, tag } = await page({ w, h });
  const live = await p
    .waitForSelector('[data-poster="hero"].opacity-0', { state: 'attached', timeout: 60_000 })
    .then(() => true, () => false);
  report[`hero_3d_${w}`] = live;
  await p.waitForTimeout(1200);
  await shot(p, `hero-${tag}`, false);
  await scrollToEl(p, '#watch', 0.5);
  await shot(p, `campaign-mid-${tag}`, false);
  await scrollToEl(p, '#movement > div', 0.6);
  await shot(p, `movement-${tag}`, false);
  for (const id of ['#question', '#numbers', '#economics', '#evidence']) {
    await scrollToEl(p, id);
    await p.waitForTimeout(900);
    await shot(p, `${id.slice(1)}-${tag}`, false);
  }
  await p.evaluate(() => window.scrollTo(0, document.getElementById('finale').offsetTop + document.getElementById('finale').offsetHeight - innerHeight));
  await p.waitForTimeout(3500);
  await shot(p, `finale-${tag}`, false);
  await ctx.close();
}
{
  const { p, ctx, tag } = await page({ reduced: true });
  await shot(p, `page-${tag}`, false);
  await scrollToEl(p, '#movement');
  await shot(p, `movement-${tag}`, false);
  await scrollToEl(p, '#finale');
  await shot(p, `finale-${tag}`, false);
  await ctx.close();
}

// ---------- v2: hero after load, "Watch it work" pinned campaign at start / middle / end ----------
{
  const { p, ctx } = await page();
  await p.waitForTimeout(2600);
  await shot(p, 'hero-1440-after-load', false);
  for (const [name, f] of [['campaign-start', 0.02], ['campaign-middle', 0.5], ['campaign-end', 0.99]]) {
    await p.evaluate((f) => {
      const el = document.querySelector('#watch');
      const top = el.getBoundingClientRect().top + scrollY;
      window.scrollTo(0, top + f * (el.offsetHeight - innerHeight));
    }, f);
    await p.waitForTimeout(1800);
    await shot(p, name, false);
  }
  report.campaign_end_caption = await p.evaluate(() => document.querySelector('#watch .sticky')?.innerText.split('\n').slice(0, 4).join(' | '));
  await ctx.close();
}

// ---------- a 10 s scroll recording (Playwright video) from the hero to the finale ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark', recordVideo: { dir: OUT, size: { width: 1440, height: 900 } } });
  const p = await ctx.newPage();
  await p.goto(URL_, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const end = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  for (let t = 0; t <= 100; t++) {
    await p.mouse.wheel(0, end / 100);
    await p.waitForTimeout(85);
  }
  const video = p.video();
  await ctx.close();
  const { renameSync } = await import('node:fs');
  renameSync(await video.path(), join(OUT, 'scroll-10s.webm'));
  report.screenshots.push('scroll-10s.webm');
}

// ---------- replay: start, middle, end ----------
{
  const { p, ctx } = await page();
  const reg = p.locator('#register');
  const range = p.locator('#replay');
  await range.focus();
  await p.keyboard.press('Home');
  await p.waitForTimeout(400);
  await reg.screenshot({ path: join(OUT, 'replay-start.png') });
  for (let i = 0; i < 4; i++) await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(600);
  await reg.screenshot({ path: join(OUT, 'replay-middle.png') });
  report.replay_middle = await p.locator('#register [aria-live]').first().textContent();
  await p.keyboard.press('End');
  await p.waitForTimeout(600);
  await reg.screenshot({ path: join(OUT, 'replay-end.png') });
  report.screenshots.push('replay-start.png', 'replay-middle.png', 'replay-end.png');
  // the play button walks the stops
  await p.getByRole('button', { name: /replay the campaign/i }).click();
  await p.waitForTimeout(2600);
  report.replay_playing = await p.locator('#register [aria-live]').first().textContent();
  await ctx.close();
}

// ---------- receipt open: desktop + mobile (+ axe with it open) ----------
for (const [w, h, name] of [
  [1440, 900, 'receipt-desktop'],
  [390, 844, 'receipt-mobile'],
]) {
  const { p, ctx, tag } = await page({ w, h });
  const btn = p.locator(w >= 768 ? 'table .cell-btn' : 'ol[aria-label="Register entries"] button').nth(w >= 768 ? 3 * 11 + 2 : 34);
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await p.locator('[role="dialog"]').waitFor();
  await p.waitForTimeout(500);
  await shot(p, `${name}`, false);
  await axe(p, `${tag}-receipt`);
  await ctx.close();
}
{
  // deep link
  const { p, ctx } = await page({ hash: '#HL-4.2-018' });
  await p.locator('[role="dialog"]').waitFor({ timeout: 5000 });
  await p.waitForTimeout(500);
  report.deep_link = (await p.locator('[role="dialog"] h2').first().textContent())?.trim();
  await shot(p, 'receipt-deeplink-018', false);
  await ctx.close();
}

// ---------- keyboard flow ----------
{
  const { p, ctx } = await page();
  const steps = [];
  await p.locator('#register').scrollIntoViewIfNeeded();
  await p.locator('#replay').focus();
  let found = false;
  for (let i = 0; i < 30; i++) {
    await p.keyboard.press('Tab');
    if (await p.evaluate(() => document.activeElement?.classList.contains('cell-btn'))) {
      found = true;
      break;
    }
  }
  const label = () => p.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  steps.push(['tab into register', found, await label()]);
  await p.keyboard.press('ArrowRight');
  steps.push(['ArrowRight', true, await label()]);
  await p.keyboard.press('ArrowDown');
  const before = await label();
  steps.push(['ArrowDown', true, before]);
  await p.keyboard.press('End');
  steps.push(['End', true, await label()]);
  await p.keyboard.press('Home');
  steps.push(['Home', true, await label()]);
  await p.keyboard.press('ArrowRight');
  const target = await label();
  await p.keyboard.press('Enter');
  const opened = await p.locator('[role="dialog"]').waitFor({ timeout: 3000 }).then(() => true, () => false);
  steps.push(['Enter opens receipt', opened, p.url().split('#')[1] ?? '']);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  const closed = (await p.locator('[role="dialog"]').count()) === 0;
  const after = await label();
  steps.push(['Esc closes', closed, '']);
  steps.push(['focus returns to the same cell', after === target, after]);
  report.keyboard = { pass: steps.every((s) => s[1]), steps };
  await ctx.close();
}

// ---------- every in-page anchor resolves (nav, mobile menu, CTAs, receipt links) ----------
{
  const { p, ctx } = await page();
  report.anchors = await p.evaluate(() => {
    const hrefs = [...new Set([...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href')))];
    const receipts = new Set([...document.querySelectorAll('[data-row]')].map((e) => e.getAttribute('data-row')));
    const bad = hrefs.filter((h) => !(document.getElementById(h.slice(1)) || receipts.has(h.slice(1))));
    return { checked: hrefs.length, unresolved: bad };
  });
  await ctx.close();
}

// ---------- 404 ----------
{
  const { p, ctx } = await page({ hash: '' });
  await p.goto(URL_ + '404.html', { waitUntil: 'networkidle' });
  await shot(p, '404', false);
  await ctx.close();
}
await browser.close();

// ---------- budgets ----------
{
  const html = readFileSync(join(WEB, 'dist/index.html'), 'utf8');
  const js = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  const gz = (f) => gzipSync(readFileSync(join(WEB, 'dist', f))).length;
  const jsGz = js.reduce((a, f) => a + gz(f), 0);
  const fonts = readdirSync(join(WEB, 'dist/fonts')).filter((f) => f.endsWith('.woff2'));
  const fontBytes = fonts.reduce((a, f) => a + readFileSync(join(WEB, 'dist/fonts', f)).length, 0);
  const lazy = readdirSync(join(WEB, 'dist/assets')).filter((f) => f.endsWith('.js') && !js.includes(`assets/${f}`));
  report.budgets = {
    first_load_js: js,
    first_load_js_gzip_kb: +(jsGz / 1024).toFixed(1),
    js_ok: jsGz <= 200 * 1024,
    fonts_kb: +(fontBytes / 1024).toFixed(1),
    fonts_ok: fontBytes <= 100 * 1024,
    lazy_chunks: lazy.map((f) => `${f} ${(gz('assets/' + f) / 1024).toFixed(1)} kB gz`),
    site_json_kb: +(readFileSync(join(WEB, 'dist/site.json')).length / 1024).toFixed(1),
  };
}

// ---------- Lighthouse (mobile) ----------
try {
  const chrome = chromium.executablePath();
  const lhOut = join(OUT, 'lighthouse');
  execFileSync(
    'npx',
    ['lighthouse', URL_, '--quiet', '--output=json', '--output=html', `--output-path=${lhOut}`, '--form-factor=mobile',
      '--only-categories=performance,accessibility,best-practices,seo', '--chrome-flags=--headless=new --no-sandbox'],
    { cwd: WEB, env: { ...process.env, CHROME_PATH: chrome }, stdio: 'pipe', timeout: 240_000 },
  );
  const lh = JSON.parse(readFileSync(`${lhOut}.report.json`, 'utf8'));
  report.lighthouse = Object.fromEntries(Object.entries(lh.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
  report.lighthouse_failed_audits = Object.values(lh.audits)
    .filter((a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode !== 'informative' && a.scoreDisplayMode !== 'notApplicable')
    .map((a) => `${a.id}: ${a.displayValue ?? a.score}`);
} catch (e) {
  report.lighthouse = { error: String(e.message).slice(0, 400) };
}

stop();
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
const axeBad = report.axe.reduce((a, x) => a + x.serious_or_critical, 0);
console.log(
  JSON.stringify(
    {
      cycle,
      screenshots: report.screenshots.length,
      axe_serious_or_critical: axeBad,
      axe_all: [...new Set(report.axe.flatMap((x) => x.violations.map((v) => `${v.id}(${v.impact})`)))],
      console: report.console.length,
      console_sample: report.console.slice(0, 5),
      keyboard: report.keyboard,
      deep_link: report.deep_link,
      anchors: report.anchors,
      replay_middle: report.replay_middle,
      replay_playing: report.replay_playing,
      hero_3d: [report.hero_3d_1440, report.hero_3d_390],
      campaign_end_caption: report.campaign_end_caption,
      lighthouse: report.lighthouse,
      lighthouse_failed_audits: report.lighthouse_failed_audits,
      budgets: report.budgets,
    },
    null,
    1,
  ),
);
if (!existsSync(join(OUT, 'report.json'))) process.exit(1);
process.exit(0);
