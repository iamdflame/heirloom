import * as THREE from 'three';

// Canvas-generated engraving for the medallion: a guilloché rosette (overlapping sinusoidal
// rings, the barleycorn cut of a rose engine) around a plain polished cartouche, an outer
// ring of fine radial "sunburst" cuts, and a thin chapter ring. White = raised, black = cut.

export interface Engraving {
  bump: THREE.CanvasTexture;
  rough: THREE.CanvasTexture;
  dispose(): void;
}

export function engraveMedallion(size = 1024): Engraving {
  const bumpC = document.createElement('canvas');
  bumpC.width = bumpC.height = size;
  const b = bumpC.getContext('2d')!;
  const c = size / 2;
  const R = size / 2;
  b.fillStyle = '#fff';
  b.fillRect(0, 0, size, size);
  b.translate(c, c);
  b.lineCap = 'round';

  // rosette: 44 rings of a 24-petal wave, each phase-shifted so the crossings form a lattice
  const inner = R * 0.36;
  const outer = R * 0.74;
  const rings = 44;
  b.strokeStyle = '#000';
  b.lineWidth = size / 1000;
  for (let i = 0; i < rings; i++) {
    const base = inner + ((outer - inner) * i) / rings;
    const amp = R * 0.03;
    b.beginPath();
    for (let s = 0; s <= 1440; s++) {
      const t = (s / 1440) * Math.PI * 2;
      const r = base + amp * Math.sin(24 * t + i * 0.28);
      const x = r * Math.cos(t);
      const y = r * Math.sin(t);
      if (s === 0) b.moveTo(x, y);
      else b.lineTo(x, y);
    }
    b.stroke();
  }
  // sunburst band
  b.lineWidth = size / 1400;
  for (let i = 0; i < 360; i++) {
    const t = (i / 360) * Math.PI * 2;
    b.beginPath();
    b.moveTo(R * 0.79 * Math.cos(t), R * 0.79 * Math.sin(t));
    b.lineTo(R * 0.93 * Math.cos(t), R * 0.93 * Math.sin(t));
    b.stroke();
  }
  // chapter rings (deep cuts)
  b.lineWidth = size / 260;
  for (const rr of [0.76, 0.955]) {
    b.beginPath();
    b.arc(0, 0, R * rr, 0, Math.PI * 2);
    b.stroke();
  }
  b.lineWidth = size / 500;
  b.beginPath();
  b.arc(0, 0, R * 0.335, 0, Math.PI * 2);
  b.stroke();
  // minute track ticks inside the outer ring
  b.lineWidth = size / 420;
  for (let i = 0; i < 60; i++) {
    const t = (i / 60) * Math.PI * 2;
    const r0 = i % 5 === 0 ? 0.915 : 0.935;
    b.beginPath();
    b.moveTo(R * r0 * Math.cos(t), R * r0 * Math.sin(t));
    b.lineTo(R * 0.95 * Math.cos(t), R * 0.95 * Math.sin(t));
    b.stroke();
  }
  // soften so the bump reads as V-cuts, not aliasing
  const soft = document.createElement('canvas');
  soft.width = soft.height = size;
  const sctx = soft.getContext('2d')!;
  sctx.filter = `blur(${size / 1400}px)`;
  sctx.drawImage(bumpC, 0, 0);

  // roughness: the cartouche and rings polished, engraved field satin
  const roughC = document.createElement('canvas');
  roughC.width = roughC.height = size;
  const r = roughC.getContext('2d')!;
  r.fillStyle = 'rgb(80,80,80)';
  r.fillRect(0, 0, size, size);
  r.translate(c, c);
  r.fillStyle = 'rgb(30,30,30)';
  r.beginPath();
  r.arc(0, 0, R * 0.33, 0, Math.PI * 2);
  r.fill();
  r.globalAlpha = 0.6;
  r.drawImage(soft, -c, -c);

  const bump = new THREE.CanvasTexture(soft);
  const rough = new THREE.CanvasTexture(roughC);
  for (const t of [bump, rough]) {
    t.anisotropy = 8;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  }
  return {
    bump,
    rough,
    dispose() {
      bump.dispose();
      rough.dispose();
    },
  };
}

/** A Didone serif "H" as a shape (cap height 1, centred on the origin). */
export function hallmarkH(): THREE.Shape {
  const s = new THREE.Shape();
  const W = 0.86; // overall width
  const stem = 0.15; // thick stems
  const serif = 0.035; // hairline serif thickness
  const sw = 0.1; // serif overhang
  const bar = 0.06; // crossbar
  const L = -W / 2 + sw; // left stem outer x
  const Rr = W / 2 - sw; // right stem outer x
  const top = 0.5;
  const bot = -0.5;
  const br = 0.05; // bracket radius
  // walk the outline counter-clockwise starting bottom-left serif
  s.moveTo(L - sw, bot);
  s.lineTo(L + stem + sw, bot);
  s.lineTo(L + stem + sw, bot + serif);
  s.quadraticCurveTo(L + stem, bot + serif, L + stem, bot + serif + br);
  s.lineTo(L + stem, -bar / 2);
  s.lineTo(Rr - stem, -bar / 2);
  s.lineTo(Rr - stem, bot + serif + br);
  s.quadraticCurveTo(Rr - stem, bot + serif, Rr - stem - sw, bot + serif);
  s.lineTo(Rr - stem - sw, bot);
  s.lineTo(Rr + sw, bot);
  s.lineTo(Rr + sw, bot + serif);
  s.quadraticCurveTo(Rr, bot + serif, Rr, bot + serif + br);
  s.lineTo(Rr, top - serif - br);
  s.quadraticCurveTo(Rr, top - serif, Rr + sw, top - serif);
  s.lineTo(Rr + sw, top);
  s.lineTo(Rr - stem - sw, top);
  s.lineTo(Rr - stem - sw, top - serif);
  s.quadraticCurveTo(Rr - stem, top - serif, Rr - stem, top - serif - br);
  s.lineTo(Rr - stem, bar / 2);
  s.lineTo(L + stem, bar / 2);
  s.lineTo(L + stem, top - serif - br);
  s.quadraticCurveTo(L + stem, top - serif, L + stem + sw, top - serif);
  s.lineTo(L + stem + sw, top);
  s.lineTo(L - sw, top);
  s.lineTo(L - sw, top - serif);
  s.quadraticCurveTo(L, top - serif, L, top - serif - br);
  s.lineTo(L, bot + serif + br);
  s.quadraticCurveTo(L, bot + serif, L - sw, bot + serif);
  s.lineTo(L - sw, bot);
  return s;
}

/** Perlage (circular graining) for the main plate: overlapping spun spots in offset rows. Tileable. */
export function perlage(size = 512, spots = 6): { bump: THREE.CanvasTexture; dispose(): void } {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);
  const step = size / spots;
  const rad = step * 0.72;
  for (let row = -1; row <= spots + 1; row++) {
    for (let col = -1; col <= spots + 1; col++) {
      const cx = col * step + (row % 2 ? step / 2 : 0);
      const cy = row * step * 0.87;
      // each spot: fine concentric scratches with a bright rim
      for (let k = 0; k < 18; k++) {
        const rr = rad * (1 - k / 18);
        g.strokeStyle = `rgba(${k % 2 ? 255 : 0},${k % 2 ? 255 : 0},${k % 2 ? 255 : 0},0.16)`;
        g.lineWidth = rad / 16;
        g.beginPath();
        g.arc(cx, cy, rr, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,0.0)';
    }
  }
  const bump = new THREE.CanvasTexture(cv);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.anisotropy = 8;
  return { bump, dispose: () => bump.dispose() };
}
