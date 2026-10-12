import { useRef, useState } from 'react';
import { AnimatePresence, m, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react';
import type { Chip as ChipT, Row } from '@/data/types';
import { CHIP_META, site } from '@/lib/site';
import { STEPS, SPAN, dayOf, md, tally, type Step } from '@/lib/campaign';
import { WRAP } from '@/lib/layout';
import { useMedia } from '@/lib/useMedia';
import { cn } from '@/lib/utils';
import { Reveal } from './fx';

const TILE: Record<ChipT, string> = {
  FIX_READY: 'bg-fix-bg text-fix-fg border-fix-fg/50',
  NOT_AFFECTED: 'bg-na-bg text-na-fg border-na-fg/50',
  UNPROVEN: 'bg-unp-bg text-unp-fg border-unp-fg/50',
  AFFECTED: 'bg-aff-bg text-aff-fg border-aff-fg/50',
  NO_PROBE: 'bg-np-bg text-np-fg border-np-fg/40',
};
const conn = site.connector;
const colOf = (cve: string) => site.rows.findIndex((r) => r.cve === cve);

/** Beat 3, "Watch it work": the campaign replayed by scrolling. Pinned on desktop, a vertical story on mobile. */
export function Campaign() {
  const lg = useMedia('(min-width: 1024px)');
  const reduce = useReducedMotion();
  return (
    <section id="watch" aria-labelledby="watch-h" className="relative">
      <h2 id="watch-h" className="sr-only">
        Watch it work: the campaign, advisory by advisory
      </h2>
      <ol className="sr-only">
        {STEPS.map((s, i) => (
          <li key={i}>
            {s.title}. {s.sub}
          </li>
        ))}
      </ol>
      {lg && !reduce ? <Pinned /> : <Story animate={!reduce} />}
    </section>
  );
}

// ---------------------------------------------------------------- desktop: pinned, scroll-driven
function Pinned() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const [step, setStep] = useState(0);
  const N = STEPS.length;
  useMotionValueEvent(scrollYProgress, 'change', (p) => setStep(Math.max(0, Math.min(N - 1, Math.floor(p * N * 0.999)))));
  // the dial turns continuously: step centres → their day
  const stops = STEPS.map((_, i) => (i + 0.5) / N);
  const days = STEPS.map((s) => dayOf(s.date));
  const rotate = useTransform(scrollYProgress, stops, days.map((d) => (-d / SPAN) * 300));
  const cur = STEPS[step]!;
  const t = tally(step);
  return (
    <div ref={ref} style={{ height: `${N * 42 + 100}vh` }} className="relative">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div className={cn(WRAP, 'grid grid-cols-12 items-center gap-8')}>
          <div className="col-span-5 xl:col-span-4">
            <p className="eyebrow" aria-hidden>
              Watch it work
            </p>
            <p aria-hidden className="display mt-4 text-[clamp(4.5rem,8vw,8rem)] leading-none text-brass-hi">
              <AnimatePresence mode="popLayout" initial={false}>
                <m.span
                  key={cur.date}
                  className="inline-block"
                  initial={{ opacity: 0, y: 30, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -30, filter: 'blur(6px)' }}
                  transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
                >
                  {md(cur.date)}
                </m.span>
              </AnimatePresence>
            </p>
            <div aria-hidden className="relative mt-6 min-h-[8.5rem]">
              <AnimatePresence mode="wait" initial={false}>
                <m.div
                  key={step}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
                >
                  <p className="text-2xl leading-snug text-ink">{cur.title.replace(/^\w{3} \d+ · /, '')}</p>
                  {cur.sub && <p className="mt-2 text-[0.95rem] text-muted">{cur.sub}</p>}
                </m.div>
              </AnimatePresence>
            </div>
            <Counters t={t} />
            <Progress step={step} />
          </div>
          <div className="col-span-7 xl:col-span-8" aria-hidden>
            <Instrument step={step} rotate={rotate} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Counters({ t }: { t: ReturnType<typeof tally> }) {
  const items: [number, string][] = [
    [t.advisories, `of ${site.rows.length} advisories`],
    [t.backports, 'candidate backports'],
    [t.evidence, 'evidence issues'],
    [t.questions, 'question asked'],
  ];
  return (
    <dl aria-hidden className="mt-8 grid grid-cols-4 gap-3 border-t border-brass/20 pt-5">
      {items.map(([v, k]) => (
        <div key={k}>
          <dd className="m-0 font-display text-4xl leading-none tabular-nums text-ink">
            <AnimatePresence mode="popLayout" initial={false}>
              <m.span key={v} className="inline-block" initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1] }}>
                {v}
              </m.span>
            </AnimatePresence>
          </dd>
          <dt className="mt-1.5 font-mono text-[0.66rem] uppercase leading-tight tracking-[0.08em] text-muted">{k}</dt>
        </div>
      ))}
    </dl>
  );
}

function Progress({ step }: { step: number }) {
  return (
    <div className="mt-8 flex gap-1.5">
      {STEPS.map((_, i) => (
        <span key={i} className={cn('h-[3px] flex-1 rounded-full transition-colors duration-300', i <= step ? 'bg-brass' : 'bg-rule')} />
      ))}
    </div>
  );
}

/** The bezel dial with the tilted 19 × 3 register on it. */
function Instrument({ step, rotate }: { step: number; rotate: ReturnType<typeof useTransform<number, number>> }) {
  const cur = STEPS[step]!;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[52rem] [perspective:1800px]">
      <div className="absolute inset-0 [transform-style:preserve-3d] [transform:rotateX(38deg)_rotateZ(-10deg)]">
        <m.div className="absolute inset-[4%]" style={{ rotate }}>
          <Dial />
        </m.div>
        {/* the fixed index at 12 o'clock */}
        <div className="absolute left-1/2 top-[1.5%] h-[5%] w-[3px] -translate-x-1/2 rounded-full bg-brass-hi shadow-[0_0_12px_rgb(var(--brass)/0.8)]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Tiles step={step} size="lg" />
        </div>
      </div>
      <p className="absolute bottom-0 right-0 font-mono text-[0.7rem] text-muted">
        {cur.kind === 'amend' ? 'connector: PR #' + conn?.pr + ' stacked on #' + conn?.on : `register at ${md(cur.date)}`}
      </p>
    </div>
  );
}

const MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
function Dial() {
  const ticks = Array.from({ length: SPAN + 1 }, (_, d) => d);
  const ang = (d: number) => (d / SPAN) * 300 - 90;
  const pt = (d: number, r: number) => [50 + r * Math.cos((ang(d) * Math.PI) / 180), 50 + r * Math.sin((ang(d) * Math.PI) / 180)] as const;
  const monthDay = (i: number) => dayOf(`2026-${String(4 + i).padStart(2, '0')}-01`);
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full text-brass">
      <defs>
        <radialGradient id="dialfill" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="rgb(var(--raised))" />
          <stop offset="100%" stopColor="rgb(var(--paper))" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="49.5" fill="url(#dialfill)" stroke="currentColor" strokeOpacity="0.5" strokeWidth="0.25" />
      <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="0.15" />
      {ticks.map((d) => {
        const major = d % 7 === 0;
        const [x1, y1] = pt(d, major ? 44.5 : 46.5);
        const [x2, y2] = pt(d, 48.6);
        return <line key={d} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeOpacity={major ? 0.75 : 0.3} strokeWidth={major ? 0.22 : 0.1} />;
      })}
      {MONTHS.map((mo, i) => {
        const d = Math.max(0, monthDay(i));
        if (d > SPAN) return null;
        const [x, y] = pt(d, 41);
        return (
          <text key={mo} x={x} y={y} fontSize="2.4" textAnchor="middle" dominantBaseline="middle" fill="currentColor" fillOpacity="0.8" className="font-mono" transform={`rotate(${ang(d) + 90} ${x} ${y})`}>
            {mo.toUpperCase()}
          </text>
        );
      })}
      {site.stops.map((s) => {
        const [x, y] = pt(dayOf(s.date), 47.5);
        return <circle key={s.date + s.kind} cx={x} cy={y} r="0.7" fill="rgb(var(--brass-hi))" />;
      })}
    </svg>
  );
}

/** 19 advisories (columns) × 3 release lines (rows), each tile a verdict, stamped in when its advisory arrives. */
export function Tiles({ step, size, animate = true }: { step: number; size: 'lg' | 'sm'; animate?: boolean }) {
  const cur = STEPS[step]!;
  const qi = STEPS.findIndex((s) => s.kind === 'question');
  const amendI = STEPS.findIndex((s) => s.kind === 'amend');
  const pitch = size === 'lg' ? 36 : 15;
  const tile = size === 'lg' ? 30 : 12;
  const head = size === 'lg' ? 34 : 0;
  const top = size === 'lg' ? 64 : 34;
  const w = head + site.rows.length * pitch;
  const h = top + site.lines.length * pitch;
  const cx = (i: number) => head + i * pitch + tile / 2;
  const showConn = conn && step >= amendI && amendI >= 0;
  const qcol = colOf(site.query.asked_by);
  const fresh = (r: Row) => animate && r.date === cur.date && cur.kind === 'batch';
  return (
    <div className="relative shrink-0" style={{ width: w, height: h }}>
      {size === 'lg' &&
        site.lines.map((l, li) => (
          <span key={l.id} className="absolute left-0 font-mono text-[0.7rem] text-muted" style={{ top: top + li * pitch + tile / 2 - 8 }}>
            {l.abbr}
          </span>
        ))}
      {site.rows.map((r, i) => {
        const on = r.date <= cur.date;
        const focus = cur.focus?.includes(r.cve);
        return (
          <div key={r.anchor}>
            {size === 'lg' && (
              <span className={cn('absolute text-center font-mono text-[0.58rem] transition-colors', on ? 'text-brass' : 'text-rule')} style={{ left: head + i * pitch, width: tile, top: top - 16 }}>
                {r.acc.slice(-3)}
              </span>
            )}
            {r.cells.map((c, li) => (
              <span
                key={c.line + (on ? '1' : '0') + (fresh(r) ? step : '')}
                className={cn(
                  'absolute flex items-center justify-center rounded-[3px] border font-mono leading-none',
                  size === 'lg' ? 'text-[0.8rem]' : 'text-[0.55rem]',
                  on ? TILE[c.chip] : 'border-dashed border-rule bg-transparent text-transparent',
                  on && fresh(r) && 'stamp',
                  on && focus && 'ring-1 ring-brass-hi',
                )}
                style={{ left: head + i * pitch, top: top + li * pitch, width: tile, height: tile, animationDelay: fresh(r) ? `${li * 70 + (i % 5) * 60}ms` : undefined }}
              >
                {on && size === 'lg' ? CHIP_META[c.chip].symbol : ''}
              </span>
            ))}
          </div>
        );
      })}
      {/* the question mark over 15307 */}
      {qi >= 0 && step >= qi && qcol >= 0 && (
        <span className="absolute flex items-center justify-center" style={{ left: cx(qcol) - 9, top: top - (size === 'lg' ? 44 : 30), width: 18, height: 18 }}>
          {(step === qi || !animate) && animate && <span className="absolute inset-0 rounded-full border border-unp-fg [animation:pulse-ring_1.4s_ease-out_infinite]" />}
          <span className="relative flex h-[18px] w-[18px] items-center justify-center rounded-full bg-unp-fg font-mono text-[0.7rem] font-medium text-paper">?</span>
        </span>
      )}
      {/* 87890 → 15307: stacked on our own backport */}
      {showConn && conn && (
        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={w} height={h}>
          {(() => {
            const x1 = cx(colOf(conn.from));
            const x2 = cx(colOf(conn.to));
            const y = top + site.lines.length * pitch + 4;
            const dip = size === 'lg' ? 46 : 22;
            return (
              <>
                <path
                  d={`M${x1} ${y} C${x1} ${y + dip}, ${x2} ${y + dip}, ${x2} ${y + 4}`}
                  fill="none"
                  stroke="rgb(var(--brass-hi))"
                  strokeWidth={size === 'lg' ? 1.6 : 1.2}
                  pathLength={1}
                  className={animate ? 'draw' : undefined}
                />
                <path d={`M${x2} ${y} l-4 7 h8 z`} fill="rgb(var(--brass-hi))" />
                <circle cx={x1} cy={y + 2} r="2.5" fill="rgb(var(--brass-hi))" />
                {size === 'lg' && (
                  <text x={(x1 + x2) / 2} y={y + dip + 6} textAnchor="middle" className="fill-brass-hi font-mono text-[11px]">
                    stacked on our own backport · PR #{conn.pr} on #{conn.on}
                  </text>
                )}
              </>
            );
          })()}
        </svg>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- mobile / reduced motion: a vertical story
function Story({ animate }: { animate: boolean }) {
  return (
    <div className={cn(WRAP, 'py-24')}>
      <p className="eyebrow" aria-hidden>
        Watch it work
      </p>
      <p aria-hidden className="display mt-4 text-[clamp(2.6rem,9vw,4.5rem)]">
        The campaign, <em className="italic text-brass-hi">advisory by advisory.</em>
      </p>
      <ol aria-hidden className="mt-12 grid gap-5 border-l border-brass/25 pl-5">
        {STEPS.map((s, i) => (
          <StoryStep key={i} s={s} i={i} animate={animate} />
        ))}
      </ol>
    </div>
  );
}

function StoryStep({ s, i, animate }: { s: Step; i: number; animate: boolean }) {
  const ref = useRef<HTMLLIElement>(null);
  const [seen, setSeen] = useState(!animate);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 85%', 'start 60%'] });
  useMotionValueEvent(scrollYProgress, 'change', (p) => p > 0.5 && !seen && setSeen(true));
  const t = tally(i);
  return (
    <li ref={ref} className="relative">
      <span className="absolute -left-[1.6rem] top-2 h-2.5 w-2.5 rounded-full border border-brass bg-paper" />
      <Reveal>
        <p className="font-mono text-xs text-brass">{md(s.date)}</p>
        <p className="mt-1 text-lg leading-snug">{s.title.replace(/^\w{3} \d+ · /, '')}</p>
        {s.sub && <p className="mt-1 text-sm text-muted">{s.sub}</p>}
        <div className="mt-3 overflow-hidden rounded-[8px] border border-rule bg-surface p-3">
          <div className="origin-top-left max-[360px]:scale-[0.9]">
            <Tiles step={seen ? i : Math.max(0, i - 1)} size="sm" animate={animate && seen} />
          </div>
          <p className="mt-2 font-mono text-[0.68rem] text-muted">
            {t.advisories}/{site.rows.length} advisories · {t.backports} candidate backports · {t.evidence} evidence
          </p>
        </div>
      </Reveal>
    </li>
  );
}
