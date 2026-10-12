// Grades the Unsplash photos (see ASSETS.md) dark with a brass cast and writes responsive AVIF + WebP
// to public/photos/<name>-<w>.{avif,webp}, each <= 180 kB. Usage: node scripts/photos.mjs <dir of <id>.jpg>
import sharp from 'sharp';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = process.argv[2];
if (!SRC) throw new Error('usage: node scripts/photos.mjs <raw dir>');
const OUT = new URL('../public/photos/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
export const PHOTOS = [
  { name: 'movement', id: 'HmIwomthlWw' },
  { name: 'gears-dark', id: 'snk-X32c8tE' },
  { name: 'dial', id: 'FCsA8Adcgr4' },
  { name: 'gears-brass', id: 'UQ2Fw_9oApU' },
  { name: 'archive', id: 'Ph4ZJrwf4x8' },
  { name: 'watch-dark', id: 'LaFLlEKx1c0' },
];
const WIDTHS = [640, 1280, 1920];
const MAX = 180 * 1024;
// 70% brass duotone (luminance × [1, .82, .55]) + 30% of the original colour
const L = [0.3, 0.59, 0.11];
const mix = (k, i) => L.map((l, j) => +(0.7 * k * l + (i === j ? 0.3 : 0)).toFixed(4));
const RECOMB = [mix(1, 0), mix(0.82, 1), mix(0.55, 2)];
const vignette = (w, h) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><radialGradient id="v" cx="50%" cy="50%" r="75%">
  <stop offset="40%" stop-color="#fff"/><stop offset="100%" stop-color="#3a3a3a"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#v)"/></svg>`);

const manifest = {};
for (const p of PHOTOS) {
  const base = sharp(join(SRC, `${p.id}.jpg`)).rotate();
  const meta = await base.metadata();
  manifest[p.name] = { id: p.id, ratio: +(meta.width / meta.height).toFixed(4), widths: [] };
  for (const w of WIDTHS) {
    if (w > meta.width) continue;
    const h = Math.round((w * meta.height) / meta.width);
    const graded = await sharp(join(SRC, `${p.id}.jpg`))
      .rotate()
      .resize(w)
      .recomb(RECOMB)
      .linear(0.82, -6)
      .gamma(1.15)
      .composite([{ input: vignette(w, h), blend: 'multiply' }])
      .toBuffer();
    for (const [fmt, opts] of [['avif', { quality: 50, effort: 6 }], ['webp', { quality: 70, effort: 6 }]]) {
      let q = opts.quality;
      let file;
      for (;;) {
        file = join(OUT, `${p.name}-${w}.${fmt}`);
        await sharp(graded)[fmt]({ ...opts, quality: q }).toFile(file);
        if (statSync(file).size <= MAX || q <= 25) break;
        q -= 8;
      }
      console.log(`${p.name}-${w}.${fmt} ${(statSync(file).size / 1024).toFixed(0)} kB q${q}`);
    }
    manifest[p.name].widths.push(w);
  }
}
writeFileSync(new URL('../src/data/photos.json', import.meta.url), JSON.stringify(manifest, null, 1) + '\n');
