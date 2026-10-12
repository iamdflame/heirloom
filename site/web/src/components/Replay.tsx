import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { shortDate, site } from '@/lib/site';
import { cn } from '@/lib/utils';

const STEP_MS = 1000; // 8 stops ≈ 8 s

// stops sit on the track in proportion to real time (days since the first stop)
const dayOf = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;
const DAYS = site.stops.map((s) => dayOf(s.date) - dayOf(site.stops[0]!.date));
const total = DAYS.at(-1)!;
const nearest = (d: number) => DAYS.reduce((best, x, i) => (Math.abs(x - d) < Math.abs(DAYS[best]! - d) ? i : best), 0);
// the native thumb is 18 px wide, so its centre runs from 9 px to (100% - 9 px)
const pos = (d: number) => `calc(9px + (100% - 18px) * ${d / total})`;
const at = (i: number) => ({ left: pos(DAYS[i]!) });
const span = (a: number, b: number) => ({ left: pos(DAYS[a]!), width: `calc((100% - 18px) * ${(DAYS[b]! - DAYS[a]!) / total})` });

// the October cluster: Ubuntu's patch (label to the left of its tick) and Django's amendment
// (label to the right, in the gutter) share a second row, with the quiet "n days" band between them
const conn = site.connector;
const distroIdx = site.stops.findIndex((s) => s.kind === 'distro');
const amendIdx = conn ? site.stops.findIndex((s) => s.kind === 'advisories' && s.date === conn.date) : -1;
const band = distroIdx >= 0 && amendIdx > distroIdx ? { from: distroIdx, to: amendIdx, days: DAYS[amendIdx]! - DAYS[distroIdx]! } : null;
type Place = { row: 0 | 1; align: 'first' | 'center' | 'start' | 'end' };
const PLACE: Place[] = site.stops.map((_, i) => {
  if (i === 0) return { row: 0, align: 'first' };
  if (band && i === band.from) return { row: 1, align: 'end' };
  if (band && i === band.to) return { row: 1, align: 'start' };
  if (i === site.stops.length - 1) return { row: 0, align: 'start' };
  return { row: 0, align: 'center' };
});

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

  const go = (i: number) => {
    setPlaying(false);
    onReplayStart();
    onStop(Math.max(0, Math.min(last, i)));
  };
  const onKey = (e: React.KeyboardEvent) => {
    const map: Record<string, number> = {
      ArrowRight: stop + 1,
      ArrowUp: stop + 1,
      PageUp: stop + 1,
      ArrowLeft: stop - 1,
      ArrowDown: stop - 1,
      PageDown: stop - 1,
      Home: 0,
      End: last,
    };
    if (e.key in map) {
      e.preventDefault();
      go(map[e.key]!);
    }
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
          {status.split(/(CVE-\d{4}-\d+)/).map((t, i) => (i % 2 ? <span key={i} className="whitespace-nowrap">{t}</span> : t))}
        </p>
      </div>
      <label htmlFor="replay" className="sr-only">
        Campaign date
      </label>
      {/* the track leaves a gutter on the right for the labels of the October cluster */}
      <div className="mt-3 md:pr-16 lg:pr-[16rem]">
        <div className="relative">
          {band && (
            <div aria-hidden className="pointer-events-none absolute inset-y-0 hidden md:block" style={span(band.from, band.to)}>
              <span className="absolute inset-x-0 top-[13px] h-[18px] bg-ink/[0.08]" />
              <span className="absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap font-mono text-[0.62rem] leading-none text-muted">
                {band.days} days
              </span>
            </div>
          )}
          <input
            id="replay"
            type="range"
            min={0}
            max={total}
            step={1}
            value={DAYS[stop]}
            aria-valuetext={status}
            onKeyDown={onKey}
            onChange={(e) => go(nearest(Number(e.target.value)))}
            className="replay-range relative w-full"
          />
        </div>
        <ol className="relative mt-0.5 hidden h-10 md:block lg:h-[5.5rem]" aria-hidden>
          {site.stops.map((s, i) => {
            const place = PLACE[i]!;
            const cur = i === stop;
            const label = i === amendIdx && conn ? `${s.label}, incl. ${conn.from}: Django amends its ${conn.to} fix` : s.label;
            return (
              <li key={s.date + s.kind} className={cn('absolute top-0', cur ? 'text-ink' : 'text-muted')} style={at(i)}>
                {/* tick, and a leader down to the second label row */}
                <span className={cn('absolute left-0 top-0 w-px -translate-x-1/2', cur ? 'bg-ink' : 'bg-muted/60', place.row ? 'h-[18px] lg:h-[34px]' : 'h-[5px]')} />
                <span
                  className={cn(
                    'absolute whitespace-nowrap font-mono text-[0.65rem] leading-tight lg:whitespace-normal',
                    place.row ? 'top-[19px] lg:top-[35px]' : 'top-[7px]',
                    place.align === 'center' && 'w-[3.5rem] -translate-x-1/2 text-center lg:w-[7.5rem]',
                    place.align === 'start' && 'left-0 pl-1 text-left lg:w-[15rem]',
                    place.align === 'first' && '-left-[9px] text-left lg:w-[7.5rem]',
                    place.align === 'end' && 'right-0 pr-1 text-right lg:w-[15rem]',
                  )}
                >
                  <span className={cn('block tabular-nums', cur && 'font-medium')}>{s.date.slice(5)}</span>
                  <span className="hidden lg:block">{label}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
