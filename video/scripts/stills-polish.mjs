// Review stills from the VO-timed polish composition (src/polish): node scripts/stills-polish.mjs outDir S03:4.2 S06:10 ABS:61.5 …
// Times are seconds into the scene (real VO time, not scaled). CAPTIONS=1 burns the captions in.
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const timing = JSON.parse(readFileSync(join(root, 'timing-vo.json'), 'utf8'));
const outDir = process.argv[2] ?? join(root, 'out/stills-polish');
const want = process.argv.slice(3).map((a) => { const [id, s] = a.split(':'); return [id, Number(s)]; });
mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: join(root, 'src/polish/index.ts'), publicDir: join(root, 'public') });
const inputProps = { captions: process.env.CAPTIONS === '1' };
const composition = await selectComposition({ serveUrl, id: 'HeirloomDemo', inputProps });
for (const [id, s] of want) {
  const sc = timing.scenes.find((x) => x.id === id);
  const frame = id === 'ABS' ? Math.round(s * 60) : sc.start + Math.min(sc.frames - 1, Math.round(s * 60));
  const file = join(outDir, `${id}-${String(s).replace('.', '_')}.jpg`);
  await renderStill({ composition, serveUrl, output: file, frame, inputProps, imageFormat: 'jpeg', jpegQuality: 80, scale: 0.5 });
  console.log(file, frame);
}
