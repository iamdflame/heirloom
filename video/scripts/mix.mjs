// The final audio mix with ffmpeg (no Remotion audio render needed):
//   VO pieces public/audio/vo/S01..S10.mp3 placed at scene start + head (timing.json), gain to −16 LUFS integrated,
//   limited at −1.5 dBTP;
//   music.mp3 from 0: about −20 LUFS in the gaps, ducked 8 dB (≈ −28 LUFS) while the VO speaks (0.35 s ramps, from
//   the per-word timestamps), faded over the last 3 s so it ends with the end card;
//   SFX public/audio/sfx/<name>.mp3 on the timing.json cues at −14 dB (if any exist).
// Outputs: out/mix.wav (VO at −16 LUFS: the stem for the owner), and with the masters present:
//   master/HeirloomDemo-FINAL.mp4 (captions picture + mix, loudnorm I=−14 TP=−1.5 for YouTube)
//   master/HeirloomDemo-mix.mp4   (clean picture + the same audio; upload with the .srt)
// Usage: node scripts/mix.mjs [voDir-with-words.json]
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const OUT = process.env.VIDEO_OUT ?? join(homedir(), 'video-out');
const wordsDir = process.argv[2] ?? join(homedir(), 'video-in/vo');
const tmp = join(root, 'out/mix');
mkdirSync(tmp, { recursive: true });
const timing = JSON.parse(readFileSync(join(root, 'timing-vo.json'), 'utf8'));
const FPS = timing.fps;
const total = timing.totalFrames / FPS;
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 });
const measure = (file) => {
  const r = execFileSync('bash', ['-c', `ffmpeg -hide_banner -nostats -i '${file}' -af ebur128=peak=true -f null - 2>&1`], { encoding: 'utf8' });
  const I = Number(r.match(/Integrated loudness:\s+I:\s+(-?[\d.]+)/)[1]);
  const TP = Number(r.match(/True peak:\s+Peak:\s+(-?[\d.]+|-inf)/)[1]);
  return { I, TP };
};
const log = (...a) => console.log('[mix]', ...a);

// 1. VO: pieces at their scene starts
const vo = timing.scenes.filter((s) => s.voFile && existsSync(join(root, 'public', s.voFile)));
if (!vo.length) { log('no VO files in public/audio/vo: nothing to mix'); process.exit(0); }
const voRaw = join(tmp, 'vo-raw.wav');
ff([
  ...vo.flatMap((s) => ['-i', join(root, 'public', s.voFile)]),
  '-filter_complex',
  vo.map((s, i) => `[${i}:a]aresample=48000,pan=stereo|c0=c0|c1=c0,adelay=${Math.round((s.start / FPS + timing.head) * 1000)}:all=1[v${i}]`).join(';') +
    `;${vo.map((_, i) => `[v${i}]`).join('')}amix=inputs=${vo.length}:normalize=0,apad=whole_dur=${total}[out]`,
  '-map', '[out]', '-t', String(total), '-c:a', 'pcm_s24le', voRaw,
]);
const m0 = measure(voRaw);
const voGain = -16 - m0.I;
const voWav = join(tmp, 'vo.wav');
ff(['-i', voRaw, '-af', `volume=${voGain.toFixed(2)}dB,alimiter=limit=${Math.pow(10, -1.5 / 20).toFixed(4)}:attack=2:release=60:level=disabled`, '-c:a', 'pcm_s24le', voWav]);
log('VO', m0, `gain ${voGain.toFixed(2)} dB →`, measure(voWav));

// 2. speech windows from the word timestamps (master time)
const words = JSON.parse(readFileSync(join(wordsDir, 'words.json'), 'utf8'));
const split = JSON.parse(readFileSync(join(wordsDir, 'split.json'), 'utf8'));
const windows = [];
for (const s of timing.scenes) {
  const sp = split.find((x) => x.scene === s.id);
  const ws = words.filter((w) => w.s >= sp.start - 0.05 && w.s < sp.end - 0.05);
  const at = (t) => s.start / FPS + timing.head + t - sp.start;
  // phrases: merge words separated by < 0.9 s
  let cur = null;
  for (const w of ws) {
    if (cur && w.s - cur[1] < 0.9) cur[1] = w.e;
    else { if (cur) windows.push(cur.map(at)); cur = [w.s, w.e]; }
  }
  if (cur) windows.push(cur.map(at));
}

// 3. music: −20 LUFS gap level, −8 dB under speech, 3 s fade out to the last frame
const music = [join(root, 'public/audio/music.mp3'), join(homedir(), 'video-in/music.mp3')].find(existsSync);
const parts = [];
let musicWav = null;
if (music) {
  const mm = measure(music);
  const gap = -20 - mm.I;
  const R = 0.35;
  const duck = windows.map(([a, b]) => `clip(min((t-${(a - R).toFixed(3)})/${R},(${(b + R).toFixed(3)}-t)/${R}),0,1)`).reduce((x, y) => `max(${x},${y})`);
  musicWav = join(tmp, 'music.wav');
  ff(['-i', music, '-af', `aresample=48000,atrim=0:${total},volume='pow(10,(${gap.toFixed(2)}-8*${duck})/20)':eval=frame,afade=t=out:st=${(total - 3).toFixed(3)}:d=3,apad=whole_dur=${total}`, '-t', String(total), '-c:a', 'pcm_s24le', musicWav]);
  log('music', mm, `gap gain ${gap.toFixed(2)} dB, ${windows.length} duck windows →`, measure(musicWav));
}

// 4. SFX on cue
const sfxDir = join(root, 'public/audio/sfx');
const sfx = existsSync(sfxDir) ? (timing.sfx ?? []).filter((c) => existsSync(join(sfxDir, `${c.name}.mp3`))) : [];

const inputs = ['-i', voWav, ...(musicWav ? ['-i', musicWav] : []), ...sfx.flatMap((c) => ['-i', join(sfxDir, `${c.name}.mp3`)])];
const n = 1 + (musicWav ? 1 : 0);
const fx = sfx.map((c, i) => `[${n + i}:a]aresample=48000,volume=-14dB,adelay=${Math.round((c.frame / FPS) * 1000)}:all=1[s${i}]`);
const mixWav = join(root, 'out/mix.wav');
ff([
  ...inputs,
  '-filter_complex',
  [...fx, `${Array.from({ length: n }, (_, i) => `[${i}:a]`).join('')}${sfx.map((_, i) => `[s${i}]`).join('')}amix=inputs=${n + sfx.length}:normalize=0,atrim=0:${total}[out]`].join(';'),
  '-map', '[out]', '-c:a', 'pcm_s24le', mixWav,
]);
log('mix.wav', measure(mixWav), `${sfx.length} SFX`);
mkdirSync(join(OUT, 'master'), { recursive: true });
copyFileSync(mixWav, join(OUT, 'master/HeirloomDemo-mix.wav'));

// 5. YouTube loudness (two-pass loudnorm) and the muxes
const pass1 = execFileSync('bash', ['-c', `ffmpeg -hide_banner -nostats -i '${mixWav}' -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1`], { encoding: 'utf8' });
const j = JSON.parse(pass1.slice(pass1.lastIndexOf('{'), pass1.lastIndexOf('}') + 1));
const finalWav = join(tmp, 'final.wav');
ff(['-i', mixWav, '-af', `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true,aresample=48000`, '-c:a', 'pcm_s24le', finalWav]);
log('final (loudnorm)', measure(finalWav));

const mux = (video, out) => {
  if (!existsSync(video)) return log(`skip ${out}: ${video} missing`);
  ff(['-i', video, '-i', finalWav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-t', String(total), '-movflags', '+faststart', out]);
  log(out);
};
mux(join(OUT, 'master/HeirloomDemo-captions.mp4'), join(OUT, 'master/HeirloomDemo-FINAL.mp4'));
mux(join(OUT, 'master/HeirloomDemo-silent.mp4'), join(OUT, 'master/HeirloomDemo-mix.mp4'));
