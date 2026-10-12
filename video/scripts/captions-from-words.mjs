// Word-accurate captions from the owner's VO: ~/video-in/vo/words.json (per-word timestamps relative to full.mp3)
// and split.json (where each scene's piece starts in full.mp3). The text shown is the DISPLAY text below
// (VO-FINAL §3 with digits, "4.2", "neatlogs", "cfo.ai"; bracket tags dropped), aligned word by word to the
// spoken tokens (edit-distance DP), chunked into 1–2 lines of ≤42 chars, never across a sentence end.
// Writes timing-vo.json (scenes re-timed to the VO pieces, word-accurate captions, per-word anchors) and captions.srt.
// Usage: node scripts/captions-from-words.mjs [voDir]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { SCENES, HEAD, TAIL, END_HOLD } from './scenes.mjs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const voDir = process.argv[2] ?? join(homedir(), 'video-in/vo');
const MAX = 42;
const FPS = 60;

export const DISPLAY = {
  S01: 'On 7 April, Django 4.2 reached end of life. No more security fixes.',
  S02: 'But Debian 13 and Ubuntu 24.04 still ship it. Since then, Django has published 19 security advisories… and not one official patch for 4.2.',
  S03: "On October 1, Ubuntu shipped a backport for one of them. Five days later, Django said its original fix was incomplete. We took Ubuntu's source package, ran a test calibrated on Django's own fix commits… and the code path Django closed is still reachable in Ubuntu's build.",
  S04: 'That test was run by Heirloom. An agent that keeps end-of-life software patched… and proves which old versions are actually vulnerable.',
  S05: "Its first rule: never trust a test that hasn't failed. For each advisory, Heirloom writes its own test, proves it fails on Django's vulnerable code and passes on the fix… and only then asks the real question: is the old version affected?",
  S06: "Then we let it run the whole campaign. 19 advisories, replayed in the order Django published them. 13 candidate backports, each proven by a test that fails before the fix and passes after. Where it couldn't prove something, it filed the evidence instead of guessing. And when a new fix amended one it had already backported, it stacked the follow-up on its own pull request.",
  S07: "Across the whole campaign, it asked me one question. A real judgement call, about changing Django's behaviour. I answered once. It sealed the answer as a precedent… and the next case reused it, without asking.",
  S08: 'We tested the method on cases with known answers. A naive pipeline once called a vulnerable version safe. Heirloom? Zero times. Every claim in every pull request links to its neatlogs trace, and every backport links the Entire session of the agent that wrote it.',
  S09: "Each advisory cost about 20 cents of model time. We modelled the business in cfo.ai: what that's worth to the teams who keep old software alive.",
  S10: 'Heirloom. Old software, kept honest. Every verdict is a test run you can open.',
};

/** Two balanced lines of ≤42 chars, preferring a break after punctuation. */
function twoLines(block) {
  if (block.length <= MAX) return block;
  const words = block.split(' ');
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const l1 = words.slice(0, i).join(' ');
    const l2 = words.slice(i).join(' ');
    if (l1.length > MAX || l2.length > MAX) continue;
    const score = Math.abs(l1.length - l2.length) - (/[,:;…?]$/.test(l1) ? 12 : 0);
    if (!best || score < best.score) best = { score, text: `${l1}\n${l2}` };
  }
  return best ? best.text : block;
}

/** Caption chunks as word-index ranges: whole sentences/clauses, ≤2 lines of ≤42 chars. */
function chunkWords(words) {
  const ranges = [];
  // sentences end on . ? ! …
  let s0 = 0;
  const sentences = [];
  words.forEach((w, i) => {
    if (/[.?!…]["”']?$/.test(w) || i === words.length - 1) {
      sentences.push([s0, i]);
      s0 = i + 1;
    }
  });
  const fits = (a, b) => {
    const t = words.slice(a, b + 1).join(' ');
    return t.length <= 2 * MAX - 6 && twoLines(t).split('\n').every((l) => l.length <= MAX);
  };
  for (const [a, b] of sentences) {
    // clauses end on , : ;
    const clauses = [];
    let c0 = a;
    for (let i = a; i <= b; i++) if (/[,:;]$/.test(words[i]) || i === b) { clauses.push([c0, i]); c0 = i + 1; }
    let cur = null;
    for (const [ca, cb] of clauses) {
      if (cur && fits(cur[0], cb)) cur = [cur[0], cb];
      else {
        if (cur) ranges.push(cur);
        cur = [ca, cb];
        // a single clause longer than two lines: split it at the most balanced word boundary
        while (!fits(cur[0], cur[1])) {
          let cut = cur[1] - 1;
          while (cut > cur[0] && !fits(cur[0], cut)) cut--;
          ranges.push([cur[0], cut]);
          cur = [cut + 1, cur[1]];
        }
      }
    }
    if (cur) ranges.push(cur);
  }
  return ranges;
}

const norm = (w) =>
  w
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/(\d)(st|nd|rd|th)\b/g, '$1')
    .replace(/[^a-z0-9']/g, '');
const SAME = { judgment: 'judgement', behavior: 'behaviour', modeled: 'modelled', followup: 'followup', cfoai: 'cfoai' };
const eq = (a, b) => a === b || SAME[a] === b || SAME[b] === a;

/** Align display tokens (with hyphen parts) to spoken tokens; returns [start, end] seconds per display word. */
function align(display, spoken) {
  // explode display words into keys (end-of-life → end, of, life; follow-up → followup)
  const keys = [];
  display.forEach((w, i) => {
    const parts = /^follow-up/.test(w) ? [w] : w.split(/-(?=[a-z])/i);
    for (const p of parts) { const k = norm(p); if (k) keys.push({ k, i }); }
  });
  const n = keys.length, m = spoken.length;
  const D = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = 0; i <= n; i++) D[i][0] = i;
  for (let j = 0; j <= m; j++) D[0][j] = j;
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      D[i][j] = Math.min(D[i - 1][j - 1] + (eq(keys[i - 1].k, spoken[j - 1].k) ? 0 : 1), D[i - 1][j] + 1, D[i][j - 1] + 1);
  const hit = new Array(n).fill(null);
  for (let i = n, j = m; i > 0 && j > 0; ) {
    if (D[i][j] === D[i - 1][j - 1] + (eq(keys[i - 1].k, spoken[j - 1].k) ? 0 : 1)) { hit[i - 1] = spoken[j - 1]; i--; j--; }
    else if (D[i][j] === D[i - 1][j] + 1) i--;
    else j--;
  }
  const t = display.map(() => [null, null]);
  keys.forEach(({ i }, x) => {
    if (!hit[x]) return;
    t[i][0] = t[i][0] ?? hit[x].s;
    t[i][1] = hit[x].e;
  });
  // fill unmatched words from their neighbours
  for (let i = 0; i < t.length; i++) {
    if (t[i][0] != null) continue;
    const prev = t.slice(0, i).reverse().find((x) => x[1] != null);
    const next = t.slice(i + 1).find((x) => x[0] != null);
    t[i] = [prev ? prev[1] : next[0], next ? next[0] : prev[1]];
  }
  return t;
}

const words = JSON.parse(readFileSync(join(voDir, 'words.json'), 'utf8'));
const split = JSON.parse(readFileSync(join(voDir, 'split.json'), 'utf8'));
// scenes follow the real VO: head 0.4 s + piece + tail 0.6 s (S10: + 4 s end-card hold), as retime.mjs does
const probe = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim());
let start = 0;
const scenes = SCENES.map((s) => {
  const file = join(root, 'public/audio/vo', `${s.id}.mp3`);
  const vo = probe(existsSync(file) ? file : join(voDir, `${s.id}.mp3`));
  const frames = Math.round((HEAD + vo + (s.id === 'S10' ? END_HOLD : TAIL)) * FPS);
  const out = { id: s.id, title: s.title, start, frames, target: Math.round(s.target * FPS), scale: Number((frames / Math.round(s.target * FPS)).toFixed(4)), vo: DISPLAY[s.id], voFile: `audio/vo/${s.id}.mp3`, voSeconds: vo };
  start += frames;
  return out;
});
const timing = { fps: FPS, width: 1920, height: 1080, totalFrames: start, voPresent: true, head: HEAD, tail: TAIL, endHold: END_HOLD, scenes, captions: [], sfx: [], words: {} };

// merge sub-word tokens (".2", ".04") into their word
const spokenAll = [];
for (const w of words) {
  if (!/^\s/.test(w.raw) && spokenAll.length) {
    const p = spokenAll[spokenAll.length - 1];
    p.raw += w.raw;
    p.e = w.e;
  } else spokenAll.push({ raw: w.raw.trim(), s: w.s, e: w.e });
}
spokenAll.forEach((w) => (w.k = norm(w.raw)));

const captions = [];
for (const sc of timing.scenes) {
  const sp = split.find((x) => x.scene === sc.id);
  const spoken = spokenAll.filter((w) => w.s >= sp.start - 0.05 && w.s < sp.end - 0.05);
  const display = DISPLAY[sc.id].split(' ');
  const t = align(display, spoken);
  // full.mp3 time → master frame: the piece starts at sp.start and is placed at scene start + head
  const toFrame = (sec) => sc.start + Math.round((timing.head + sec - sp.start) * FPS);
  // word anchors for the scenes: frame (relative to the scene start) where each display word starts / ends
  timing.words[sc.id] = display.map((w, i) => [w, toFrame(t[i][0]) - sc.start, toFrame(t[i][1]) - sc.start]);
  for (const [a, b] of chunkWords(display)) {
    captions.push({ scene: sc.id, text: twoLines(display.slice(a, b + 1).join(' ')), from: toFrame(t[a][0]) - 4, to: toFrame(t[b][1]) + 14 });
  }
}
// no overlaps; bridge short gaps inside a scene so captions don't flicker
for (let i = 0; i < captions.length - 1; i++) {
  const c = captions[i], n = captions[i + 1];
  if (c.scene === n.scene && n.from - c.to < 30) c.to = n.from - 2;
  if (c.to >= n.from) c.to = n.from - 2;
}

timing.captions = captions;
const outDir = process.env.DRY ? '/tmp' : root;
writeFileSync(join(outDir, 'timing-vo.json'), JSON.stringify(timing, null, 1) + '\n');
const tc = (f) => {
  const ms = Math.round((f / FPS) * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
writeFileSync(join(outDir, 'captions.srt'), captions.map((c, i) => `${i + 1}\n${tc(c.from)} --> ${tc(c.to)}\n${c.text}\n`).join('\n'));
console.log(`${captions.length} captions from words.json`);
const long = captions.filter((c) => c.text.split('\n').some((l) => l.length > MAX) || c.text.split('\n').length > 2);
if (long.length) console.log('WARNING over-long captions:', long);
