import { m, useReducedMotion } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';
import { prNum, site } from '@/lib/site';
import { WRAP } from '@/lib/layout';
import { cn } from '@/lib/utils';
import { Nb, Stamp } from './Section';
import { Hallmark } from './Hallmark';
import { Reveal } from './fx';

type Msg = { who: 'heirloom' | 'owner' | 'seal'; when?: string; kind: string; body: React.ReactNode; meta?: React.ReactNode; href?: string };

const Trace = ({ id, run }: { id: string; run?: string }) => (
  <span className="font-mono text-[0.7rem] text-muted [overflow-wrap:anywhere]">
    {run && <>run {run} · </>}trace {id}
  </span>
);

/** Beat 8, the question: the real exchange from issue #6 as a thread; precedent P001 is stamped, then reused. */
export function Question() {
  const q = site.query;
  const p = q.precedent;
  const own = p.applied_by.find((a) => a.cve === q.asked_by);
  const reused = p.applied_by.filter((a) => a.cve !== q.asked_by);
  const conn = site.connector;
  const connRow = conn && site.rows.find((r) => r.cve === conn.from);
  const issue = prNum(q.issue);
  const msgs: Msg[] = [
    {
      who: 'heirloom',
      when: q.asked_at,
      kind: `asks · ${issue}`,
      href: q.issue,
      body: (
        <>
          <Nb>{q.asked_by}</Nb>: upstream&rsquo;s fix rewrote existing 4.2 tests in the same commit, so the verified backport
          makes them fail. Adopt upstream&rsquo;s test changes, or not? That is the owner&rsquo;s call, not the agent&rsquo;s.
        </>
      ),
      meta: (
        <>
          <span className="font-mono text-[0.7rem] text-brass">{p.kind}</span> {q.asking_trace && <Trace id={q.asking_trace} />}
        </>
      ),
    },
    ...q.waited.map(
      (cve): Msg => ({
        who: 'heirloom',
        kind: 'waits',
        body: (
          <>
            <Nb>{cve}</Nb> hits the same kind of choice and waits on {issue} instead of asking again.
          </>
        ),
      }),
    ),
    {
      who: 'owner',
      kind: `answers · ${issue}`,
      href: q.issue,
      body: (
        <code className="font-mono text-[1.05rem]">
          <span className="text-muted">/heirloom answer </span>
          <span className="text-brass-hi">{p.answer}</span>
        </code>
      ),
    },
  ];
  const after: Msg[] = [
    ...(own
      ? [
          {
            who: 'heirloom' as const,
            kind: `applies · PR ${prNum(own.pr)}`,
            href: own.pr,
            body: (
              <>
                <a className="link" href={own.pr}>
                  {prNum(own.pr)}
                </a>{' '}
                applies {p.id} to <Nb>{own.cve}</Nb>, the advisory that asked.
              </>
            ),
            meta: <Trace id={own.trace_id} run={own.run_id} />,
          },
        ]
      : []),
    ...reused.map(
      (a): Msg => ({
        who: 'heirloom',
        kind: `reuses · PR ${prNum(a.pr)}`,
        href: a.pr,
        body: (
          <>
            <a className="link" href={a.pr}>
              {prNum(a.pr)}
            </a>{' '}
            reuses it for <Nb>{a.cve}</Nb> <strong className="font-medium text-ink">without asking</strong>.
          </>
        ),
        meta: <Trace id={a.trace_id} run={a.run_id} />,
      }),
    ),
    ...(conn && connRow
      ? [
          {
            who: 'heirloom' as const,
            kind: `stacks · PR #${conn.pr}`,
            href: connRow.campaign.link,
            body: (
              <>
                <a className="link" href={connRow.campaign.link}>
                  #{conn.pr}
                </a>{' '}
                (<Nb>{conn.from}</Nb>) is stacked on #{conn.on}: its upstream fix rewrites lines that <Nb>{conn.to}</Nb>&rsquo;s fix
                introduced.
              </>
            ),
            meta: connRow.campaign.traces?.[0] ? <Trace id={connRow.campaign.traces[0]} /> : undefined,
          },
        ]
      : []),
  ];
  return (
    <section id="question" aria-labelledby="question-h" className="relative overflow-hidden py-24 md:py-36">
      <div className={cn(WRAP, 'grid gap-12 lg:grid-cols-12')}>
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-28">
            <p className="eyebrow">The question</p>
            <h2 id="question-h" className="display mt-5 text-[clamp(2.6rem,5.4vw,5rem)]">
              One question in {site.summary.cves} advisories. <em className="italic text-brass-hi">Asked once, answered once.</em>
            </h2>
            <p className="mt-6 max-w-[30rem] text-lg text-ink/80">
              When a choice belongs to the owner, Heirloom asks, waits, and turns the answer into a precedent so the same
              kind of choice never needs asking again.
            </p>
            <a className="link mt-6 inline-flex items-center gap-1.5 text-brass-hi" href={q.issue}>
              Read issue {issue} on GitHub <ArrowUpRight className="h-4 w-4" aria-hidden />
            </a>
          </div>
        </div>
        <ol className="relative grid gap-4 lg:col-span-7" style={{ perspective: 1200 }}>
          <span aria-hidden className="absolute bottom-6 left-[1.35rem] top-6 w-px bg-gradient-to-b from-brass/0 via-brass/40 to-brass/0" />
          {msgs.map((x, i) => (
            <Card key={i} m={x} i={i} />
          ))}
          <Seal id={p.id} kind={p.kind} answer={p.answer} at={p.stored_at} />
          {after.map((x, i) => (
            <Card key={`a${i}`} m={x} i={i} />
          ))}
        </ol>
      </div>
    </section>
  );
}

function Avatar({ who }: { who: Msg['who'] }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border',
        who === 'owner' ? 'border-ink/40 bg-raised font-mono text-[0.7rem] text-ink' : 'border-brass/50 bg-paper',
      )}
    >
      {who === 'owner' ? 'OWN' : <Hallmark size={26} />}
    </span>
  );
}

function Card({ m: x, i }: { m: Msg; i: number }) {
  const reduce = useReducedMotion();
  return (
    <m.li
      className="flex gap-4"
      initial={reduce ? false : { opacity: 0, rotateX: -60, y: 20 }}
      whileInView={{ opacity: 1, rotateX: 0, y: 0 }}
      viewport={{ once: true, margin: '-8% 0px' }}
      transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1], delay: Math.min(i, 3) * 0.06 }}
      style={{ transformOrigin: '50% 0%' }}
    >
      <Avatar who={x.who} />
      <div className={cn('min-w-0 flex-1 rounded-[12px] border px-5 py-4', x.who === 'owner' ? 'border-ink/25 bg-raised' : 'border-rule bg-surface/70')}>
        <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-[0.9rem]">
            <span className="font-medium">{x.who === 'owner' ? 'Repository owner' : 'Heirloom'}</span>{' '}
            <span className="text-muted">{x.kind}</span>
          </span>
          {x.when && <Stamp iso={x.when} />}
        </p>
        <p className="mt-2 leading-relaxed text-ink/90">{x.body}</p>
        {x.meta && <p className="mt-2">{x.meta}</p>}
      </div>
    </m.li>
  );
}

/** Precedent P001: a wax seal that cools into a brass hallmark as it lands. */
function Seal({ id, kind, answer, at }: { id: string; kind: string; answer: string; at: string }) {
  const reduce = useReducedMotion();
  return (
    <li className="flex gap-4 py-3">
      <span aria-hidden className="w-11 shrink-0" />
      <Reveal className="plate flex flex-1 items-center gap-5 rounded-[12px] px-5 py-5">
        <m.span
          aria-hidden
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full"
          initial={reduce ? false : { scale: 1.8, opacity: 0, backgroundColor: 'rgb(122 15 26)', color: 'rgb(255 214 200)' }}
          whileInView={{ scale: [1.8, 0.92, 1], opacity: 1, backgroundColor: ['rgb(122 15 26)', 'rgb(122 15 26)', 'rgb(22 25 27)'], color: ['rgb(255 214 200)', 'rgb(230 203 142)', 'rgb(230 203 142)'] }}
          viewport={{ once: true, margin: '-15% 0px' }}
          transition={{ duration: 1.1, times: [0, 0.45, 1], ease: [0.23, 1, 0.32, 1] }}
          style={{ boxShadow: '0 0 0 1px rgb(200 168 106 / 0.5), 0 8px 24px -8px rgb(0 0 0 / 0.9)' }}
        >
          <Hallmark size={60} className="text-current" />
        </m.span>
        <div className="min-w-0">
          <p className="label !text-brass">Precedent sealed</p>
          <p className="display mt-1 text-[2rem] leading-none">
            {id} <span className="font-mono text-[0.95rem] text-brass-hi">{answer}</span>
          </p>
          <p className="mt-2 text-[0.92rem] text-ink/80">
            Next time a <span className="font-mono text-[0.85em]">{kind}</span> choice comes up, the same answer applies without asking.
          </p>
          <p className="mt-1">
            <Stamp iso={at} />
          </p>
        </div>
      </Reveal>
    </li>
  );
}
