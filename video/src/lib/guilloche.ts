// Guilloché line-work: the engine-turned engraving on watch dials and banknotes.
// Pure path generators, shared by scripts/guilloche.mjs (static SVGs) and the page (inline SVG).

const f = (n: number) => (Math.round(n * 100) / 100).toString();

/** One closed polar curve r(θ) = r + amp·sin(lobes·θ + phase), as an SVG path. */
function polar(cx: number, cy: number, r: number, amp: number, lobes: number, phase: number, steps: number) {
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const rr = r + amp * Math.sin(lobes * t + phase);
    d += `${i ? 'L' : 'M'}${f(cx + rr * Math.cos(t))} ${f(cy + rr * Math.sin(t))}`;
  }
  return d + 'Z';
}

/**
 * A rosette: `copies` phase-shifted polar curves spread over one lobe, so they cross into the
 * familiar moiré. Returns one path per copy (so each can be drawn in on its own).
 */
export function rosette({
  cx = 50,
  cy = 50,
  r = 40,
  amp = 4,
  lobes = 24,
  copies = 10,
  steps = 360,
}: { cx?: number; cy?: number; r?: number; amp?: number; lobes?: number; copies?: number; steps?: number } = {}) {
  // the copies are shifted across one full period of the sine, so they braid into the moiré
  return Array.from({ length: copies }, (_, k) => polar(cx, cy, r, amp, lobes, (k / copies) * Math.PI * 2, steps));
}

/** A band of `copies` phase-shifted sine waves across [0, width], centred on y. */
export function waveBand({
  width = 1200,
  y = 12,
  amp = 6,
  wavelength = 48,
  copies = 6,
  step = 4,
}: { width?: number; y?: number; amp?: number; wavelength?: number; copies?: number; step?: number } = {}) {
  return Array.from({ length: copies }, (_, k) => {
    const ph = (k / copies) * Math.PI;
    let d = '';
    for (let x = 0; x <= width; x += step) d += `${x ? 'L' : 'M'}${f(x)} ${f(y + amp * Math.sin((x / wavelength) * Math.PI * 2 + ph))}`;
    return d;
  });
}

/** The hallmark "H": a slab-serif capital built from rectangles, centred in a 100×100 box. */
export const HALLMARK_H =
  'M37 34h5.4v32h-5.4ZM57.6 34h5.4v32h-5.4ZM40 48.2h20v3.6h-20ZM33.4 32.4h12.6v2.6h-12.6ZM33.4 65h12.6v2.6h-12.6ZM54 32.4h12.6v2.6h-12.6ZM54 65h12.6v2.6h-12.6Z';

/** The hallmark's ring: a rosette band between r 37 and 45 in the 100×100 box. */
export const hallmarkRing = (copies = 6, steps = 240) => rosette({ r: 41, amp: 3.2, lobes: 18, copies, steps });
