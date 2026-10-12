import type { Chip as ChipT } from '@/data/types';
import { CHIP_META } from '@/lib/site';
import { cn } from '@/lib/utils';

/** Verdict chip: symbol AND word, never colour alone. */
export function Chip({ chip, className, compact }: { chip: ChipT; className?: string; compact?: boolean }) {
  const m = CHIP_META[chip];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-chip border px-1.5 py-0.5 font-mono text-[0.7rem] font-medium uppercase leading-none tracking-[0.04em]',
        m.cls,
        compact && 'px-1 text-[0.65rem]',
        className,
      )}
    >
      <span aria-hidden className="w-[1ch] text-center">
        {m.symbol}
      </span>
      {m.word}
    </span>
  );
}

export function ChipLegend({ className }: { className?: string }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3', className)}>
      {(Object.keys(CHIP_META) as ChipT[]).map((c) => (
        <div key={c} className="flex items-baseline gap-2">
          <dt>
            <Chip chip={c} />
          </dt>
          <dd className="text-muted">{CHIP_META[c].meaning}</dd>
        </div>
      ))}
    </dl>
  );
}
