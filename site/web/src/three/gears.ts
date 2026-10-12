import * as THREE from 'three';

// Procedural watch wheels. Every wheel in a train shares one module `m` (tooth size), so the
// pitch radius is m·N/2 and two wheels mesh when their centres sit m·(N1+N2)/2 apart.

const PRESSURE = (20 * Math.PI) / 180;
const inv = (a: number) => Math.tan(a) - a;

export interface WheelSpec {
  teeth: number;
  spokes: number; // 0 = solid web with round lightening holes, -1 = pinion (solid)
  thickness: number;
}

export interface Placed extends WheelSpec {
  x: number;
  z: number;
  phase: number; // angle at driver angle 0
  ratio: number; // dθ/dθ_driver (negative for opposite rotation)
  parent: number;
}

/** The involute tooth outline (the wheel's rim) as a closed polyline, counter-clockwise. */
function toothOutline(N: number, m: number): THREE.Vector2[] {
  const r = (m * N) / 2;
  const rb = r * Math.cos(PRESSURE);
  const ra = r + 0.92 * m; // slightly short addendum reads more "horological"
  const rd = r - 1.2 * m;
  const pitchHalf = Math.PI / (2 * N);
  const halfAngle = (R: number) => {
    const Rc = Math.max(R, rb);
    return pitchHalf + inv(PRESSURE) - inv(Math.acos(rb / Rc));
  };
  const pts: THREE.Vector2[] = [];
  const S = 6;
  for (let k = 0; k < N; k++) {
    const c = (2 * Math.PI * k) / N;
    // root arc between the previous tooth's trailing flank and this tooth's leading flank
    const h = halfAngle(rd);
    for (const t of [0.25, 0.5, 0.75]) {
      const a = c - (2 * Math.PI) / N + h + (2 * Math.PI / N - 2 * h) * t;
      pts.push(new THREE.Vector2(rd * Math.cos(a), rd * Math.sin(a)));
    }
    // leading flank (rd → ra)
    for (let i = 0; i <= S; i++) {
      const R = rd + ((ra - rd) * i) / S;
      const a = c - halfAngle(R);
      pts.push(new THREE.Vector2(R * Math.cos(a), R * Math.sin(a)));
    }
    // tip
    pts.push(new THREE.Vector2(ra * Math.cos(c), ra * Math.sin(c)));
    // trailing flank (ra → rd)
    for (let i = S; i >= 0; i--) {
      const R = rd + ((ra - rd) * i) / S;
      const a = c + halfAngle(R);
      pts.push(new THREE.Vector2(R * Math.cos(a), R * Math.sin(a)));
    }
  }
  return pts;
}

/** An annular sector between two straight spokes, with rounded corners. */
function spokeWindow(a0: number, a1: number, rIn: number, rOut: number, halfW: number, fillet: number): THREE.Path {
  const p = new THREE.Path();
  const off = (R: number) => Math.asin(Math.min(0.95, halfW / R));
  const o0 = a0 + off(rOut);
  const o1 = a1 - off(rOut);
  const i0 = a0 + off(rIn);
  const i1 = a1 - off(rIn);
  const at = (R: number, a: number) => new THREE.Vector2(R * Math.cos(a), R * Math.sin(a));
  const f = fillet;
  const fo = f / rOut;
  const fi = f / rIn;
  // outer arc (clockwise holes are fine: three.js normalises winding)
  const start = at(rOut - f, o0);
  p.moveTo(start.x, start.y);
  const c0 = at(rOut, o0);
  const s0 = at(rOut, o0 + fo);
  p.quadraticCurveTo(c0.x, c0.y, s0.x, s0.y);
  p.absarc(0, 0, rOut, o0 + fo, o1 - fo, false);
  const c1 = at(rOut, o1);
  const e1 = at(rOut - f, o1);
  p.quadraticCurveTo(c1.x, c1.y, e1.x, e1.y);
  const e2 = at(rIn + f, i1);
  p.lineTo(e2.x, e2.y);
  const c2 = at(rIn, i1);
  const s2 = at(rIn, i1 - fi);
  p.quadraticCurveTo(c2.x, c2.y, s2.x, s2.y);
  p.absarc(0, 0, rIn, i1 - fi, i0 + fi, true);
  const c3 = at(rIn, i0);
  const e3 = at(rIn + f, i0);
  p.quadraticCurveTo(c3.x, c3.y, e3.x, e3.y);
  p.lineTo(start.x, start.y);
  return p;
}

export function wheelShape(spec: WheelSpec, m: number): THREE.Shape {
  const shape = new THREE.Shape(toothOutline(spec.teeth, m));
  const r = (m * spec.teeth) / 2;
  const rd = r - 1.2 * m;
  const rim = Math.max(m * 1.6, r * 0.12);
  const hub = Math.max(m * 2.2, r * 0.2);
  const arbor = spec.spokes < 0 ? m * 0.9 : Math.max(m * 0.7, r * 0.05);
  if (spec.spokes < 0) {
    // pinion: solid leaves, just the arbor bore
  } else if (spec.spokes > 0) {
    const rIn = hub + m * 0.6;
    const rOut = rd - rim;
    const halfW = Math.max(m * 0.45, r * 0.045);
    for (let s = 0; s < spec.spokes; s++) {
      const a0 = (2 * Math.PI * s) / spec.spokes + 0.15;
      const a1 = (2 * Math.PI * (s + 1)) / spec.spokes + 0.15;
      shape.holes.push(spokeWindow(a0, a1, rIn, rOut, halfW, Math.min(m * 0.5, (rOut - rIn) * 0.2)));
    }
  } else {
    const ring = (hub + rd - rim) / 2;
    const hr = (rd - rim - hub) / 2.6;
    for (let s = 0; s < 5; s++) {
      const a = (2 * Math.PI * s) / 5;
      const h = new THREE.Path();
      h.absarc(ring * Math.cos(a), ring * Math.sin(a), hr, 0, Math.PI * 2, true);
      shape.holes.push(h);
    }
  }
  const bore = new THREE.Path();
  bore.absarc(0, 0, arbor, 0, Math.PI * 2, true);
  shape.holes.push(bore);
  return shape;
}

/** Extruded, bevelled wheel lying in the XZ plane, top face at y = thickness. */
export function wheelGeometry(spec: WheelSpec, m: number): THREE.BufferGeometry {
  const bevel = Math.min(spec.thickness * 0.2, m * 0.32);
  const g = new THREE.ExtrudeGeometry(wheelShape(spec, m), {
    depth: spec.thickness - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelOffset: -bevel * 0.8,
    bevelSegments: 3,
    curveSegments: 24,
  });
  g.translate(0, 0, bevel);
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/**
 * Place a train: each entry names its parent and the direction (radians, in the XZ plane) from
 * the parent's centre. Returns centres, the rotation ratio and the starting phase that makes
 * the teeth interleave (tooth of one wheel sits in a gap of the other at the contact point).
 */
export function placeTrain(
  m: number,
  root: WheelSpec & { x: number; z: number },
  links: (WheelSpec & { parent: number; dir: number })[],
): Placed[] {
  const out: Placed[] = [{ ...root, phase: 0, ratio: 1, parent: -1 }];
  const pitchArc = Math.PI * m;
  for (const l of links) {
    const p = out[l.parent]!;
    const rp = (m * p.teeth) / 2;
    const rc = (m * l.teeth) / 2;
    const d = rp + rc;
    // Rotation is about +Y; in XZ with angle a measured as (cos a, -sin a) so that a positive
    // rotation about Y advances the angle (right-handed).
    const x = p.x + d * Math.cos(l.dir);
    const z = p.z - d * Math.sin(l.dir);
    const sp = rp * (l.dir - p.phase);
    const phase = l.dir + Math.PI - (pitchArc / 2 - sp) / rc;
    out.push({ ...l, x, z, phase, ratio: (-p.ratio * p.teeth) / l.teeth });
  }
  return out;
}
