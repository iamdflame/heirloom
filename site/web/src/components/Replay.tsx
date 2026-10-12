import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { shortDate, site } from '@/lib/site';
import { cn } from '@/lib/utils';

const STEP_MS = 1000; // 8 stops ≈ 8 s

/** The campaign replay: a native range input over the dated stops, with an opt-in play button. */
export function Replay({
  stop,
  count,
  onStop,
  onReplayStart,
}: {
  stop: number;
  count: number;
  onStop: (i: number) => void;
  onReplayStart: () => void;
}) {
  const last = site.stops.length - 1;
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number>();
  const cur = site.stops[stop]!;

  useEffect(() => {
    if (!playing) return;
    if (stop >= last) {
      setPlaying(false);
      return;
    }
    timer.current = window.setTimeout(() => onStop(stop + 1), STEP_MS);
    return () => window.clearTimeout(timer.current);
  }, [playing, stop, last, onStop]);

  const start = () => {
    onReplayStart();
    if (stop >= last) onStop(0);
    setPlaying(true);
  };

  const status = `${shortDate(cur.date)} · ${cur.kind === 'advisories' ? '' : cur.label + ' · '}${count} of ${site.rows.length} advisories`;

  return (
    <div className="mt-8 rounded-[2px] border border-rule bg-surface px-4 py-4 md:px-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <button
          type="button"
          onClick={playing ? () => setPlaying(false) : start}
          className="press inline-flex min-h-11 items-center gap-2 text-base underline decoration-ink/40 underline-offset-[0.2em] hover-underline"
        >
          {playing ? <Pause className="h-4 w-4" aria-hidden /> : stop >= last ? <RotateCcw className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
          {playing ? 'Pause' : stop >= last ? 'Replay the campaign' : 'Play'}
        </button>
        <p aria-live="polite" className="font-mono text-[0.8rem] tabular-nums text-ink">
          {status}
        </p>
      </div>
      <label htmlFor="replay" className="sr-only">
        Campaign date
      </label>
      <input
        id="replay"
        type="range"
        min={0}
        max={last}
        step={1}
        value={stop}
        aria-valuetext={status}
        onChange={(e) => {
          setPlaying(false);
          onReplayStart();
          onStop(Number(e.target.value));
        }}
        className="replay-range mt-3 w-full"
      />
      <ol className="relative mt-1 hidden h-6 md:block lg:h-16" aria-hidden>
        {site.stops.map((s, i) => {
          const at = (i / last) * 100;
          const edge = i === 0 ? 'left-0 text-left' : i === last ? 'right-0 text-right' : '-translate-x-1/2 text-center';
          return (
            <li
              key={s.date + s.kind}
              style={i === 0 || i === last ? undefined : { left: `${at}%` }}
              className={cn(
                'absolute top-0 w-[3.5rem] font-mono text-[0.65rem] leading-tight lg:w-[7.5rem]',
                edge,
                i === stop ? 'text-ink' : 'text-muted',
              )}
            >
              <span className="block tabular-nums">{s.date.slice(5)}</span>
              <span className="hidden lg:block">{s.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
