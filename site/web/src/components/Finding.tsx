import { useEffect, useRef, useState } from 'react';
import { m, useInView, useReducedMotion } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';
import { REASONS, lineById, rowByAnchor, site } from '@/lib/site';
import { dayOf, md } from '@/lib/campaign';
import { WRAP } from '@/lib/layout';
import { cn } from '@/lib/utils';
import { Nb, curly } from './Section';
import { Chip } from './Chip';
import { Reveal } from './fx';

const times = (o: string[]) => (o.every((x) => x === o[0]) ? `${o[0]} ×${o.length}` : o.join(' · '));
const EASE = [0.23, 1, 0.32, 1] as const;

/** Beat 4, the finding: Oct 1 and Oct 6 lock around the gap, the probe run types out, then the claim. */
export function Finding() {
  const f = site.finding;
  if (!f) return null;
  const line = lineById[f.line];
  const row = site.rows.find((r) => r.cve === f.cve);
  const cell = row?.cells.find((c) => c.line === f.line);
  const gap = dayOf(f.advisory_date) - dayOf(f.distro_date);
  const short = f.fix_commit.slice(0, 8);
  return (
    <section id="finding" aria-labelledby="finding-h" className="relative overflow-hidden py-28 md:py-40">
      <div className={WRAP}>
        <p className="eyebrow">The finding · {line.name}</p>
        <h2 id="finding-h" className="display mt-5 max-w-[18ch] text-[clamp(2.6rem,6vw,5.5rem)]">
          A patch shipped. <em className="italic text-brass-hi">{gap} days later, upstream amended it.</em>
        </h2>

        <Plates a={f.distro_date} b={f.advisory_date} gap={gap} aText={`Ubuntu ships its ${f.amends} patch`} bText={`Django amends it as ${f.cve}`} />

        <div className="mt-16 grid gap-10 lg:grid-cols-12 lg:gap-12">
          <Reveal className="lg:col-span-6">
            <Terminal
              lines={[
                { k: 'probe', v: `${f.cve} · ${f.hand_written ? 'hand-written' : 'porter'} · sha ${f.probe_sha.slice(0, 12)}` },
                { k: 'U⁻', v: `upstream before ${short}`, r: f.um },
                { k: 'U⁺', v: `upstream after ${short}`, r: f.up },
                { k: line.note, v: f.version, r: f.lt },
              ]}
              caption={`The calibrated probe on ${line.note}’s tree, ${md(f.probe_date)} ${f.probe_date.slice(11, 16)}Z (from the matrix run’s raw log).`}
            />
          </Reveal>
          <div className="lg:col-span-6">
            <Reveal>
              <blockquote className="m-0 border-l border-brass/50 pl-6">
                <p className="display text-[clamp(1.8rem,2.8vw,2.6rem)] leading-[1.12]">
                  {curly(f.claim)
                    .split(/(CVE-\d{4}-\d+)/)
                    .map((t, i) => (i % 2 ? <Nb key={i}>{t}</Nb> : t))}
                </p>
              </blockquote>
            </Reveal>
            <Reveal delay={0.1} className="mt-8 grid gap-4 text-[0.98rem] text-ink/85">
              <p>
                The probe is {f.hand_written ? 'hand-written' : 'written by the independent porter'} and calibrated on Django&rsquo;s
                own fix commits: {times(f.um)} before{' '}
                <a className="link font-mono text-[0.9em]" href={f.fix_url}>
                  {short}
                </a>
                , {times(f.up)} after. On {line.name} it fails: {times(f.lt)}{' '}
                {cell && <Chip chip={cell.chip} className="ml-1 align-[0.1em]" />}
              </p>
              <p className="text-muted">
                This is a test result on one package version. It makes no claim about exploitability, and none about other
                Ubuntu releases.
                {f.amends_noble === 'UNPROVEN' && f.amends_noble_reason && REASONS[f.amends_noble_reason] && (
                  <>
                    {' '}
                    <Nb>{f.amends}</Nb> itself stays UNPROVEN on {line.note}: {REASONS[f.amends_noble_reason]}.
                  </>
                )}
              </p>
              <p className="flex flex-wrap gap-x-6 gap-y-2">
                <a className="link inline-flex items-center gap-1" href={f.logs}>
                  Raw logs of the matrix run <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </a>
                {row && rowByAnchor.has(row.anchor) && (
                  <a className="link" href={`#${row.anchor}`}>
                    Open the receipt ({row.acc})
                  </a>
                )}
                <a className="link inline-flex items-center gap-1" href={f.draft}>
                  Draft report to Ubuntu (not filed) <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </a>
              </p>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

function Plates({ a, b, gap, aText, bText }: { a: string; b: string; gap: number; aText: string; bText: string }) {
  const reduce = useReducedMotion();
  const fly = (x: number, delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, x },
          whileInView: { opacity: 1, x: 0 },
          viewport: { once: true, margin: '-15% 0px' },
          transition: { duration: 1.1, ease: EASE, delay },
        };
  return (
    <div className="mt-14 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr] md:gap-0">
      <m.div {...fly(-160, 0)} className="plate rounded-[12px] px-6 py-6 md:rounded-r-none md:text-right">
        <p className="label">{a}</p>
        <p className="engraved display mt-1 text-6xl md:text-7xl">{md(a)}</p>
        <p className="mt-2 text-ink/85">{aText}</p>
      </m.div>
      <m.div
        {...(reduce ? {} : { initial: { opacity: 0, scaleX: 0.2 }, whileInView: { opacity: 1, scaleX: 1 }, viewport: { once: true, margin: '-15% 0px' }, transition: { duration: 0.7, ease: EASE, delay: 0.9 } })}
        className="relative flex items-center justify-center overflow-hidden border-y border-brass/60 bg-brass/10 px-8 py-4 md:py-0"
      >
        <span className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgb(var(--brass-hi)/0.25),transparent)] bg-[length:200%_100%] [animation:shimmer_3.5s_ease-in-out_infinite]" />
        <span className="relative whitespace-nowrap font-mono text-sm uppercase tracking-[0.2em] text-brass-hi">{gap} days</span>
      </m.div>
      <m.div {...fly(160, 0.15)} className="plate rounded-[12px] px-6 py-6 md:rounded-l-none">
        <p className="label">{b}</p>
        <p className="engraved display mt-1 text-6xl md:text-7xl">{md(b)}</p>
        <p className="mt-2 text-ink/85">{bText}</p>
      </m.div>
    </div>
  );
}

type TLine = { k: string; v: string; r?: string[] };
/** A terminal card that types the run out once it is in view. Screen readers get the whole text at once. */
function Terminal({ lines, caption }: { lines: TLine[]; caption: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-20% 0px' });
  const reduce = useReducedMotion();
  const text = lines.map((l) => `${l.k.padEnd(6)} ${l.v}${l.r ? '\n       ' + l.r.join('  ') : ''}`);
  const total = text.join('\n').length;
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (reduce) return setN(total);
    const id = window.setInterval(() => setN((x) => (x >= total ? (window.clearInterval(id), x) : x + 2)), 16);
    return () => window.clearInterval(id);
  }, [inView, reduce, total]);
  let left = n;
  return (
    <figure className="m-0">
      <div ref={ref} className="overflow-hidden rounded-[12px] border border-rule bg-[#060707] shadow-[0_30px_80px_-30px_rgb(0_0_0/0.9)]">
        <div className="flex items-center gap-1.5 border-b border-rule px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-rule" />
          <span className="h-2.5 w-2.5 rounded-full bg-rule" />
          <span className="h-2.5 w-2.5 rounded-full bg-rule" />
          <span className="ml-3 font-mono text-[0.7rem] text-muted">calibrated probe · matrix run</span>
        </div>
        <pre aria-hidden className="min-h-[13.5rem] overflow-x-auto whitespace-pre px-5 py-5 font-mono text-[0.8rem] leading-[1.75] text-ink/90 md:text-[0.85rem]">
          {text.map((t, i) => {
            const shown = t.slice(0, Math.max(0, left));
            left -= t.length + 1;
            return (
              <span key={i} className="block">
                {shown.split(/(FAIL|PASS)/).map((w, j) =>
                  w === 'FAIL' ? (
                    <span key={j} className="font-medium text-aff-fg">FAIL</span>
                  ) : w === 'PASS' ? (
                    <span key={j} className="font-medium text-fix-fg">PASS</span>
                  ) : (
                    <span key={j} className={cn(j === 0 && 'text-brass')}>{w}</span>
                  ),
                )}
                {shown.length > 0 && shown.length < t.length && <span className="ml-px inline-block h-[1em] w-[0.55em] translate-y-[0.15em] bg-brass-hi" />}
              </span>
            );
          })}
        </pre>
        <pre className="sr-only">{text.join('\n')}</pre>
      </div>
      <figcaption className="mt-3 font-mono text-[0.72rem] text-muted">{caption}</figcaption>
    </figure>
  );
}
