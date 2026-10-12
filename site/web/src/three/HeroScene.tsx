import { lazy, Suspense, type ReactNode } from 'react';

export interface HeroSceneProps {
  /** 0–1, scroll-driven: the train speeds up a little and the camera dollies in. */
  progress?: number;
  /** "finale": zoomed out, and the train slows to a stop as progress → 1. */
  variant?: 'hero' | 'finale';
  /** Freeze the train at a fixed angle (posters, screenshots). */
  still?: boolean;
  className?: string;
  /** Called once the first frames are on screen (e.g. to cross-fade a poster away). */
  onReady?: () => void;
  /** Shown while the three.js chunk downloads (typically the poster <picture>). */
  fallback?: ReactNode;
}

/**
 * True when the live scene is worth rendering: WebGL is available, the visitor has not asked
 * for reduced motion, and the viewport is at least 768 px wide. Otherwise show the poster.
 * Safe to call during SSR (returns false).
 */
export function canRender3D(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  if (window.innerWidth < 768) return false;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!gl) return false;
    (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

// three + fiber + drei live in their own chunk, fetched only when the scene mounts.
const MovementCanvas = lazy(() => import('./MovementCanvas'));

export default function HeroScene({ fallback = null, ...props }: HeroSceneProps) {
  return (
    <Suspense fallback={fallback}>
      <MovementCanvas {...props} />
    </Suspense>
  );
}
