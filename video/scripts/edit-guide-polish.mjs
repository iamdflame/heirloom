// Writes ~/video-out/EDIT-GUIDE.md for the VO-timed cut (timing-vo.json): files, scene timecodes, VO placement,
// the music ducking windows, an SFX cue list anchored to the owner's words, the neatlogs window, captures used,
// what changed in the polish pass. Keeps the "Export for YouTube" and "Upload" sections of the previous guide
// (chapters re-timed). Usage: node scripts/edit-guide-polish.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const OUT = process.env.VIDEO_OUT ?? join(homedir(), 'video-out');
const T = JSON.parse(readFileSync(join(root, 'timing-vo.json'), 'utf8'));
const FPS = T.fps;
const pad = (n, w = 2) => String(n).padStart(w, '0');
const tc = (f) => `${pad(Math.floor(f / FPS / 60))}:${pad(Math.floor(f / FPS) % 60)}:${pad(Math.round(f % FPS))}`;
const mmss = (f) => `${Math.floor(f / FPS / 60)}:${pad(Math.floor(f / FPS) % 60)}`;
const sc = (id) => T.scenes.find((s) => s.id === id);
const word = (id, w, n = 1) => {
  const norm = (x) => x.toLowerCase().replace(/[^a-z0-9.]/g, '').replace(/\.$/, '');
  let k = 0;
  for (const [x, s] of T.words[id]) if (norm(x) === norm(w) && ++k === n) return sc(id).start + s;
  throw new Error(`${id} ${w}`);
};
const probe = (f) => {
  try {
    return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim());
  } catch {
    return null;
  }
};
const mb = (f) => `${(statSync(f).size / 1e6).toFixed(1)} MB`;

const files = ['master/HeirloomDemo-FINAL.mp4', 'master/HeirloomDemo-mix.mp4', 'master/HeirloomDemo-captions.mp4', 'master/HeirloomDemo-silent.mp4', 'master/HeirloomDemo.srt', 'master/HeirloomDemo-mix.wav', ...T.scenes.map((s) => `scenes/${s.id}.mp4`)]
  .filter((f) => existsSync(join(OUT, f)))
  .map((f) => `| \`${f}\` | ${mb(join(OUT, f))} | ${f.endsWith('.srt') ? `${T.captions.length} cues` : `${(probe(join(OUT, f)) ?? 0).toFixed(2)} s`} |`);

const cues = [
  ['S01', word('S01', 'On'), 'tick', 'the single escapement tick on the dial'],
  ['S01', word('S01', 'Django'), 'whoosh', '"7 April 2026" gives way to "Django 4.2 · end of life"'],
  ['S02', word('S02', 'Debian'), 'plate', 'Debian 13 plate'],
  ['S02', word('S02', 'Ubuntu'), 'plate', 'Ubuntu 24.04 plate'],
  ['S02', word('S02', '19'), 'stamp', 'the NO 4.2 PATCH stamps run (19, 0.12 s apart)'],
  ['S02', word('S02', '4.2', 1) + 20, 'boom', 'counter: 19 advisories · 0 upstream 4.2 patches'],
  ['S03', word('S03', 'Five') + 4, 'stamp', 'Oct 6 plate slams onto Oct 1; the 5 DAYS band glows'],
  ['S03', word('S03', 'ran') - 30, 'type', 'noble probe log types; FAIL tokens flash red'],
  ['S03', word('S03', 'and') - 4, 'whoosh', 'the claim sentence fills the frame'],
  ['S04', sc('S04').start, 'whoosh', 'brass iris opens onto the Heirloom reveal'],
  ['S04', sc('S04').start + 110, 'seal', 'hallmark stamps in'],
  ['S05', word('S05', 'For') - 10, 'click', 'register → CVE-2026-6907 × 4.2.30 click (SH05)'],
  ['S05', word('S05', 'fails'), 'tick', 'U⁻ lights FAIL ×3'],
  ['S05', word('S05', 'passes'), 'tick', 'U⁺ lights PASS ×3'],
  ['S05', word('S05', 'affected'), 'stamp', 'verdict chip on Django 4.2.30'],
  ['S06', word('S06', '13') - 2, 'stamp', '13 candidate backports'],
  ['S06', word('S06', 'Where') - 2, 'stamp', '5 UNPROVEN · evidence filed'],
  ['S07', word('S07', 'sealed') - 10, 'seal', 'PRECEDENT P001 SEALED'],
  ['S08', sc('S08').start, 'whoosh', 'brass iris into the proof act'],
  ['S08', word('S08', 'called'), 'stamp', "naive pipeline's red 1"],
  ['S08', word('S08', 'Zero'), 'boom', "Heirloom's green 0"],
  ['S09', sc('S09').start + 30, 'tick', '$0.22 counter lands'],
  ['S10', T.totalFrames - 4 * FPS - 60, 'winddown', 'end card: the movement winds down'],
];

// the speech windows the music ducks under
const windows = T.scenes.map((s) => {
  const w = T.words[s.id];
  return [s.start + w[0][1], s.start + w[w.length - 1][2]];
});
const nl = existsSync(join(root, 'public/captures/NEATLOGS.mp4'));
const s8 = sc('S08');
const nlFrom = word('S08', 'Every') - 8;
const nlTo = word('S08', 'and') - 8;

const old = existsSync(join(OUT, 'EDIT-GUIDE.md')) ? readFileSync(join(OUT, 'EDIT-GUIDE.md'), 'utf8') : '';
let tail = old.includes('## Export for YouTube') ? old.slice(old.indexOf('## Export for YouTube')) : '';
const chapters = [
  ['S01', 'Django 4.2 reached end of life'],
  ['S03', 'The finding: Ubuntu 24.04'],
  ['S04', 'Heirloom'],
  ['S05', 'Never trust a test that hasn’t failed'],
  ['S06', 'The campaign: 19 advisories'],
  ['S07', 'One question, one precedent'],
  ['S08', 'Proof: backtest, traces, sessions'],
  ['S09', 'Economics'],
  ['S10', 'Old software, kept honest'],
];
if (tail.includes('> Chapters')) tail = tail.slice(0, tail.indexOf('> Chapters')) + '> Chapters\n' + chapters.map(([id, t]) => `> ${mmss(sc(id).start)} ${t}`).join('\n') + '\n';

const md = `# Heirloom demo film: edit guide

Generated by \`video/scripts/edit-guide-polish.mjs\` from \`video/timing-vo.json\` (**re-timed to the owner's VO**: \`~/video-in/vo/S01…S10.mp3\`, split at the paragraph starts).
Total: **${mmss(T.totalFrames)}** (${T.totalFrames} frames at ${FPS} fps, 1920×1080). Timecodes are \`MM:SS:FF\` at ${FPS} fps.

## Files

| File | Size | Duration |
|---|---|---|
${files.join('\n')}

- \`master/HeirloomDemo-FINAL.mp4\`: **the finished film**: picture + burned-in captions + VO + music, loudness-normalised for YouTube (loudnorm I = −14 LUFS, TP = −1.5 dBTP), AAC 320 kbps 48 kHz.
- \`master/HeirloomDemo-mix.mp4\`: the same audio on the clean picture (no burned captions). Upload this to YouTube with \`HeirloomDemo.srt\`.
- \`master/HeirloomDemo-mix.wav\`: the pre-normalisation mix (VO at −16 LUFS integrated, music under it), 24-bit, for your own edit.
- \`master/HeirloomDemo-captions.mp4\` / \`-silent.mp4\`: silent picture masters (H.264 High, yuv420p, BT.709, CRF 14 slow).
- \`scenes/S01…S10.mp4\`: each scene alone (silent). The masters are these scenes concatenated.
- \`stills/S01.png…\`: one key frame per scene.

## Scenes and VO placement

Each VO piece starts **0.4 s after its scene start**; scenes end 0.6 s after the piece (S10 holds the end card 4 s). Rebuild with \`node scripts/captions-from-words.mjs\` (timing + captions from \`words.json\`), then \`node scripts/render-polish.mjs scenes master captions stills && node scripts/mix.mjs\`.

| Scene | Start | End | Length | VO file → place at | Caption text (display) |
|---|---|---|---|---|---|
${T.scenes.map((s) => `| ${s.id} ${s.title} | ${tc(s.start)} | ${tc(s.start + s.frames)} | ${(s.frames / FPS).toFixed(2)} s | \`${s.id}.mp3\` (${s.voSeconds.toFixed(2)} s) → ${tc(s.start + Math.round(T.head * FPS))} | ${s.vo} |`).join('\n')}

## Music

- \`music.mp3\` starts at 00:00:00 and is trimmed at ${tc(T.totalFrames)}, with a **3 s fade-out ending on the last frame** of the end card.
- Levels (in \`out/mix.wav\`, before the YouTube loudnorm): about **−20 LUFS in the gaps**, ducked 8 dB to about **−28 LUFS while the VO speaks** (0.35 s ramps). VO at **−16 LUFS** integrated, limited at −1.5 dBFS.
- Duck windows (speech, from the word timestamps): ${windows.map(([a, b]) => `${tc(a)}–${tc(b)}`).join(', ')}.

## SFX cues (no SFX files were supplied: place these by hand if you generate them)

| # | Timecode | Scene | Name | On screen |
|---|---|---|---|---|
${cues.map(([id, f, n, what], i) => `| ${i + 1} | ${tc(f)} | ${id} | ${n} | ${what} |`).join('\n')}

Drop files named \`<name>.mp3\` into \`video/public/audio/sfx/\` and add \`{scene, frame, name}\` entries to \`timing-vo.json\` \`sfx\`; \`scripts/mix.mjs\` places them at −14 dB.

## The neatlogs slot

- **Where:** S08, **${tc(nlFrom)}–${tc(nlTo)}** (${((nlTo - nlFrom) / FPS).toFixed(2)} s), VO: “Every claim in every pull request links to its neatlogs trace”.
- **Now:** ${nl ? 'your recording (`public/captures/NEATLOGS.mp4`).' : 'GitHub PR #13’s claims table (real capture), pushing in on its **Span** column: each claim’s trace/span link. The neatlogs UI is never imitated.'}
- **To add your recording:** save 6–8 s of the real trace view as \`video/public/captures/NEATLOGS.mp4\` (1920×1080) and re-render S08 (\`node scripts/render-polish.mjs scenes --scenes=S08 && node scripts/render-polish.mjs master captions && node scripts/mix.mjs\`): it fills the same brass window.

## Captures used

| ID | Where |
|---|---|
| BR01 | S01 background (macro movement) |
| BR02 / R3D01 | S04 logo reveal background (R3D01 when V-CAP's 3D render is present) |
| SH01 / SH02 | S04 site hero (SH02 opens on the same hero when SH01 is missing) |
| SH04 | S03 right window: the site's finding section (plates lock, calibrated probe) |
| SH05 | S05 register → CVE-2026-6907 × 4.2.30 → receipt (on “For each advisory”) |
| SH02 → SH03 | S06 opening: hero scrolls to “Watch it work”, then the campaign dial |
| GH06 / SH10 / GH04 | S06 split windows: PR list (13), evidence locker (5 unproven), PR #21 stacked on #20 |
| SH07 / GH02 / GH03 | S07: question thread, issue #6 (question → /heirloom answer), PR #19 cites P001 |
| SH08 / GH01 / GH05 | S08: proof numbers, PR #13 claims (span links), the Entire-Checkpoint: trailer |
| SH09 / CFO01 | S09 economics cards, cfo.ai Base page |
| SH11 / BR03 | S10 finale (the site finale frame when SH11 is missing) |
| not used | EOL01 (no slot in the brief; light page), SH06 (method gear train), SHM (mobile), R3D02/R3D03 (not delivered in time) |

## What changed in the polish pass

- Re-timed to the owner's VO (2:27 instead of 2:45); every key beat in S03 and S05–S08 is anchored to the spoken word.
- Captions are word-accurate and show display text (7 April, 4.2, 13, 24.04, 19, 20 cents, neatlogs, cfo.ai).
- Split layouts: motion graphic left 40%, the real capture in a brass window right 60% (S03, S06, S07, S08); real footage carries S06–S08 throughout.
- S03 hits: plates slam with a stamp and shock ring, 5 DAYS glows, the noble log types token by token with FAIL flashes, the claim fills the frame.
- Iris transitions no longer show half-masked words; slow push-ins on every scene and capture window.
- The neatlogs slot shows PR #13's real span links instead of a placeholder card.
- Final mix: VO −16 LUFS, music ducked/swelled and faded with the end card, YouTube loudnorm −14 LUFS / −1.5 dBTP.

${tail}`;
writeFileSync(join(OUT, 'EDIT-GUIDE.md'), md);
console.log(`EDIT-GUIDE.md: ${T.scenes.length} scenes, ${cues.length} SFX cues, ${files.length} files`);
