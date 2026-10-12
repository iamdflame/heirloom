// Renders the VO-timed cut (src/polish, timing-vo.json) into ~/video-out (or $VIDEO_OUT):
//   scenes  → scenes/S01.mp4…S10.mp4 (silent, H.264 High CRF 14 slow, BT.709)   [--scenes=S03,S06]
//   master  → concat (stream copy) → master/HeirloomDemo-silent.mp4
//   captions→ scripts/captions-burn.mjs (cue PNGs overlaid) → master/HeirloomDemo-captions.mp4, + .srt
//   stills  → stills/S01.png… (key frames)
//   sample  → out/sample.mp4: 5 s of S06 (the capture-heaviest scene) for the speed check
// Scenes can be split across processes: run several `node scripts/render-polish.mjs scenes --scenes=…` in parallel.
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const OUT = process.env.VIDEO_OUT ?? join(homedir(), 'video-out');
const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--scenes=')) ?? '').replace('--scenes=', '').split(',').filter(Boolean);
const steps = new Set(args.filter((a) => !a.startsWith('--')));
const timing = JSON.parse(readFileSync(join(root, 'timing-vo.json'), 'utf8'));
for (const d of ['master', 'scenes', 'stills']) mkdirSync(join(OUT, d), { recursive: true });
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(5)}s]`, ...a);

const serveUrl = await bundle({ entryPoint: join(root, 'src/polish/index.ts'), publicDir: join(root, 'public') });
log('bundled');
const common = { codec: 'h264', crf: 14, x264Preset: 'slow', pixelFormat: 'yuv420p', colorSpace: 'bt709', concurrency: Number(process.env.CONC ?? 8), imageFormat: 'jpeg', jpegQuality: 95, muted: true, timeoutInMilliseconds: 120000 };
const props = { captions: false };
const composition = await selectComposition({ serveUrl, id: 'HeirloomDemo', inputProps: props });

if (steps.has('sample')) {
  const s = timing.scenes.find((x) => x.id === 'S06');
  const t = Date.now();
  await renderMedia({ ...common, composition, serveUrl, inputProps: props, outputLocation: join(root, 'out/sample.mp4'), frameRange: [s.start + 120, s.start + 419] });
  const sec = (Date.now() - t) / 1000;
  log(`sample: 300 frames in ${sec.toFixed(1)} s → ${(300 / sec).toFixed(1)} fps; full ${timing.totalFrames} frames ≈ ${((timing.totalFrames / (300 / sec)) / 60).toFixed(1)} min`);
}
if (steps.has('scenes')) {
  for (const s of timing.scenes) {
    if (only.length && !only.includes(s.id)) continue;
    let last = 0;
    await renderMedia({
      ...common,
      composition,
      serveUrl,
      inputProps: props,
      outputLocation: join(OUT, 'scenes', `${s.id}.mp4`),
      frameRange: [s.start, s.start + s.frames - 1],
      onProgress: ({ progress }) => {
        if (progress - last > 0.25) { last = progress; log(`${s.id} ${(progress * 100).toFixed(0)}%`); }
      },
    });
    log(`scene ${s.id} done`);
  }
}
const master = join(OUT, 'master', 'HeirloomDemo-silent.mp4');
if (steps.has('master')) {
  const list = join(OUT, 'scenes', 'concat.txt');
  writeFileSync(list, timing.scenes.map((s) => `file '${join(OUT, 'scenes', `${s.id}.mp4`)}'`).join('\n') + '\n');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', master]);
  log('master/HeirloomDemo-silent.mp4');
}
if (steps.has('captions')) {
  copyFileSync(join(root, 'captions.srt'), join(OUT, 'master', 'HeirloomDemo.srt'));
  // per-cue transparent PNGs overlaid by ffmpeg (the ProRes 4444 layer came out without alpha on this box)
  execFileSync('node', [join(root, 'scripts/captions-burn.mjs')], { stdio: 'inherit' });
  log('master/HeirloomDemo-captions.mp4');
}
if (steps.has('stills')) {
  const KEY = { S01: 5.5, S02: 11.5, S03: 17.0, S04: 6.0, S05: 16.5, S06: 9.5, S07: 11.5, S08: 8.8, S09: 2.8, S10: 8.5 };
  for (const s of timing.scenes) {
    const frame = s.start + Math.min(s.frames - 1, Math.round(KEY[s.id] * 60));
    await renderStill({ composition, serveUrl, inputProps: props, frame, output: join(OUT, 'stills', `${s.id}.png`), imageFormat: 'png' });
  }
  log('stills');
}
log('done');
