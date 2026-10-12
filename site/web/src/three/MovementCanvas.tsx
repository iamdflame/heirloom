import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { placeTrain, wheelGeometry, type Placed } from './gears';
import { engraveMedallion, hallmarkH, perlage } from './guilloche';
import type { HeroSceneProps } from './HeroScene';

const M = 0.055; // module shared by the whole train
const BRASS = '#C8A86A';
const BRASS_DEEP = '#8A6F3E';
const BASE_SPEED = 0.22; // driver rad/s at rest
const PARALLAX = (4 * Math.PI) / 180;

const TRAIN = placeTrain(M, { teeth: 110, spokes: 5, thickness: 0.16, x: 0, z: 0 }, [
  { parent: 0, dir: -0.45, teeth: 28, spokes: 0, thickness: 0.18 },
  { parent: 1, dir: -0.05, teeth: 64, spokes: 6, thickness: 0.14 },
  { parent: 0, dir: 0.95, teeth: 40, spokes: 4, thickness: 0.16 },
  { parent: 3, dir: 0.15, teeth: 22, spokes: 0, thickness: 0.2 },
  { parent: 0, dir: 1.65, teeth: 48, spokes: 5, thickness: 0.14 },
  { parent: 0, dir: 4.55, teeth: 32, spokes: 4, thickness: 0.16 },
]);

function useBrass() {
  return useMemo(() => {
    const brass = new THREE.MeshPhysicalMaterial({ color: BRASS, metalness: 1, roughness: 0.28 });
    const deep = new THREE.MeshPhysicalMaterial({ color: BRASS_DEEP, metalness: 1, roughness: 0.34 });
    const steel = new THREE.MeshPhysicalMaterial({ color: '#8F9296', metalness: 1, roughness: 0.24 });
    const ruby = new THREE.MeshPhysicalMaterial({
      color: '#7A0F1A',
      metalness: 0,
      roughness: 0.05,
      transmission: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      sheen: 0,
    });
    return { brass, deep, steel, ruby };
  }, []);
}

function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.5;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
      room.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        (mesh.material as THREE.Material | undefined)?.dispose?.();
      });
    };
  }, [gl, scene]);
  return null;
}

function Wheel({ w, angle, mat, steel, ruby }: { w: Placed; angle: { current: number }; mat: THREE.Material; steel: THREE.Material; ruby: THREE.Material }) {
  const geo = useMemo(() => wheelGeometry(w, M), [w]);
  const ref = useRef<THREE.Group>(null);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame(() => {
    if (ref.current) ref.current.rotation.y = w.phase + w.ratio * angle.current;
  });
  const r = (M * w.teeth) / 2;
  const arbor = Math.max(M * 0.7, r * 0.05);
  return (
    <group position={[w.x, 0, w.z]}>
      <group ref={ref}>
        <mesh geometry={geo} material={mat} />
      </group>
      {/* arbor with a steel collet and a jewel bearing */}
      <mesh material={steel} position={[0, w.thickness / 2, 0]}>
        <cylinderGeometry args={[arbor * 0.98, arbor * 0.98, w.thickness + 0.4, 24]} />
      </mesh>
      <mesh material={steel} position={[0, w.thickness + (w.parent >= 0 ? 0.16 : 0) + 0.06, 0]}>
        <cylinderGeometry args={[arbor * 2.1, arbor * 2.4, 0.05, 32]} />
      </mesh>
      {w.parent >= 0 && <Pinion w={w} steel={steel} />}
      <mesh material={ruby} position={[0, w.thickness + (w.parent >= 0 ? 0.16 : 0) + 0.09, 0]} scale={[1, 0.45, 1]}>
        <sphereGeometry args={[arbor * 1.25, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
    </group>
  );
}

// the steel pinion that shares each wheel's arbor (10 leaves, same module)
function Pinion({ w, steel }: { w: Placed; steel: THREE.Material }) {
  const geo = useMemo(() => wheelGeometry({ teeth: 10, spokes: -1, thickness: 0.16 }, M), []);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={steel} position={[0, w.thickness, 0]} />;
}

function Medallion({ brass, deep }: { brass: THREE.Material; deep: THREE.Material }) {
  const R = 2.15;
  const H = 0.24;
  const parts = useMemo(() => {
    const eng = engraveMedallion(2048);
    for (const t of [eng.bump, eng.rough, eng.color]) {
      t.repeat.set(1 / (2 * R), 1 / (2 * R));
      t.offset.set(0.5, 0.5);
    }
    const face = new THREE.MeshPhysicalMaterial({
      color: '#C29E5E',
      map: eng.color,
      metalness: 1,
      roughness: 1,
      roughnessMap: eng.rough,
      bumpMap: eng.bump,
      bumpScale: 3,
      clearcoat: 0.35,
      clearcoatRoughness: 0.3,
      clearcoatRoughnessMap: eng.rough,
    });
    const disc = new THREE.Shape();
    disc.absarc(0, 0, R, 0, Math.PI * 2, false);
    const bevel = 0.06;
    const discGeo = new THREE.ExtrudeGeometry(disc, {
      depth: H - 2 * bevel,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelOffset: -bevel,
      bevelSegments: 4,
      curveSegments: 128,
    });
    discGeo.translate(0, 0, bevel);
    discGeo.rotateX(-Math.PI / 2);
    // the H, raised and polished in the cartouche
    const hb = 0.018;
    const hGeo = new THREE.ExtrudeGeometry(hallmarkH(), {
      depth: 0.04,
      bevelEnabled: true,
      bevelThickness: hb,
      bevelSize: hb,
      bevelOffset: -hb,
      bevelSegments: 3,
      curveSegments: 8,
    });
    hGeo.scale(0.95, 0.95, 1);
    hGeo.rotateX(-Math.PI / 2);
    const hMat = new THREE.MeshPhysicalMaterial({ color: '#E6CB8E', metalness: 1, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05 });
    // bezel ring
    const ring = new THREE.Shape();
    ring.absarc(0, 0, R + 0.16, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, R - 0.02, 0, Math.PI * 2, true);
    ring.holes.push(hole);
    const rb = 0.04;
    const ringGeo = new THREE.ExtrudeGeometry(ring, {
      depth: 0.1,
      bevelEnabled: true,
      bevelThickness: rb,
      bevelSize: rb,
      bevelOffset: -rb,
      bevelSegments: 4,
      curveSegments: 128,
    });
    ringGeo.rotateX(-Math.PI / 2);
    return { eng, face, discGeo, hGeo, hMat, ringGeo };
  }, []);
  useEffect(
    () => () => {
      parts.eng.dispose();
      parts.face.dispose();
      parts.discGeo.dispose();
      parts.hGeo.dispose();
      parts.hMat.dispose();
      parts.ringGeo.dispose();
    },
    [parts],
  );
  const lift = 0.36;
  return (
    <group position={[0, lift, 0]}>
      <mesh geometry={parts.discGeo} material={[parts.face, brass]} />
      <mesh geometry={parts.ringGeo} material={deep} position={[0, H - 0.08, 0]} />
      <mesh geometry={parts.hGeo} material={parts.hMat} position={[0, H + 0.005, 0]} />
    </group>
  );
}

// main plate under the train: dark gilt with perlage, partly out of frame
function Plate() {
  const parts = useMemo(() => {
    const per = perlage(512, 6);
    per.bump.repeat.set(1 / 1.4, 1 / 1.4);
    const mat = new THREE.MeshPhysicalMaterial({ color: '#3A3022', metalness: 1, roughness: 0.42, bumpMap: per.bump, bumpScale: 0.6 });
    const side = new THREE.MeshPhysicalMaterial({ color: BRASS_DEEP, metalness: 1, roughness: 0.3 });
    const s = new THREE.Shape();
    s.absarc(0, 0, 6.1, 0, Math.PI * 2, false);
    const b = 0.08;
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.3 - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 4, curveSegments: 160 });
    geo.translate(0, 0, b);
    geo.rotateX(-Math.PI / 2);
    return { per, mat, side, geo };
  }, []);
  useEffect(
    () => () => {
      parts.per.dispose();
      parts.mat.dispose();
      parts.side.dispose();
      parts.geo.dispose();
    },
    [parts],
  );
  return <mesh geometry={parts.geo} material={[parts.mat, parts.side]} position={[2.3, -0.42, -0.5]} />;
}

function Rig({ progress, variant, still }: Required<Pick<HeroSceneProps, 'progress' | 'variant'>> & { still: boolean }) {
  const { brass, deep, steel, ruby } = useBrass();
  const angle = useRef(still ? 1.1 : 0);
  const speed = useRef(variant === 'finale' ? BASE_SPEED * 0.6 : BASE_SPEED);
  const pointer = useRef({ x: 0, y: 0 });
  const tilt = useRef<THREE.Group>(null);
  const { camera, size } = useThree();
  const prog = useRef(progress);
  prog.current = progress;

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  useEffect(
    () => () => {
      brass.dispose();
      deep.dispose();
      steel.dispose();
      ruby.dispose();
    },
    [brass, deep, steel, ruby],
  );

  const wide = size.width / size.height >= 1;

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const p = prog.current;
    const target = still ? 0 : variant === 'finale' ? BASE_SPEED * 0.6 * Math.max(0, 1 - p) : BASE_SPEED * (1 + 0.8 * p);
    speed.current = THREE.MathUtils.damp(speed.current, target, variant === 'finale' ? 1.2 : 3, dt);
    angle.current += speed.current * dt;

    if (tilt.current) {
      tilt.current.rotation.x = THREE.MathUtils.damp(tilt.current.rotation.x, pointer.current.y * PARALLAX, 4, dt);
      tilt.current.rotation.z = THREE.MathUtils.damp(tilt.current.rotation.z, -pointer.current.x * PARALLAX, 4, dt);
    }

    const cam = camera as THREE.PerspectiveCamera;
    const zoom = variant === 'finale' ? 1.3 - 0.08 * p : 1 - 0.12 * p;
    const dist = (wide ? 17 : 21) * zoom;
    const elev = (56 * Math.PI) / 180;
    cam.position.set(0, Math.sin(elev) * dist, Math.cos(elev) * dist);
    cam.lookAt(0, 0, 0);
    // lens shift: keep the movement in the right two thirds, perspective unchanged
    const shift = wide && variant === 'hero' ? -0.17 : 0;
    if (cam.filmOffset !== shift * cam.getFilmWidth()) {
      cam.filmOffset = shift * cam.getFilmWidth();
      cam.updateProjectionMatrix();
    }
  });

  return (
    <group ref={tilt}>
      <group position={[-1.2, 0, 0.4]}>
        {TRAIN.map((w, i) => (
          <Wheel key={i} w={w} angle={angle} mat={i === 2 || i === 5 ? deep : brass} steel={steel} ruby={ruby} />
        ))}
        <Medallion brass={brass} deep={deep} />
        <Plate />
      </group>
      <ContactShadows position={[0, -0.11, 0]} opacity={0.85} scale={22} blur={2} far={1.2} resolution={512} color="#000000" frames={still ? 1 : Infinity} />
    </group>
  );
}

// fiber v8 still builds a THREE.Clock, which three r18x flags as deprecated on every canvas;
// drop that one known warning so the console stays clean (everything else passes through).
if (typeof console !== 'undefined' && !(console.warn as { heirloom?: boolean }).heirloom) {
  const warn = console.warn.bind(console);
  const filtered = (...a: unknown[]) => {
    if (typeof a[0] === 'string' && a[0].startsWith('THREE.Clock: This module has been deprecated')) return;
    warn(...a);
  };
  (filtered as { heirloom?: boolean }).heirloom = true;
  console.warn = filtered;
}

export default function MovementCanvas({ progress = 0, variant = 'hero', still = false, className, onReady }: HeroSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { rootMargin: '100px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={host}
      className={className}
      style={{ position: 'absolute', inset: 0, opacity: ready ? 1 : 0, transition: 'opacity 900ms cubic-bezier(0.23,1,0.32,1)' }}
      aria-hidden="true"
    >
      <Canvas
        frameloop={visible ? 'always' : 'never'}
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: still }}
        camera={{ fov: 30, near: 0.1, far: 100, position: [0, 10, 8] }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              setReady(true);
              onReady?.();
            }),
          );
        }}
      >
        <Environment />
        <pointLight position={[-4.5, 6, -6]} intensity={200} decay={2} color="#FFD49A" />
        <directionalLight position={[-6, 9, 5]} intensity={1.2} color="#FFE2B8" />
        <directionalLight position={[7, 3, -6]} intensity={0.8} color="#DCE4F0" />
        <Rig progress={progress} variant={variant} still={still} />
      </Canvas>
    </div>
  );
}
