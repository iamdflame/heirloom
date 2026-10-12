// Renders the deliverables into ~/video-out (or $VIDEO_OUT):
//   scenes/S01.mp4…S10.mp4 (silent) → concat (stream copy) → master/HeirloomDemo-silent.mp4
//   master/HeirloomDemo-captions.mp4 (burned captions), master/HeirloomDemo.srt
//   master/HeirloomDemo-mix.mp4 when public/audio/vo/*.mp3 exist; stills/S01.png…
// Usage: node scripts/render.mjs [scenes|master|captions|mix|stills|all]…  (default: all)
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const OUT = process.env.VIDEO_OUT ?? join(homedir(), 'video-out');
const steps = new Set(process.argv.slice(2).length ? process.argv.slice(2) : ['all']);
const want = (s) => steps.has('all') || steps.has(s);
const timing = JSON.parse(readFileSync(join(root, 'timing.json'), 'utf8'));
for (const d of ['master', 'scenes', 'stills']) mkdirSync(join(OUT, d), { recursive: true });

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(5)}s]`, ...a);

const serveUrl = await bundle({ entryPoint: join(root, 'src/index.ts'), publicDir: join(root, 'public') });
log('bundled');
const common = { codec: 'h264', crf: 14, x264Preset: 'slow', pixelFormat: 'yuv420p', colorSpace: 'bt709', concurrency: 8, imageFormat: 'jpeg', jpegQuality: 95 };
const comp = async (inputProps) => selectComposition({ serveUrl, id: 'HeirloomDemo', inputProps });

const silentProps = { captions: false, audio: false };
if (want('scenes') || want('master')) {
  const composition = await comp(silentProps);
  for (const s of timing.scenes) {
    const out = join(OUT, 'scenes', `${s.id}.mp4`);
    let last = 0;
    await renderMedia({
      ...common,
      composition,
      serveUrl,
      inputProps: silentProps,
      outputLocation: out,
      frameRange: [s.start, s.start + s.frames - 1],
      muted: true,
      onProgress: ({ progress }) => {
        if (progress - last > 0.25) { last = progress; log(`${s.id} ${(progress * 100).toFixed(0)}%`); }
      },
    });
    log(`scene ${s.id} done`);
  }
  const list = join(OUT, 'scenes', 'concat.txt');
  writeFileSync(list, timing.scenes.map((s) => `file '${join(OUT, 'scenes', `${s.id}.mp4`)}'`).join('\n') + '\n');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', join(OUT, 'master', 'HeirloomDemo-silent.mp4')]);
  log('master/HeirloomDemo-silent.mp4');
}

copyFileSync(join(root, 'captions.srt'), join(OUT, 'master', 'HeirloomDemo.srt'));

if (want('captions')) {
  const props = { captions: true, audio: false };
  const composition = await comp(props);
  let last = 0;
  await renderMedia({
    ...common,
    composition,
    serveUrl,
    inputProps: props,
    outputLocation: join(OUT, 'master', 'HeirloomDemo-captions.mp4'),
    muted: true,
    onProgress: ({ progress }) => { if (progress - last > 0.1) { last = progress; log(`captions ${(progress * 100).toFixed(0)}%`); } },
  });
  log('master/HeirloomDemo-captions.mp4');
}

const vo = existsSync(join(root, 'public/audio/vo')) && readdirSync(join(root, 'public/audio/vo')).some((f) => f.endsWith('.mp3'));
if (want('mix') && vo) {
  const props = { captions: false, audio: true };
  const composition = await comp(props);
  await renderMedia({ ...common, composition, serveUrl, inputProps: props, outputLocation: join(OUT, 'master', 'HeirloomDemo-mix.mp4'), audioCodec: 'aac', audioBitrate: '320k' });
  log('master/HeirloomDemo-mix.mp4');
} else if (want('mix')) log('mix skipped: no VO files in public/audio/vo');

if (want('stills')) {
  const KEY = { S01: 6.6, S02: 10.6, S03: 18.6, S04: 5.8, S05: 10.8, S06: 10.4, S07: 11.8, S08: 8.8, S09: 3.2, S10: 12.5 };
  const composition = await comp(silentProps);
  for (const s of timing.scenes) {
    const frame = s.start + Math.min(s.frames - 1, Math.round(KEY[s.id] * 60 * s.scale));
    await renderStill({ composition, serveUrl, inputProps: silentProps, frame, output: join(OUT, 'stills', `${s.id}.png`), imageFormat: 'png' });
  }
  log('stills');
}
log('done');
