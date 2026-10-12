import { useEffect, useRef, useState } from 'react';
import { animate, m, useInView, useReducedMotion } from 'motion/react';
import { site } from '@/lib/site';
import { WRAP } from '@/lib/layout';
import { cn } from '@/lib/utils';
import { Nb } from './Section';
import { Reveal } from './fx';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const PER_CVE = Number(site.economics.inputs.find((i) => /model cost per cve/i.test(i.name))?.base ?? NaN);

/** A numeral that counts up from 0 when it scrolls into view (any format); screen readers get the final text. */
function Count({ to, fmt = (v) => String(Math.round(v)), className }: { to: number; fmt?: (v: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, margin: '-15% 0px' });
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? to : 0);
  useEffect(() => {
    if (!seen || reduce) return setV(to);
    const c = animate(0, to, { duration: 1.4, ease: [0.23, 1, 0.32, 1], onUpdate: setV });
    return () => c.stop();
  }, [seen, reduce, to]);
  return (
    <span className={cn('tabular-nums', className)}>
      <span ref={ref} aria-hidden>
        {fmt(v)}
      </span>
      <span className="sr-only">{fmt(to)}</span>
    </span>
  );
}

/** Beat 9, proof in numbers: the versus card (false "not affected", naive vs calibrated), then the campaign's figures. */
export function Numbers() {
  const { v1, v2 } = site.backtest;
  const s = site.summary;
  const d = site.detection_check;
  const det = site.detections.find((x) => x.name === d.name);
  const sides = [
    { k: 'v1', name: 'Naive pipeline', sub: 'cherry-pick + LLM, no calibration', b: v1, tone: 'aff' as const },
    { k: 'v2', name: 'Heirloom', sub: 'calibrated probes', b: v2, tone: 'fix' as const },
  ];
  return (
    <section id="numbers" aria-labelledby="numbers-h" className="relative overflow-hidden border-t border-rule/60 py-24 md:py-36">
      <div className={WRAP}>
        <p className="eyebrow">Proof in numbers</p>
        <h2 id="numbers-h" className="display mt-5 max-w-[20ch] text-[clamp(2.6rem,5.4vw,5rem)]">
          The dangerous error is a false <em className="italic text-brass-hi">&ldquo;not affected&rdquo;.</em>
        </h2>
        <p className="mt-6 max-w-[40rem] text-lg text-ink/80">
          It tells a maintainer a vulnerable line is safe, so nobody patches it. Both pipelines ran on the same {v2.cases}{' '}
          backtest cases with known answers.
        </p>

        <div className="mt-14 grid overflow-hidden rounded-[16px] border border-rule md:grid-cols-2">
          {sides.map((x, i) => (
            <Side key={x.k} {...x} i={i} />
          ))}
        </div>
        <p className="mt-4 max-w-[60rem] font-mono text-[0.75rem] leading-relaxed text-muted">
          Accuracy on decided cases: naive {pct(v1.accuracy)} of {v1.decided}, Heirloom {pct(v2.accuracy)} of {v2.decided}; Heirloom
          leaves {v2.unproven} UNPROVEN rather than guess. The naive miss was <Nb>{v1.false_not_affected_cves.join(', ')}</Nb>; replaying
          it through the real stage path fired neatlogs&rsquo; <span className="text-ink/80">{d.name}</span> detection (run {d.run_id})
          {det && det.hits === d.hits_after ? ', its only hit: it never fired on the campaign' : ''}. Source:{' '}
          <a className="link" href={site.files.results}>
            evals/results.json
          </a>
          .
        </p>

        <dl className="mt-20 grid gap-y-12 border-t border-brass/25 pt-12 sm:grid-cols-3 sm:gap-x-8">
          {[
            { n: <Count to={s.prs} />, label: 'candidate backports', sub: `${s.fail_to_pass} of ${s.prs} probes go FAIL → PASS on 4.2` },
            { n: <Count to={s.cves} />, label: 'advisories examined', sub: `after 4.2’s end of life` },
            {
              n: <Count to={PER_CVE} fmt={(v) => `$${v.toFixed(2)}`} />,
              label: 'model cost per CVE',
              sub: `measured; $${s.cost_usd.toFixed(2)} for the campaign`,
            },
          ].map((f, i) => (
            <Reveal key={f.label} delay={i * 0.08}>
              <dt className="sr-only">{f.label}</dt>
              <dd className="m-0">
                <span className="display block text-[clamp(4.5rem,9vw,8.5rem)] leading-[0.85] text-brass-hi">{f.n}</span>
                <span aria-hidden className="mt-3 block text-lg">
                  {f.label}
                </span>
                <span className="mt-1 block font-mono text-[0.75rem] text-muted">{f.sub}</span>
              </dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Side({ name, sub, b, tone, i }: { name: string; sub: string; b: typeof site.backtest.v1; tone: 'aff' | 'fix'; i: number }) {
  const reduce = useReducedMotion();
  const bad = b.false_not_affected > 0;
  return (
    <div className={cn('relative isolate overflow-hidden px-7 py-10 md:px-10 md:py-14', i === 1 && 'border-t border-rule md:border-l md:border-t-0')}>
      <m.div
        aria-hidden
        className={cn('absolute inset-0 -z-10', tone === 'aff' ? 'bg-aff-bg' : 'bg-fix-bg')}
        initial={reduce ? false : { clipPath: i ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)' }}
        whileInView={{ clipPath: 'inset(0 0 0 0%)' }}
        viewport={{ once: true, margin: '-20% 0px' }}
        transition={{ duration: 1.1, ease: [0.23, 1, 0.32, 1], delay: 0.2 + i * 0.25 }}
      />
      <p className="label !text-ink/80">{i === 0 ? 'v1' : 'v2'}</p>
      <h3 className="mt-1 text-2xl">{name}</h3>
      <p className="text-[0.92rem] text-muted">{sub}</p>
      <p className="mt-8 flex items-end gap-4">
        <Count to={b.false_not_affected} className={cn('display text-[clamp(7rem,16vw,13rem)] leading-[0.8]', tone === 'aff' ? 'text-aff-fg' : 'text-fix-fg')} />
        <span className="mb-3 text-lg leading-tight">
          false &ldquo;not affected&rdquo;
          <span className={cn('mt-2 flex items-center gap-1.5 font-mono text-[0.8rem]', tone === 'aff' ? 'text-aff-fg' : 'text-fix-fg')}>
            <span aria-hidden>{bad ? '!' : '✓'}</span> {bad ? 'a vulnerable line called safe' : 'none called safe wrongly'}
          </span>
        </span>
      </p>
    </div>
  );
}
