// Renders public/favicon-32.png from public/seal.svg with Playwright's Chromium.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/seal.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 32, height: 32 }, deviceScaleFactor: 1 });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg width="32" height="32" ')}</body></html>`);
await page.screenshot({ path: new URL('../public/favicon-32.png', import.meta.url).pathname, omitBackground: true });
await browser.close();
console.log('favicon-32.png written');
