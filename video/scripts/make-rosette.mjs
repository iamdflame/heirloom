// Pre-engraves the ground watermark as a static SVG (rasterised once by the browser, then just rotated).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const f = (n) => (Math.round(n * 100) / 100).toString();
function rosette({ cx = 50, cy = 50, r = 40, amp = 4, lobes = 24, copies = 10, steps = 360 }) {
  return Array.from({ length: copies }, (_, k) => {
    let d = '';
    const phase = (k / copies) * Math.PI * 2;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const rr = r + amp * Math.sin(lobes * t + phase);
      d += `${i ? 'L' : 'M'}${f(cx + rr * Math.cos(t))} ${f(cy + rr * Math.sin(t))}`;
    }
    return d + 'Z';
  });
}
const paths = rosette({ r: 40, amp: 3, lobes: 36, copies: 14, steps: 720 });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="1500" height="1500"><g fill="none" stroke="#C8A86A" stroke-width="0.06">${paths.map((d) => `<path d="${d}"/>`).join('')}</g></svg>`;
writeFileSync(join(import.meta.dirname, '..', 'public/rosette-ground.svg'), svg);
console.log('public/rosette-ground.svg', svg.length, 'bytes');
