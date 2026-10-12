import { site } from '@/lib/site';
import { cn } from '@/lib/utils';
import { Nb, Section } from './Section';

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Table 2 — the backtest: naive v1 against calibrated v2 on cases with known answers. */
export function Backtest() {
  const { v1, v2 } = site.backtest;
  const d = site.detection_check;
  const det = site.detections.find((x) => x.name === d.name);
  const rows = [
    { k: 'v1', name: 'v1 · naive', sub: 'cherry-pick + LLM, no calibration', b: v1 },
    { k: 'v2', name: 'v2 · Heirloom', sub: 'calibrated probes', b: v2 },
  ];
  return (
    <Section
      id="results"
      title="Table 2 — Backtest."
      lede={`Does calibration help? Both pipelines on the same ${v2.cases} cases with known answers.`}
    >
      <div className="mt-8 grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-8">
          {/* below md: the same table transposed (metric × pipeline) so the key column never scrolls away */}
          <table className="w-full border-collapse text-left tabular-nums md:hidden">
            <caption className="sr-only">Table 2 — Backtest</caption>
            <thead>
              <tr className="border-b border-ink/60 align-bottom">
                <th scope="col" className="py-2 pr-3 label">
                  <span className="sr-only">Measure</span>
                </th>
                {rows.map((r) => (
                  <th key={r.k} scope="col" className="py-2 pl-3 text-right font-normal">
                    <span className="block text-[1rem] leading-tight">{r.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-rule bg-aff-bg/50">
                <th scope="row" className="py-3 pl-2 pr-3 label !text-ink">
                  False not affected
                </th>
                {rows.map((r) => (
                  <td key={r.k} className="py-3 pl-3 pr-2 text-right">
                    <span className={cn('text-[2rem] leading-none', r.k === 'v2' && 'font-medium')}>{r.b.false_not_affected}</span>
                  </td>
                ))}
              </tr>
              {(
                [
                  ['Cases', (b: typeof v1) => b.cases],
                  ['Accuracy (decided)', (b: typeof v1) => `${pct(b.accuracy)} (${b.decided})`],
                  ['Unproven', (b: typeof v1) => b.unproven],
                  ['Escalation', (b: typeof v1) => pct(b.escalation_rate)],
                ] as const
              ).map(([k, f]) => (
                <tr key={k} className="border-b border-rule">
                  <th scope="row" className="py-2 pr-3 label">
                    {k}
                  </th>
                  {rows.map((r) => (
                    <td key={r.k} className="py-2 pl-3 text-right font-mono text-[0.85rem]">
                      {f(r.b)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <table className="hidden w-full min-w-[34rem] md:table border-collapse text-left tabular-nums">
            <caption className="sr-only">Table 2 — Backtest</caption>
            <thead>
              <tr className="border-b border-ink/60 align-bottom">
                <th scope="col" className="py-2 pr-4 label">
                  Pipeline
                </th>
                <th scope="col" className="px-3 py-2 text-right label">
                  Cases
                </th>
                <th scope="col" className="px-3 py-2 text-right label">
                  Accuracy (decided)
                </th>
                <th scope="col" className="bg-aff-bg/50 px-3 py-2 text-right label !text-ink">
                  False not affected
                </th>
                <th scope="col" className="px-3 py-2 text-right label">
                  Unproven
                </th>
                <th scope="col" className="py-2 pl-3 text-right label">
                  Escalation
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.k} className="border-b border-rule">
                  <th scope="row" className="py-3 pr-4 font-normal">
                    <span className="block text-[1.05rem]">{r.name}</span>
                    <span className="block text-[0.85rem] text-muted">{r.sub}</span>
                  </th>
                  <td className="px-3 py-3 text-right font-mono text-[0.9rem]">{r.b.cases}</td>
                  <td className="px-3 py-3 text-right font-mono text-[0.9rem]">
                    {pct(r.b.accuracy)} <span className="text-muted">({r.b.decided})</span>
                  </td>
                  <td className="bg-aff-bg/50 px-3 py-3 text-right">
                    <span className={cn('text-[2.25rem] leading-none', r.k === 'v2' && 'font-medium')}>
                      {r.b.false_not_affected}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-[0.9rem]">{r.b.unproven}</td>
                  <td className="py-3 pl-3 text-right font-mono text-[0.9rem]">{pct(r.b.escalation_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 font-mono text-[0.75rem] text-muted">
            Source:{' '}
            <a className="link" href={site.files.results}>
              evals/results.json
            </a>
            . Accuracy counts decided cases only; v2 leaves {v2.unproven} UNPROVEN rather than guess.
          </p>
        </div>
        <div className="grid content-start gap-4 lg:col-span-4">
          <p>
            <strong className="font-medium">A false &ldquo;not affected&rdquo; is the dangerous error.</strong> It tells a
            maintainer that a vulnerable line is safe, so nobody patches it. The naive pipeline made {v1.false_not_affected}
            ; Heirloom made {v2.false_not_affected}.
          </p>
          <p className="text-muted">
            The naive pipeline&rsquo;s miss was <Nb>{v1.false_not_affected_cves.join(', ')}</Nb>. neatlogs watches for this error live:
            replaying that claim through the real stage path fired the{' '}
            <code className="font-mono text-[0.85em] text-ink">{d.name}</code> detection (run{' '}
            <span className="font-mono text-[0.85em]">{d.run_id}</span>)
            {det && det.hits === d.hits_after ? '. That is its only hit, so it never fired on the campaign.' : '.'}
          </p>
        </div>
      </div>
    </Section>
  );
}

/** Stated limits, in the manner of Jepsen's: short and plain. */
export function Limits() {
  const l = site.limits;
  const items: React.ReactNode[] = [
    <>
      These are <strong className="font-medium">candidate backports, not Django releases</strong>. Nobody at Django or at
      a distribution has reviewed or merged them.
    </>,
    <>
      Tests run on <strong className="font-medium">SQLite and PostGIS only</strong>. Fixes specific to MySQL, Oracle or
      SpatiaLite cannot be exercised.
    </>,
    <>
      <strong className="font-medium">UNPROVEN is by design</strong> for what Heirloom cannot exercise: it publishes the
      evidence, never a guess.
    </>,
    <>
      The <Nb>{site.finding?.cve ?? 'Fig. 2'}</Nb> matrix probe is <strong className="font-medium">hand-written</strong>; the
      campaign&rsquo;s own probe for it came from the porter.
    </>,
    <>
      The recovery shown (
      <a className="link" href={l.recovery.url}>
        <Nb>{l.recovery.cve}</Nb>, run <span className="font-mono text-[0.85em]">{l.recovery.run_id}</span>
      </a>
      ) was a <strong className="font-medium">worker killed during a harness restart</strong>, not an injected fault.
    </>,
    <>
      The campaign&rsquo;s harness was fixed and restarted{' '}
      <strong className="font-medium">{l.restarts}× mid-run</strong>. Each restart resumed from the ledger, and nothing was
      published twice.
    </>,
    <>
      The porter sees the advisory and upstream&rsquo;s test diff, <strong className="font-medium">never the fix&rsquo;s
      code hunks</strong>.
    </>,
  ];
  return (
    <Section id="limits" title="Stated limits.">
      <ul className="mt-8 grid max-w-[52rem] gap-3 md:ml-[8.333%]">
        {items.map((it, i) => (
          <li key={i} className="grid grid-cols-[1.25rem_1fr] gap-x-2">
            <span aria-hidden className="text-muted">
              –
            </span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Economics: what was measured, and the pricing hypotheses (cfo.ai model). */
export function Economics() {
  const e = site.economics;
  const s = site.summary;
  const measured = e.inputs.filter((i) => i.status.startsWith('measured'));
  const hypotheses = e.inputs.filter((i) => i.status === 'assumption');
  const runway = e.results.find((r) => r.name.toLowerCase() === 'runway');
  // values in dollars get a "$", so the model's " USD" suffix on the name is dropped
  const label = (name: string) => name.replace(/ USD\b/, '');
  const fmt = (name: string, v: string) => (v === '=' ? '=' : /USD|price|cost|cash|subscription/i.test(name) && !/rate/i.test(name) ? `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 4 })}` : v);
  return (
    <Section
      id="economics"
      title="Economics."
      lede="What a verdict cost in this campaign, measured. What it might sell for, as a hypothesis."
    >
      <div className="mt-8 grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <h3 className="label mb-3">Measured · campaign {site.campaign}</h3>
          <dl className="grid border-t border-rule">
            <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 border-b border-rule py-2">
              <dt>Campaign model cost</dt>
              <dd className="font-mono text-[0.9rem]">${s.cost_usd.toFixed(2)}</dd>
            </div>
            <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 border-b border-rule py-2">
              <dt>Campaign machine minutes</dt>
              <dd className="font-mono text-[0.9rem]">{s.minutes}</dd>
            </div>
            {measured.map((i) => (
              <div key={i.name} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 border-b border-rule py-2">
                <dt>
                  {label(i.name)}
                  {i.status !== 'measured' && <span className="block text-[0.85rem] text-muted">{i.status}</span>}
                </dt>
                <dd className="font-mono text-[0.9rem]">{fmt(i.name, i.base)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="min-w-0 lg:col-span-7">
          <h3 className="label mb-3">
            <span className="mr-2 rounded-chip border border-muted/50 px-1.5 py-0.5 text-ink">Hypothesis</span>
            Pricing and volume, no buyer asked
          </h3>
          <div>
            <table className="w-full border-collapse text-left tabular-nums">
              <thead>
                <tr className="border-b border-rule">
                  <th scope="col" className="py-2 pr-3 label">
                    Hypothesis
                  </th>
                  {e.pages.map((p) => (
                    <th key={p.name} scope="col" className="py-2 pl-2 text-right label sm:px-2">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hypotheses.map((i) => (
                  <tr key={i.name} className="border-b border-rule">
                    <th scope="row" className="py-2 pr-2 text-left font-normal leading-snug">
                      {label(i.name)}
                    </th>
                    {[i.base, i.bear, i.bull].map((v, k) => (
                      <td key={k} className="whitespace-nowrap py-2 pl-2 text-right font-mono text-[0.8rem] sm:px-2 sm:text-[0.85rem]">
                        {fmt(i.name, v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 font-mono text-[0.72rem] text-muted">&ldquo;=&rdquo; inherits the Base value.</p>
          {runway && (
            <dl className="mt-6 grid gap-2">
              <dt className="label">Runway, as modelled (hypothesis)</dt>
              {(['base', 'bear', 'bull'] as const).map((k, i) => (
                <dd key={k} className="grid grid-cols-[3.5rem_1fr] gap-x-2 text-[0.95rem]">
                  <span className="font-mono text-[0.8rem] text-muted">{e.pages[i]?.name}</span>
                  <span>{runway[k]}</span>
                </dd>
              ))}
            </dl>
          )}
          <p className="mt-6">
            The model lives in cfo.ai. Read-only pages:{' '}
            {e.pages.map((p, i) => (
              <span key={p.name}>
                {i > 0 && ' · '}
                <a className="link" href={p.url}>
                  {p.name}
                </a>
              </span>
            ))}
            . Every input and its source:{' '}
            <a className="link" href={e.plan}>
              docs/business-plan.md
            </a>
            .
          </p>
        </div>
      </div>
    </Section>
  );
}
