import { m, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { useEffect } from 'react';
import { Photo } from './Photo';
import { Hallmark } from './Hallmark';

/**
 * The hero's visual slot (right two thirds). For now: the graded brass-gears photograph with a slow
 * guilloché rosette and the hallmark over it. The real-time 3D movement (src/three/HeroScene) and its
 * poster replace the photo here after the site-3d merge.
 */
export function HeroVisual() {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  // on scroll: the camera "dollies in" and the line-work turns faster
  const scale = useTransform(scrollY, [0, 900], [1.04, 1.22]);
  const turn = useTransform(scrollY, [0, 900], [0, 40]);
  const mx = useSpring(0, { stiffness: 60, damping: 20 });
  const my = useSpring(0, { stiffness: 60, damping: 20 });
  const px = useTransform(mx, (v) => v * -18);
  const py = useTransform(my, (v) => v * -12);
  useEffect(() => {
    if (reduce || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const move = (e: PointerEvent) => {
      mx.set(e.clientX / window.innerWidth - 0.5);
      my.set(e.clientY / window.innerHeight - 0.5);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, [reduce, mx, my]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden lg:left-[32%]">
      <m.div className="absolute inset-0" style={reduce ? undefined : { scale, x: px, y: py }}>
        <Photo
          name="gears-dark"
          priority
          sizes="(min-width: 1024px) 68vw, 100vw"
          className="h-full w-full object-[60%_50%] opacity-80 lg:opacity-100"
        />
      </m.div>
      {/* the engraved rosette, centred on the photo's main wheel */}
      <m.div
        className="absolute left-1/2 top-1/2 aspect-square w-[min(74vh,48vw)] -translate-x-1/2 -translate-y-1/2 opacity-30 mix-blend-screen max-lg:w-[100vw]"
        style={reduce ? undefined : { rotate: turn }}
      >
        <img src={`${import.meta.env.BASE_URL}guilloche/rosette.svg`} alt="" width={800} height={800} decoding="async" className="spin-slow h-full w-full" />
      </m.div>
      <div className="absolute bottom-[12%] right-[8%] hidden opacity-70 lg:block">
        <Hallmark size={92} draw />
      </div>
      {/* fades into the ink: left edge (text side), top (nav) and bottom (next section) */}
      <div className="absolute inset-0 bg-gradient-to-r from-paper via-paper/60 to-transparent lg:via-paper/10" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-paper to-transparent" />
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-paper/80 to-transparent" />
      <div className="absolute inset-0 bg-paper/50 lg:hidden" />
    </div>
  );
}
