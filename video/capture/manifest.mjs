// Write ~/video-out/captures/manifest.json from the encoded files (ffprobe) + the shot list notes.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { ALL } from './shots.mjs';

const HOME = process.env.HOME;
const probe = (f) => {
  const j = JSON.parse(execFileSync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', f], { encoding: 'utf8' }));
  const v = j.streams.find((s) => s.codec_type === 'video');
  const [n, d] = v.r_frame_rate.split('/').map(Number);
  return { seconds: +(+j.format.duration).toFixed(3), fps: +(n / d).toFixed(3), width: v.width, height: v.height, frames: +v.nb_frames };
};
const BROLL = {
  'BR01-balance-wheel-skeleton': ['https://www.pexels.com/video/close-up-of-watch-mechanism-11965370/ (Quang Viet Nguyen, Pexels License)', 'macro balance wheel + skeleton train, graded ink/brass'],
  'BR02-balance-wheel-gilt-train': ['https://www.pexels.com/video/close-up-of-clock-mechanism-12163205/ (Quang Viet Nguyen, Pexels License)', 'macro balance wheel and gilt wheel, graded ink/brass'],
  'BR03-movement-through-caseback': ['https://mixkit.co/free-stock-video/mechanism-of-a-watch-through-a-glass-3652/ (Edgar Fernández, Mixkit License)', 'automatic movement through a display caseback; maker name on the rotor'],
};
const out = [];
for (const s of ALL) {
  const file = `${HOME}/video-out/captures/${s.id}.mp4`;
  if (!existsSync(file)) continue;
  out.push({ id: s.id, file, ...probe(file), source: s.source ?? s.url, url: s.url, notes: s.notes ?? '' });
}
const bdir = `${HOME}/video-out/broll`;
for (const f of existsSync(bdir) ? readdirSync(bdir).filter((f) => f.endsWith('.mp4')).sort() : []) {
  const id = f.replace(/\.mp4$/, '');
  const [source, notes] = BROLL[id] ?? ['stock', ''];
  out.push({ id, file: `${bdir}/${f}`, ...probe(`${bdir}/${f}`), source, notes: `${notes}; native frame rate (not 60)` });
}
writeFileSync(`${HOME}/video-out/captures/manifest.json`, JSON.stringify(out, null, 2) + '\n');
const tot = out.reduce((a, c) => a + c.seconds, 0);
console.log(`${out.length} clips, ${tot.toFixed(1)} s total (captures ${out.filter((c) => !c.id.startsWith('BR')).reduce((a, c) => a + c.seconds, 0).toFixed(1)} s)`);
