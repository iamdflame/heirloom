// Print section offsets (document px) for framing the shots. Usage: node layout.mjs [w h]
import { chromium } from 'playwright';
import { LAUNCH_ARGS } from './capture.mjs';
const [w, h] = [+(process.argv[2] ?? 1920), +(process.argv[3] ?? 1080)];
const b = await chromium.launch({ args: LAUNCH_ARGS });
const p = await b.newPage({ viewport: { width: w, height: h }, colorScheme: 'dark' });
await p.goto('http://localhost:4400/?capture=1', { waitUntil: 'networkidle' });
console.log(JSON.stringify(await p.evaluate(() => {
  const o = { H: document.documentElement.scrollHeight };
  for (const s of document.querySelectorAll('main > section, main > div, #main section[id]')) if (s.id) o[s.id] = [Math.round(s.getBoundingClientRect().top + scrollY), s.offsetHeight];
  const btn = document.querySelector('button[aria-label^="CVE-2026-6907 on Django 4.2.30"]');
  if (btn) { const r = btn.getBoundingClientRect(); o.cell6907 = [Math.round(r.left), Math.round(r.top + scrollY), Math.round(r.width), Math.round(r.height)]; }
  return o;
})));
await b.close();
