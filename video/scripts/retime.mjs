// Builds video/timing.json (scene starts/lengths in frames, caption chunks, SFX cues) and video/captions.srt.
// With VO files in public/audio/vo/S01.mp3…S10.mp3 each scene becomes head 0.4 s + VO + tail 0.6 s
// (S10: + 4 s end-card hold). Without them, the brief's target lengths are used.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCENES, FPS, HEAD, TAIL, END_HOLD } from './scenes.mjs';

const root = join(import.meta.dirname, '..');
const MAX = 42;

const probe = (file) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim());

/** Split VO into caption chunks of ≤42 chars, preferring sentence and clause breaks. */
export function chunk(text) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const out = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > MAX && cur) {
      out.push(cur);
      cur = w;
    } else cur = next;
    // close a chunk at a sentence end once it is reasonably long
    if (/[.?!…:]$/.test(cur) && cur.length >= 18) {
      out.push(cur);
      cur = '';
    }
  }
  if (cur) out.push(cur);
  // avoid a dangling one- or two-word chunk: rebalance with its predecessor
  for (let i = 1; i < out.length; i++) {
    if (out[i].length < 12 && (out[i - 1] + ' ' + out[i]).length <= MAX && !/[.?!…]$/.test(out[i - 1])) {
      out[i - 1] = out[i - 1] + ' ' + out[i];
      out.splice(i, 1);
      i--;
    }
  }
  return out;
}

const cues = JSON.parse(readFileSync(join(root, 'sfx-cues.json'), 'utf8'));

let start = 0;
const scenes = [];
const captions = [];
let anyVo = false;
for (const s of SCENES) {
  const voFile = join(root, 'public/audio/vo', `${s.id}.mp3`);
  const hasVo = existsSync(voFile);
  anyVo ||= hasVo;
  const vo = hasVo ? probe(voFile) : null;
  const tail = s.id === 'S10' ? END_HOLD : TAIL;
  const seconds = vo ? HEAD + vo + tail : s.target;
  const frames = Math.round(seconds * FPS);
  // the window where words are spoken
  const speechFrom = start + Math.round(HEAD * FPS);
  const speechTo = start + frames - Math.round(tail * FPS);
  const chunks = chunk(s.vo);
  // weight each chunk by characters, plus a beat for sentence ends
  const weights = chunks.map((c) => c.length + (/[.?!…]$/.test(c) ? 8 : /[,—:]$/.test(c) ? 4 : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  let t = speechFrom;
  chunks.forEach((text, i) => {
    const len = ((speechTo - speechFrom) * weights[i]) / total;
    captions.push({ scene: s.id, text, from: Math.round(t), to: Math.round(t + len) - 2 });
    t += len;
  });
  const scale = frames / Math.round(s.target * FPS);
  scenes.push({ id: s.id, title: s.title, start, frames, target: Math.round(s.target * FPS), scale: Number(scale.toFixed(4)), vo: s.vo, voFile: hasVo ? `audio/vo/${s.id}.mp3` : null, voSeconds: vo });
  start += frames;
}

const sfx = cues.map((c) => {
  const sc = scenes.find((x) => x.id === c.scene);
  return { ...c, frame: sc.start + Math.round(c.at * FPS * sc.scale) };
});

const timing = { fps: FPS, width: 1920, height: 1080, totalFrames: start, voPresent: anyVo, head: HEAD, tail: TAIL, endHold: END_HOLD, scenes, captions, sfx };
writeFileSync(join(root, 'timing.json'), JSON.stringify(timing, null, 1) + '\n');

const tc = (f) => {
  const ms = Math.round((f / FPS) * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
const srt = captions.map((c, i) => `${i + 1}\n${tc(c.from)} --> ${tc(c.to)}\n${c.text}\n`).join('\n');
writeFileSync(join(root, 'captions.srt'), srt);

console.log(`timing.json: ${scenes.length} scenes, ${start} frames (${(start / FPS).toFixed(2)} s), ${captions.length} captions, VO ${anyVo ? 'present' : 'absent (target lengths)'}`);
for (const s of scenes) console.log(`  ${s.id} ${(s.start / FPS).toFixed(2).padStart(7)}s  ${(s.frames / FPS).toFixed(2)}s`);
const long = captions.filter((c) => c.text.length > MAX);
if (long.length) console.log('WARNING over-long captions:', long);
