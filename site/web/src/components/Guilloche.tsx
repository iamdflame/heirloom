import { rosette, waveBand } from '@/lib/guilloche';
import { cn } from '@/lib/utils';

const ROSETTE = [
  ...rosette({ r: 47, amp: 2.2, lobes: 48, copies: 10, steps: 360 }),
  ...rosette({ r: 36, amp: 4, lobes: 30, copies: 9, steps: 300 }),
  ...rosette({ r: 22, amp: 3.5, lobes: 18, copies: 7, steps: 220 }),
];

/** A guilloché rosette (decorative). */
export function Rosette({ className, strokeWidth = 0.1 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={cn('text-brass', className)}>
      <g fill="none" stroke="currentColor" strokeWidth={strokeWidth}>
        {ROSETTE.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

const BAND = waveBand({ width: 1200, y: 12, amp: 7, wavelength: 40, copies: 7, step: 5 });

/** A wave band of guilloché line-work, stretched to its box (decorative). */
export function WaveBand({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1200 24" preserveAspectRatio="none" aria-hidden className={cn('block w-full text-brass', className)}>
      <g fill="none" stroke="currentColor" strokeWidth="0.6" vectorEffect="non-scaling-stroke">
        {BAND.map((d, i) => (
          <path key={i} d={d} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </svg>
  );
}
