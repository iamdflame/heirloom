// After `vite build` and the SSR build of src/prerender.tsx: put the server-rendered nav + hero into
// dist/index.html's #root. Fails loudly if the placeholder is missing.
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const WEB = new URL('..', import.meta.url).pathname;
const { render } = await import(join(WEB, 'dist-ssr/prerender.js'));
const file = join(WEB, 'dist/index.html');
const html = readFileSync(file, 'utf8');
const empty = '<div id="root"></div>';
if (!html.includes(empty)) {
  console.error('prerender: dist/index.html has no empty #root');
  process.exit(1);
}
const body = render();
writeFileSync(file, html.replace(empty, `<div id="root">${body}</div>`));
rmSync(join(WEB, 'dist-ssr'), { recursive: true, force: true });
console.log(`prerender: ${(body.length / 1024).toFixed(1)} kB of first-screen HTML in dist/index.html`);
