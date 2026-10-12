// Proof that virtual time (and only virtual time) drives Motion and three.js in the hero.
// A: frame at t, B: frame at t after 2 s of real waiting (clock paused) → must be identical (no real-time leak)
// C: frame after runFor(1 s) in 60 steps → must differ from A in the 3D region.
// Usage: node proof.mjs [url]
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { LAUNCH_ARGS } from './capture.mjs';

const url = process.argv[2] ?? 'http://localhost:4400/?capture=1';
const dir = `${process.env.HOME}/video-out/proof`;
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ args: LAUNCH_ARGS });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, colorScheme: 'dark' });
await page.clock.install({ time: new Date('2026-10-12T09:00:00Z') });
await page.goto(url, { waitUntil: 'networkidle' });
const live = await page.waitForSelector('[data-poster="hero"].opacity-0', { state: 'attached', timeout: 60_000 }).then(() => true, () => false);
await page.waitForTimeout(1500);
const now = await page.evaluate(() => Date.now());
await page.clock.pauseAt(now + 50);
const clip = { x: 860, y: 80, width: 1060, height: 900 };
const cdp = await page.context().newCDPSession(page);
// raw CDP capture: page.screenshot waits on a rAF that a paused clock never delivers
const shot = async (n) => {
  const p = `${dir}/${n}.png`;
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } });
  writeFileSync(p, Buffer.from(data, 'base64'));
  return p;
};
const A = await shot('A');
await new Promise((r) => setTimeout(r, 2000));
const B = await shot('B');
const tr = Date.now();
for (let i = 0; i < 60; i++) {
  await page.clock.runFor(1000 / 60);
  if (i % 10 === 0) console.error(`runFor ${i} ${Date.now() - tr} ms`);
}
const C = await shot('C');
const run = (a, b) => {
  const r = execFileSync('sh', ['-c', `ffmpeg -hide_banner -i ${a} -i ${b} -lavfi psnr -f null - 2>&1 | grep -o 'average:[^ ]*'`]).toString().trim();
  return r;
};
const ab = run(A, B), ac = run(A, C);
const res = { url, live3d: live, A_vs_B_paused_2s_real: ab, A_vs_C_after_runFor_1s: ac, pass: live && /inf/.test(ab) && !/inf/.test(ac) };
console.log(JSON.stringify(res, null, 2));
writeFileSync(`${dir}/proof.json`, JSON.stringify(res, null, 2));
await browser.close();
