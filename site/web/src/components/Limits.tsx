import { site } from '@/lib/site';
import { WRAP } from '@/lib/layout';
import { cn } from '@/lib/utils';
import { Nb } from './Section';

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
    <section id="limits" aria-labelledby="limits-h" className="border-t border-rule/60 py-24 md:py-32">
      <div className={cn(WRAP, 'grid gap-10 lg:grid-cols-12')}>
        <div className="lg:col-span-4">
          <p className="eyebrow">Stated limits</p>
          <h2 id="limits-h" className="display mt-5 text-[clamp(2.4rem,4.4vw,4rem)]">
            What this does <em className="italic text-brass-hi">not</em> prove.
          </h2>
        </div>
        <ol className="grid gap-0 border-t border-rule lg:col-span-8">
          {items.map((it, i) => (
            <li key={i} className="grid grid-cols-[2.5rem_1fr] gap-x-3 border-b border-rule py-4 text-[1.02rem] leading-relaxed text-ink/90">
              <span aria-hidden className="pt-1 font-mono text-[0.72rem] tabular-nums text-brass">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span>{it}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

