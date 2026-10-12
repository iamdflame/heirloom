import { continueRender, delayRender, staticFile } from 'remotion';

const FACES: [string, string, string, string][] = [
  ['Instrument Serif', 'fonts/instrument-serif-400-normal.woff2', '400', 'normal'],
  ['Instrument Serif', 'fonts/instrument-serif-400-italic.woff2', '400', 'italic'],
  ['Geist', 'fonts/geist-wght400-600.woff2', '400 600', 'normal'],
  ['Geist Mono', 'fonts/geist-mono-wght400-500.woff2', '400 500', 'normal'],
];

let loaded = false;
export function loadFonts() {
  if (loaded || typeof document === 'undefined') return;
  loaded = true;
  const handle = delayRender('fonts');
  Promise.all(
    FACES.map(([family, file, weight, style]) => {
      const face = new FontFace(family, `url(${staticFile(file)}) format('woff2')`, { weight, style });
      return face.load().then((f) => (document.fonts as unknown as Set<FontFace>).add(f));
    }),
  )
    .then(() => continueRender(handle))
    .catch((e) => {
      console.error(e);
      continueRender(handle);
    });
}
