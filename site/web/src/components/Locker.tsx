import { useEffect, useRef, useState } from 'react';
import { m, useInView, useReducedMotion } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';
import { REASONS, prNum, site } from '@/lib/site';
import { WRAP } from '@/lib/layout';
import { RstTitle } from './Code';
import { CopyButton } from './CopyButton';
import { Photo } from './Photo';

const raw = (blob: string) => blob.replace('https://github.com/', 'https://raw.githubusercontent.com/').replace('/blob/', '/');
const eolApi = `https://endoflife.date/api/${site.eol_source.split('/').pop()}/4.2.json`;
const COMMANDS = [
  { tool: 'Entire', what: 'the checkpoint behind every commit', cmd: "git log --format='%h %(trailers:key=Entire-Checkpoint,valueonly)'", href: site.files.entire_docs, link: 'saved reviews and recaps' },
  { tool: 'neatlogs', what: 'the detections and their hits', cmd: `curl -s ${raw(site.files.detections)}`, href: site.files.detections_flag_check, link: 'the flag check' },
  { tool: 'endoflife.date', what: `4.2’s end of life (${site.eol})`, cmd: `curl -s ${eolApi}`, href: site.eol_source, link: 'endoflife.date/django' },
];

/** Beat 11, the evidence locker: every PR and issue as a card, and the commands to check the rest yourself. */
export function Locker() {
  const prs = site.rows.filter((r) => r.campaign.treatment === 'pr').sort((a, b) => a.campaign.number - b.campaign.number);
  const issues = site.rows.filter((r) => r.campaign.treatment === 'issue').sort((a, b) => a.campaign.number - b.campaign.number);
  const ftp = (r: (typeof prs)[number]) => {
    const f = r.campaign.fail_to_pass;
    return f ? `${f.before[0]} ×${f.before.length} → ${f.after[0]} ×${f.after.length}` : '';
  };
  return (
    <section id="evidence" aria-labelledby="evidence-h" className="relative isolate overflow-hidden py-24 md:py-36">
      <div aria-hidden className="absolute inset-0 -z-10">
        <Photo name="archive" sizes="100vw" className="h-full w-full opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-b from-paper via-paper/55 to-paper" />
      </div>
      <div className={WRAP}>
        <p className="eyebrow">Evidence locker</p>
        <h2 id="evidence-h" className="display mt-5 max-w-[20ch] text-[clamp(2.6rem,5.4vw,5rem)]">
          Everything here rests on something <em className="italic text-brass-hi">you can open.</em>
        </h2>

        <h3 className="label mt-14">Candidate backport PRs · {prs.length}</h3>
        <Fan className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {prs.map((r) => (
            <a key={r.cve} href={r.campaign.link} className="locker-card group block h-full rounded-[10px] border border-rule bg-surface/85 px-4 py-3.5 no-underline backdrop-blur-sm">
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[1.05rem] text-brass-hi">PR {prNum(r.campaign.link)}</span>
                <span className="font-mono text-[0.7rem] text-fix-fg">{ftp(r)}</span>
              </span>
              <span className="mt-1 block font-mono text-[0.75rem] text-muted">{r.cve}</span>
              <span className="mt-1.5 block text-[0.9rem] leading-snug text-ink/90 [overflow-wrap:anywhere]">
                <RstTitle text={r.title} />
              </span>
            </a>
          ))}
        </Fan>

        <h3 className="label mt-12">Evidence issues · {issues.length}</h3>
        <Fan className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {issues.map((r) => (
            <a key={r.cve} href={r.campaign.link} className="locker-card block h-full rounded-[10px] border border-rule bg-surface/85 px-4 py-3.5 no-underline backdrop-blur-sm">
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[1.05rem] text-brass-hi">Issue {prNum(r.campaign.link)}</span>
                <span className="font-mono text-[0.7rem] text-muted">{r.campaign.verdict.replaceAll('_', ' ')}</span>
              </span>
              <span className="mt-1 block font-mono text-[0.75rem] text-muted">{r.cve}</span>
              <span className="mt-1.5 block text-[0.9rem] leading-snug text-ink/85">
                {r.campaign.reason && REASONS[r.campaign.reason]
                  ? REASONS[r.campaign.reason]
                  : r.campaign.verdict === 'NOT_AFFECTED_PROVEN'
                    ? 'proven not affected; evidence instead of a patch'
                    : ''}
              </span>
            </a>
          ))}
        </Fan>
        <p className="mt-4 text-[0.95rem] text-muted">
          And the one question:{' '}
          <a className="link" href={site.query.issue}>
            issue {prNum(site.query.issue)}
          </a>
          . Claim by claim:{' '}
          <a className="link" href={site.files.evidence_md}>
            EVIDENCE.md
          </a>
          .
        </p>

        <h3 className="label mt-14">Check it yourself</h3>
        <ul className="mt-4 grid gap-4 lg:grid-cols-3">
          {COMMANDS.map((c, i) => (
            <li key={c.tool} className="flex flex-col rounded-[12px] border border-rule bg-paper/90">
              <div className="flex items-center gap-2 border-b border-rule px-4 py-2">
                <span aria-hidden className="h-2 w-2 rounded-full bg-brass/70" />
                <span className="text-[0.9rem] font-medium">{c.tool}</span>
                <span className="truncate text-[0.82rem] text-muted">· {c.what}</span>
              </div>
              <div className="flex items-start justify-between gap-2 py-2 pl-4 pr-1">
                <Typed text={c.cmd} delay={i * 500} />
                <CopyButton value={c.cmd} label={`${c.tool} command`} />
              </div>
              <a className="link mt-auto inline-flex items-center gap-1 px-4 pb-3 text-[0.88rem] text-ink/80" href={c.href}>
                {c.link} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-[48rem] text-[0.9rem] text-muted">
          neatlogs traces live in a private org; their ids are on every PR, issue and receipt. Every backport commit carries its
          runtime checkpoint under <code className="font-mono text-[0.85em]">refs/entire/checkpoints/</code>.
        </p>
      </div>
    </section>
  );
}

/** Children fan in (a slight rotation and drop, staggered) when the grid enters the viewport. */
function Fan({ children, className }: { children: React.ReactNode[]; className?: string }) {
  const ref = useRef<HTMLUListElement>(null);
  const seen = useInView(ref, { once: true, margin: '-10% 0px' });
  const reduce = useReducedMotion();
  return (
    <ul ref={ref} className={className}>
      {children.map((c, i) => (
        <m.li
          key={i}
          initial={reduce ? false : { opacity: 0, y: 40, rotate: (i % 2 ? 1 : -1) * (3 + (i % 3)) }}
          animate={seen || reduce ? { opacity: 1, y: 0, rotate: 0 } : undefined}
          transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1], delay: i * 0.05 }}
        >
          {c}
        </m.li>
      ))}
    </ul>
  );
}

/** A command that types itself out once on view; the full text is always in the DOM for copy and screen readers. */
function Typed({ text, delay }: { text: string; delay: number }) {
  const ref = useRef<HTMLElement>(null);
  const seen = useInView(ref, { once: true, margin: '-10% 0px' });
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? text.length : 0);
  useEffect(() => {
    if (!seen || reduce) return;
    let i = 0;
    let t: number;
    const start = window.setTimeout(function tick() {
      i = Math.min(text.length, i + 2);
      setN(i);
      if (i < text.length) t = window.setTimeout(tick, 18);
    }, delay);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(t);
    };
  }, [seen, reduce, text, delay]);
  return (
    <code ref={ref} className="relative min-w-0 py-1.5 font-mono text-[0.78rem] leading-relaxed [overflow-wrap:anywhere]">
      <span className="text-brass">$ </span>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.slice(0, n)}
        {n < text.length && <span className="ml-px inline-block h-[1em] w-[0.5em] translate-y-[0.15em] bg-brass-hi" />}
        <span className="invisible">{text.slice(n)}</span>
      </span>
    </code>
  );
}
