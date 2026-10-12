import { useEffect, useState } from 'react';
import { useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'motion/react';
import HeroScene, { canRender3D } from '@/three/HeroScene';
import { cn } from '@/lib/utils';

const BASE = import.meta.env.BASE_URL;

/** The pre-rendered frame of the 3D movement: the LCP image, and the whole visual on mobile, reduced motion and no-WebGL. */
export function Poster({ name, mobile, priority, className }: { name: string; mobile?: string; priority?: boolean; className?: string }) {
  return (
    <picture>
      {mobile && <source type="image/avif" media="(max-width: 767px)" srcSet={`${BASE}${mobile}.avif`} />}
      {mobile && <source type="image/webp" media="(max-width: 767px)" srcSet={`${BASE}${mobile}.webp`} />}
      <source type="image/avif" srcSet={`${BASE}${name}.avif`} />
      <img
        src={`${BASE}${name}.webp`}
        alt=""
        width={1600}
        height={1000}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        {...(priority ? { fetchpriority: 'high' } : {})}
        className={cn('block h-full w-full object-cover', className)}
      />
    </picture>
  );
}

/**
 * Mounts the live movement once the page is idle (WebGL, ≥768 px, motion allowed), with the poster
 * underneath; the poster fades out when the scene's first frames are on screen.
 */
export function LiveMovement({
  progress,
  variant,
  poster,
  mobile,
  priority,
  posterClass,
}: {
  progress: MotionValue<number>;
  variant: 'hero' | 'finale';
  poster: string;
  mobile?: string;
  priority?: boolean;
  posterClass?: string;
}) {
  const [live, setLive] = useState(false);
  const [ready, setReady] = useState(false);
  const [p, setP] = useState(0);
  useMotionValueEvent(progress, 'change', (v) => setP(Math.round(v * 200) / 200));
  useEffect(() => {
    if (!canRender3D()) return;
    // after first paint and load, so the three.js chunk never competes with the LCP poster
    const go = () => setLive(true);
    const idle = () => ('requestIdleCallback' in window ? window.requestIdleCallback(go, { timeout: 2500 }) : setTimeout(go, 600));
    if (document.readyState === 'complete') idle();
    else window.addEventListener('load', idle, { once: true });
    return () => window.removeEventListener('load', idle);
  }, []);
  return (
    <>
      <div className={cn('absolute inset-0 transition-opacity duration-[900ms] ease-out', ready && 'opacity-0')} data-poster={variant}>
        <Poster name={poster} mobile={mobile} priority={priority} className={posterClass} />
      </div>
      {live && <HeroScene progress={p} variant={variant} onReady={() => setReady(true)} />}
    </>
  );
}

/**
 * The hero's visual: the real-time 3D brass movement (src/three), over its poster. On scroll the train
 * turns faster and the camera dollies in; the pointer tilts the rig (inside the scene).
 */
export function HeroVisual() {
  const { scrollY } = useScroll();
  const progress = useTransform(scrollY, (y) => Math.min(1, Math.max(0, y / (typeof window === 'undefined' ? 900 : window.innerHeight))));
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <LiveMovement progress={progress} variant="hero" poster="hero-poster" mobile="hero-poster-m" priority posterClass="object-[70%_50%] md:object-[100%_50%]" />
      {/* fades into the ink: left edge (text side), top (nav) and bottom (next section) */}
      <div className="absolute inset-0 bg-gradient-to-r from-paper/90 via-paper/30 to-transparent lg:from-paper/70 lg:via-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-paper to-transparent" />
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-paper/80 to-transparent" />
      <div className="absolute inset-0 bg-paper/55 md:hidden" />
    </div>
  );
}
