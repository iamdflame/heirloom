import { m, useReducedMotion } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';
import { site } from '@/lib/site';
import { WRAP } from '@/lib/layout';
import { cn } from '@/lib/utils';
import { Reveal } from './fx';

type K = 'base' | 'bear' | 'bull';
const KEYS: K[] = ['base', 'bear', 'bull'];
const e = site.economics;
const input = (re: RegExp) => e.inputs.find((i) => re.test(i.name));
const result = (re: RegExp) => e.results.find((r) => re.test(r.name));
const val = (i: { base: string; bear: string; bull: string } | undefined, k: K) => (i ? (i[k] === '=' ? i.base : i[k]) : '');
const usd = (v: string) => `$${Number(v.replace(/,/g, '')).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const signedUsd = (v: string) => (v.startsWith('-') ? `−$${v.slice(1)}` : v.startsWith('+') ? `+$${v.slice(1)}` : `$${v}`);

// the modelled package lines over time (cfo.ai output) for the mini-chart; one scale for all three cards
const LINES = result(/^Package lines/);
const DATES = (LINES?.name.split(',').slice(1).join(',') ?? '').split('/').map((s) => s.trim());
const SERIES = Object.fromEntries(KEYS.map((k) => [k, (LINES?.[k] ?? '').split('/').map((s) => Number(s.trim()))])) as Record<K, number[]>;
const YMAX = Math.max(...KEYS.flatMap((k) => SERIES[k]));

const HYPOTHESES: { re: RegExp; label: string; fmt: (v: string) => string }[] = [
  { re: /^Price per verified backport/, label: 'Price per verified backport', fmt: usd },
  { re: /^Subscription per line/, label: 'Subscription per line / month', fmt: usd },
  { re: /^CVEs per line per month/, label: 'CVEs per line / month', fmt: (v) => v },
  { re: /^New lines per month/, label: 'New lines / month', fmt: (v) => v },
  { re: /^Monthly line churn/, label: 'Monthly churn', fmt: (v) => `${Math.round(Number(v) * 100)}%` },
  { re: /^Human minutes per escalation/, label: 'Human minutes per escalation', fmt: (v) => v },
];

/** Beat 10, economics: what a verdict cost (measured), and three cfo.ai scenarios (hypotheses) with a mini-chart each. */
export function Economics() {
  const s = site.summary;
  const measured = e.inputs.filter((i) => i.status.startsWith('measured') && !/^Opening/.test(i.name));
  return (
    <section id="economics" aria-labelledby="economics-h" className="relative overflow-hidden py-24 md:py-36">
      <div className={WRAP}>
        <p className="eyebrow">Economics · modelled in cfo.ai</p>
        <h2 id="economics-h" className="display mt-5 max-w-[22ch] text-[clamp(2.6rem,5.4vw,5rem)]">
          What a verdict cost, measured. <em className="italic text-brass-hi">What it might sell for, as a hypothesis.</em>
        </h2>

        <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-6 border-y border-rule py-6 md:grid-cols-3 lg:grid-cols-6">
          <div>
            <dt className="label">Campaign model cost</dt>
            <dd className="mt-1 font-mono text-xl text-brass-hi">${s.cost_usd.toFixed(2)}</dd>
          </div>
          {measured.map((i) => (
            <div key={i.name}>
              <dt className="label">{i.name.replace(/ USD\b/, '')}</dt>
              <dd className="mt-1 font-mono text-xl text-brass-hi">
                {/USD/.test(i.name) ? usd(i.base) : /rate/i.test(i.name) ? `${Math.round(Number(i.base) * 100)}%` : i.base}
              </dd>
              {i.status !== 'measured' && <dd className="font-mono text-[0.68rem] text-muted">{i.status}</dd>}
            </div>
          ))}
        </dl>
        <p className="mt-3 font-mono text-[0.72rem] text-muted">Measured on campaign {site.campaign}.</p>

        <ul className="mt-14 grid gap-6 lg:grid-cols-3" aria-label="Scenarios (hypotheses)">
          {KEYS.map((k, i) => (
            <Reveal as="li" key={k} delay={i * 0.1}>
              <Scenario k={k} i={i} />
            </Reveal>
          ))}
        </ul>
        <p className="mt-6 max-w-[48rem] text-[0.95rem] text-muted">
          <span className="mr-2 rounded-chip border border-muted/50 px-1.5 py-0.5 font-mono text-[0.7rem] uppercase tracking-[0.1em] text-ink">
            Hypothesis
          </span>
          Pricing and volume are assumptions; no buyer has been asked. Every input and its source:{' '}
          <a className="link" href={e.plan}>
            docs/business-plan.md
          </a>
          .
        </p>
      </div>
    </section>
  );
}

function Scenario({ k, i }: { k: K; i: number }) {
  const page = e.pages[i];
  const cash = result(/^Cash, /);
  const net = result(/^Net cash flow/);
  const runway = result(/^Runway/);
  const tilt = (ev: React.PointerEvent<HTMLElement>) => {
    if (ev.pointerType !== 'mouse') return;
    const r = ev.currentTarget.getBoundingClientRect();
    ev.currentTarget.style.setProperty('--rx', `${((ev.clientY - r.top) / r.height - 0.5) * -5}deg`);
    ev.currentTarget.style.setProperty('--ry', `${((ev.clientX - r.left) / r.width - 0.5) * 6}deg`);
  };
  const reset = (ev: React.PointerEvent<HTMLElement>) => {
    ev.currentTarget.style.setProperty('--rx', '0deg');
    ev.currentTarget.style.setProperty('--ry', '0deg');
  };
  return (
    <article
      onPointerMove={tilt}
      onPointerLeave={reset}
      className="tilt plate flex h-full flex-col rounded-[14px] px-6 py-6"
      aria-labelledby={`sc-${k}`}
    >
      <header className="flex items-baseline justify-between gap-3">
        <h3 id={`sc-${k}`} className="display text-[2.4rem] leading-none">
          {page?.name}
        </h3>
        <span className="rounded-chip border border-muted/50 px-1.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.1em] text-muted">
          Hypothesis
        </span>
      </header>
      <Spark k={k} />
      <dl className="mt-5 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[0.9rem]">
        {HYPOTHESES.map((h) => {
          const inp = input(h.re);
          return inp ? (
            <div key={h.label} className="contents">
              <dt className="text-ink/80">{h.label}</dt>
              <dd className="text-right font-mono text-[0.85rem]">{h.fmt(val(inp, k))}</dd>
            </div>
          ) : null;
        })}
        {net && (
          <div className="contents">
            <dt className="text-ink/80">Net cash flow, Dec 2027</dt>
            <dd className={cn('text-right font-mono text-[0.85rem]', net[k].startsWith('-') ? 'text-aff-fg' : 'text-fix-fg')}>{signedUsd(net[k])}/mo</dd>
          </div>
        )}
        {cash && (
          <div className="contents">
            <dt className="text-ink/80">Cash, Dec 2027</dt>
            <dd className="text-right font-mono text-[0.85rem]">{signedUsd(cash[k])}</dd>
          </div>
        )}
      </dl>
      {runway && <p className="mt-4 text-[0.9rem] leading-snug text-muted">Runway: {runway[k]}.</p>}
      {page && (
        <a className="link mt-auto inline-flex items-center gap-1 pt-5 text-brass-hi" href={page.url}>
          {page.name} model on cfo.ai <ArrowUpRight className="h-4 w-4" aria-hidden />
        </a>
      )}
    </article>
  );
}

/** Package lines under the scenario's inputs, drawn in on view (shared y-scale across the three cards). */
function Spark({ k }: { k: K }) {
  const reduce = useReducedMotion();
  const ys = SERIES[k];
  if (!ys.length || ys.some(Number.isNaN)) return null;
  const Wd = 300;
  const Ht = 96;
  const pad = { l: 6, r: 44, t: 12, b: 20 };
  const x = (j: number) => pad.l + (j / (ys.length - 1)) * (Wd - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / YMAX) * (Ht - pad.t - pad.b);
  const d = ys.map((v, j) => `${j ? 'L' : 'M'}${x(j).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const last = ys[ys.length - 1]!;
  return (
    <figure className="mt-5">
      <svg viewBox={`0 0 ${Wd} ${Ht}`} className="w-full" role="img" aria-label={`Paying package lines, ${DATES.map((t, j) => `${t}: ${ys[j]}`).join(', ')}`}>
        <line x1={pad.l} x2={Wd - pad.r} y1={y(0)} y2={y(0)} stroke="rgb(var(--rule))" strokeWidth="1" />
        <m.path
          d={d}
          fill="none"
          stroke="rgb(var(--brass-hi))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduce ? false : { pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, margin: '-10% 0px' }}
          transition={{ duration: 1.2, ease: [0.23, 1, 0.32, 1], delay: 0.2 }}
        />
        {ys.map((v, j) => (
          <g key={j}>
            <circle cx={x(j)} cy={y(v)} r="4" fill="rgb(var(--brass-hi))" stroke="rgb(var(--raised))" strokeWidth="2">
              <title>
                {DATES[j]}: {v} lines
              </title>
            </circle>
          </g>
        ))}
        <text x={x(ys.length - 1) + 8} y={y(last) + 4} fill="rgb(var(--ink))" fontSize="12" fontFamily="Geist Mono, monospace">
          {last}
        </text>
        <text x={pad.l} y={Ht - 4} fill="rgb(var(--muted))" fontSize="10" fontFamily="Geist Mono, monospace">
          {DATES[0]}
        </text>
        <text x={Wd - pad.r} y={Ht - 4} textAnchor="end" fill="rgb(var(--muted))" fontSize="10" fontFamily="Geist Mono, monospace">
          {DATES[DATES.length - 1]}
        </text>
      </svg>
      <figcaption className="font-mono text-[0.68rem] text-muted">Paying package lines (modelled), same scale on all three</figcaption>
    </figure>
  );
}
