import { ArrowDown, ArrowRight, ArrowUpRight } from 'lucide-react';
import { DEMO_LABEL, DEMO_URL, site, longDate } from '@/lib/site';
import { CountUp, Magnetic, WordReveal } from './fx';
import { HeroVisual } from './HeroVisual';

const FIGURES = [
  { n: site.summary.prs, label: 'candidate backports', sub: 'probe fails before, passes after' },
  { n: site.backtest.v2.false_not_affected, label: 'false “not affected”', sub: `on the ${site.backtest.v2.cases}-case backtest` },
  { n: site.summary.questions, label: site.summary.questions === 1 ? 'question asked' : 'questions asked', sub: 'its answer became precedent' },
];

export function Hero() {
  return (
    <section id="top" aria-labelledby="headline" className="relative isolate flex min-h-[100svh] items-end overflow-hidden pb-14 pt-28 md:pb-20">
      <HeroVisual />
      <div className="relative z-10 mx-auto w-full max-w-[90rem] px-5 md:px-10">
        <div className="max-w-[46rem]">
          <p className="eyebrow rise" style={{ animationDelay: '60ms' }}>
            Record {site.record} · {site.object} · end of life {longDate(site.eol)}
          </p>
          <WordReveal
            id="headline"
            className="display mt-6 text-[clamp(3.6rem,10.5vw,9.5rem)] leading-[0.9]"
            parts={[{ text: 'Old software,' }, { text: 'kept honest.', em: true }]}
            delay={160}
          />
          <p className="rise mt-7 max-w-[34rem] text-lg leading-relaxed text-ink/85 md:text-xl" style={{ animationDelay: '620ms' }}>
            Heirloom is an agent that keeps end-of-life software patched, and proves which old versions are actually
            vulnerable. Every verdict is a test run you can open.
          </p>
          <dl className="rise mt-10 grid max-w-[40rem] grid-cols-3 gap-4 border-t border-brass/25 pt-6" style={{ animationDelay: '820ms' }}>
            {FIGURES.map((f, i) => (
              <div key={f.label}>
                <dt className="sr-only">{f.label}</dt>
                <dd className="m-0">
                  <CountUp value={f.n} start={900 + i * 180} className="display block text-[clamp(2.6rem,6vw,4.2rem)] leading-none text-brass-hi" />
                  <span aria-hidden className="mt-2 block text-[0.95rem] leading-snug text-ink">
                    {f.label}
                  </span>
                  <span className="mt-0.5 hidden font-mono text-[0.7rem] leading-snug text-muted sm:block">{f.sub}</span>
                </dd>
              </div>
            ))}
          </dl>
          <div className="rise mt-10 flex flex-wrap gap-3" style={{ animationDelay: '1100ms' }}>
            <Magnetic href="#watch" className="btn btn-brass press">
              Watch it work <ArrowDown className="h-4 w-4" aria-hidden />
            </Magnetic>
            <Magnetic href="#finding" className="btn btn-ghost press">
              Open the proof <ArrowRight className="h-4 w-4" aria-hidden />
            </Magnetic>
            <Magnetic href={DEMO_URL} target="_blank" rel="noopener" className="btn btn-ghost press">
              {DEMO_LABEL} <ArrowUpRight className="h-4 w-4" aria-hidden />
            </Magnetic>
          </div>
        </div>
      </div>
    </section>
  );
}
