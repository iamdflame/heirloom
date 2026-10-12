// Motion helpers: word-reveal headline, count-up, magnetic button, in-view reveal, spotlight hover.
// The headline and the counters are CSS-driven so the prerendered first screen animates before JS;
// on the client they resume where the CSS left off (negative delays from the time since navigation).
import { useEffect, useRef, useState } from 'react';
import { m, useInView, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { cn } from '@/lib/utils';

/** ms since navigation start, frozen at first render (0 on the server). */
export function useSincePaint() {
  const [t] = useState(() => (typeof performance === 'undefined' ? 0 : performance.now()));
  return t;
}

export type Part = { text: string; em?: boolean };

/** A headline that reveals word by word (blur + rise). `parts` keeps italic accents. */
export function WordReveal({
  parts,
  as: Tag = 'h1',
  id,
  className,
  delay = 120,
  stagger = 90,
}: {
  parts: Part[];
  as?: 'h1' | 'h2' | 'p';
  id?: string;
  className?: string;
  delay?: number;
  stagger?: number;
}) {
  const since = useSincePaint();
  let i = 0;
  return (
    <Tag id={id} className={className}>
      {parts.map((p, pi) => {
        const words = p.text.split(' ').filter(Boolean);
        const out = words.map((w, wi) => {
          const d = delay + i++ * stagger - since;
          return (
            <span key={wi}>
              <span className="word" style={{ animationDelay: `${d}ms` }}>
                {w}
              </span>
              {wi < words.length - 1 || pi < parts.length - 1 ? ' ' : ''}
            </span>
          );
        });
        return p.em ? (
          <em key={pi} className="italic text-brass-hi">
            {out}
          </em>
        ) : (
          <span key={pi}>{out}</span>
        );
      })}
    </Tag>
  );
}

/**
 * An integer that counts up from 0 (CSS @property counter). Screen readers get the number itself.
 * `start`: ms after navigation for the first screen; otherwise it waits until scrolled into view.
 */
export function CountUp({ value, start, className }: { value: number; start?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const since = useSincePaint();
  const seen = useInView(ref, { once: true, margin: '-10% 0px' });
  const wait = start === undefined && !seen;
  return (
    <span className={cn('tabular-nums', className)}>
      <span
        ref={ref}
        aria-hidden
        className="count"
        data-wait={wait ? '' : undefined}
        style={{ ['--to' as string]: value, animationDelay: start !== undefined ? `${start - since}ms` : undefined }}
      />
      <span className="sr-only">{value}</span>
    </span>
  );
}

/** A link that leans toward the pointer (fine pointers only, off under reduced motion). */
export function Magnetic({ children, className, strength = 0.28, ...a }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { strength?: number }) {
  const reduce = useReducedMotion();
  const x = useSpring(useMotionValue(0), { stiffness: 220, damping: 18, mass: 0.4 });
  const y = useSpring(useMotionValue(0), { stiffness: 220, damping: 18, mass: 0.4 });
  const fine = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
  const move = (e: React.PointerEvent<HTMLAnchorElement>) => {
    if (reduce || !fine) return;
    const r = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - r.left - r.width / 2) * strength);
    y.set((e.clientY - r.top - r.height / 2) * strength);
  };
  const leave = () => {
    x.set(0);
    y.set(0);
  };
  return (
    <m.a {...(a as object)} className={className} style={{ x, y }} onPointerMove={move} onPointerLeave={leave}>
      {children}
    </m.a>
  );
}

/** Fades and rises into view once. */
export function Reveal({ children, className, delay = 0, y = 24, as = 'div' }: { children: React.ReactNode; className?: string; delay?: number; y?: number; as?: 'div' | 'li' | 'section' | 'p' }) {
  const C = m[as] as typeof m.div;
  return (
    <C
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-12% 0px' }}
      transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1], delay }}
    >
      {children}
    </C>
  );
}

/** Sets --mx/--my on the hovered `selector` element (relative to it), for a `.spotlight` background. */
export function useSpotlight<T extends HTMLElement>(selector: string) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const move = (e: PointerEvent) => {
      const t = (e.target as Element).closest?.(selector) as HTMLElement | null;
      if (!t) return;
      const r = t.getBoundingClientRect();
      t.style.setProperty('--mx', `${e.clientX - r.left}px`);
      t.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    el.addEventListener('pointermove', move);
    return () => el.removeEventListener('pointermove', move);
  }, [selector]);
  return ref;
}

/** Lenis smooth scroll, off under reduced motion. Loaded after first paint. */
export function useSmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let destroy = () => {};
    let cancelled = false;
    import('lenis').then(({ default: Lenis }) => {
      if (cancelled) return;
      const lenis = new Lenis({ autoRaf: true, anchors: { offset: -64 }, lerp: 0.11 });
      destroy = () => lenis.destroy();
    });
    return () => {
      cancelled = true;
      destroy();
    };
  }, []);
}
