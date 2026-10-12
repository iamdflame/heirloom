// Renders review stills in one bundle: node scripts/stills.mjs [outDir] [S01:4.5 S03:12 …]
// Default: the key moment of every scene (KEY below, seconds into the scene, scaled with the retime).
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const timing = JSON.parse(readFileSync(join(root, 'timing.json'), 'utf8'));
export const KEY = { S01: [6.6], S02: [10.6], S03: [11.6, 18.6], S04: [5.8], S05: [10.8, 14.2], S06: [10.4], S07: [11.8], S08: [8.8], S09: [3.2], S10: [12.5] };

const outDir = process.argv[2] ?? join(root, 'out/stills');
const args = process.argv.slice(3);
const want = args.length
  ? args.map((a) => { const [id, s] = a.split(':'); return [id, Number(s)]; })
  : Object.entries(KEY).flatMap(([id, ss]) => ss.map((s) => [id, s]));
const captions = process.env.CAPTIONS === '1';

mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: join(root, 'src/index.ts'), publicDir: join(root, 'public') });
const inputProps = { captions, audio: false };
const composition = await selectComposition({ serveUrl, id: 'HeirloomDemo', inputProps });
for (const [id, s] of want) {
  const sc = timing.scenes.find((x) => x.id === id);
  const frame = id === 'ABS' ? Math.round(s * 60) : sc.start + Math.min(sc.frames - 1, Math.round(s * 60 * sc.scale));
  const file = join(outDir, `${id}-${String(s).replace('.', '_')}.png`);
  await renderStill({ composition, serveUrl, output: file, frame, inputProps, imageFormat: 'png' });
  console.log(file, frame);
}
