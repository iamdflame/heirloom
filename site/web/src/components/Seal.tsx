import { useId } from 'react';
import { SEAL_BLOB, SEAL_H, SEAL_RING } from '@/lib/seal-paths';
import { cn } from '@/lib/utils';

/** The wax-seal monogram. One flat colour (--seal), the ring and the H are cut out. */
export function Seal({ size = 24, className, title }: { size?: number; className?: string; title?: string }) {
  const id = 'seal' + useId().replace(/:/g, '');
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <mask id={id}>
        <path d={SEAL_BLOB} fill="#fff" />
        <path d={SEAL_RING} fill="#000" fillRule="evenodd" />
        <path d={SEAL_H} fill="#000" />
      </mask>
      <rect width="100" height="100" fill="rgb(var(--seal))" mask={`url(#${id})`} />
    </svg>
  );
}
