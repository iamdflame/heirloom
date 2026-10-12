// Renders the 3D hero (three-demo.html, frozen frame) to the poster images used for mobile,
// reduced motion and no-WebGL:
//   public/hero-poster.{webp,avif}    1600×1000 (desktop, movement in the right two thirds)
//   public/hero-poster-m.{webp,avif}  900×1100  (mobile crop, movement centred)
//   public/finale-poster.{webp,avif}  1600×1000 (the finale: zoomed out, stopped)
// Each file is kept ≤180 kB by stepping the quality down. Run: node scripts/render-poster.mjs
// (starts vite on :4300, renders with SwiftShader WebGL so no GPU is needed, stops vite).
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { chromium } from 'playwright';
import sharp from 'sharp';

const WEB = new URL('..', import.meta.url).pathname;
const PORT = 4300;
const URL_ = `http://localhost:${PORT}/three-demo.html?still=1`;
const MAX = 180 * 1024;
const SHOTS = [
  { name: 'hero-poster', width: 1600, height: 1000 },
  { name: 'hero-poster-m', width: 900, height: 1100 },
  { name: 'finale-poster', width: 1600, height: 1000, q: '&variant=finale' },
];

async function encode(png, file, fmt) {
  for (let q = fmt === 'avif' ? 60 : 84; q >= 30; q -= 4) {
    const img = sharp(png);
    const buf = fmt === 'avif' ? await img.avif({ quality: q, effort: 6 }).toBuffer() : await img.webp({ quality: q, effort: 6, smartSubsample: true }).toBuffer();
    if (buf.length <= MAX) {
      await sharp(buf).toFile(file);
      return { q, bytes: statSync(file).size };
    }
  }
  throw new Error(`${file}: cannot get under ${MAX} bytes`);
}

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: WEB, stdio: 'ignore' });
try {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(URL_)).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const s of SHOTS) {
    const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.error('pageerror', e.message));
    await page.goto(URL_ + (s.q ?? ''));
    await page.waitForSelector('html[data-ready]', { state: 'attached', timeout: 120_000 });
    await page.waitForTimeout(1500); // the canvas fades in over 900 ms
    const png = await page.screenshot({ type: 'png' });
    await page.close();
    for (const fmt of ['webp', 'avif']) {
      const file = `${WEB}public/${s.name}.${fmt}`;
      const r = await encode(png, file, fmt);
      console.log(`poster: public/${s.name}.${fmt} ${s.width}×${s.height} q${r.q} ${(r.bytes / 1024).toFixed(1)} kB`);
    }
  }
  await browser.close();
} finally {
  server.kill('SIGTERM');
}
