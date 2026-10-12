import { HALLMARK_H, hallmarkRing } from '@/lib/guilloche';
import { cn } from '@/lib/utils';

const RING = hallmarkRing(5, 200);

/** The hallmark: a slab-serif H inside a guilloché ring. `draw` engraves the ring in on first paint. */
export function Hallmark({ size = 28, draw, className, title }: { size?: number; draw?: boolean; className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn('shrink-0 text-brass', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" strokeWidth="2" pathLength={1} className={draw ? 'draw' : undefined} />
      <g fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.85">
        {RING.map((d, i) => (
          <path key={i} d={d} pathLength={1} className={draw ? 'draw' : undefined} style={draw ? { animationDelay: `${200 + i * 140}ms` } : undefined} />
        ))}
      </g>
      <circle cx="50" cy="50" r="35" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d={HALLMARK_H} fill="currentColor" />
    </svg>
  );
}
