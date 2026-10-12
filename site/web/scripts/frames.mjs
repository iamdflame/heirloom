// Pulls frames from a QA video with Chromium (no ffmpeg here): node scripts/frames.mjs <video.webm> <out.png> [n]
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const [file, out, n = '8'] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const src = 'data:video/webm;base64,' + readFileSync(file).toString('base64');
await p.setContent(`<body style="margin:0;background:#000"><div id="g" style="display:grid;grid-template-columns:repeat(4,360px)"></div></body>`);
await p.evaluate(async ({ src, n }) => {
  const v = document.createElement('video');
  v.src = src;
  v.muted = true;
  await new Promise((r) => (v.onloadeddata = r));
  // webm from Playwright may report Infinity duration until seeked to the end
  v.currentTime = 1e6;
  await new Promise((r) => (v.onseeked = r));
  const dur = v.duration === Infinity ? v.currentTime : v.duration;
  for (let i = 0; i < n; i++) {
    v.currentTime = (dur * (i + 0.5)) / n;
    await new Promise((r) => (v.onseeked = r));
    const c = document.createElement('canvas');
    c.width = 360; c.height = 225;
    c.getContext('2d').drawImage(v, 0, 0, 360, 225);
    document.getElementById('g').append(c);
  }
}, { src, n: +n });
await p.locator('#g').screenshot({ path: out });
await b.close();
