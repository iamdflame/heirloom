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

/** Two balanced lines of ≤42 chars, preferring a break after punctuation. */
function twoLines(block) {
  if (block.length <= MAX) return block;
  const words = block.split(' ');
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const l1 = words.slice(0, i).join(' ');
    const l2 = words.slice(i).join(' ');
    if (l1.length > MAX || l2.length > MAX) continue;
    const score = Math.abs(l1.length - l2.length) - (/[,:;…]$/.test(l1) ? 12 : 0) - (/^—/.test(l2) ? 12 : 0);
    if (!best || score < best.score) best = { score, text: `${l1}\n${l2}` };
  }
  return best ? best.text : block;
}

/** Split VO into captions: one or two lines of ≤42 chars, never across a sentence end. */
export function chunk(text) {
  const sentences = text.replace(/\s+/g, ' ').trim().match(/[^.?!…]+[.?!…]+["”']?\s*|[^.?!…]+$/g).map((x) => x.trim());
  const out = [];
  for (const sentence of sentences) {
    const clauses = sentence.split(/(?<=[,:;…])\s+|\s+(?=— )/).filter(Boolean);
    let cur = '';
    for (const clause of clauses) {
      const joined = cur ? `${cur} ${clause}` : clause;
      if (joined.length <= 2 * MAX - 6 && twoLines(joined).split('\n').every((l) => l.length <= MAX)) cur = joined;
      else {
        if (cur) out.push(cur);
        cur = clause;
      }
    }
    if (cur) out.push(cur);
  }
  return out.map(twoLines);
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
const long = captions.filter((c) => c.text.split('\n').some((l) => l.length > MAX));
if (long.length) console.log('WARNING over-long captions:', long);
