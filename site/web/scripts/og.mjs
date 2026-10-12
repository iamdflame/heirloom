// Renders /og.html to public/og.png (1200×630) with Playwright. Run after `npm run build`:
//   node scripts/og.mjs   (starts vite preview on :4174, screenshots, stops it)
// og.png is committed: CI only copies it.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const WEB = new URL('..', import.meta.url).pathname;
const PORT = 4174;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: WEB, stdio: 'ignore' });
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/og.html`)).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: 'light' });
  await page.goto(`http://localhost:${PORT}/og.html`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${WEB}public/og.png`, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  await browser.close();
  console.log('og: wrote public/og.png');
} finally {
  server.kill('SIGTERM');
}
