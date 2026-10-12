import { prNum, site } from '@/lib/site';
import { Nb, Section, Stamp } from './Section';

/** The conservator's query: question #6, the wait, the answer, precedent P001 and its reuse. */
export function Query() {
  const q = site.query;
  const p = q.precedent;
  const applied = (cve: string) => p.applied_by.find((a) => a.cve === cve);
  const own = applied(q.asked_by);
  const reused = p.applied_by.filter((a) => a.cve !== q.asked_by);
  const conn = site.connector;
  const connRow = conn && site.rows.find((r) => r.cve === conn.from);
  const Trace = ({ id }: { id: string }) => (
    <span className="font-mono text-[0.72rem] text-muted [overflow-wrap:anywhere]">trace {id}</span>
  );
  const steps: { when?: string; title: React.ReactNode; detail?: React.ReactNode }[] = [
    {
      when: q.asked_at,
      title: (
        <>
          <Nb>{q.asked_by}</Nb> opens{' '}
          <a className="link" href={q.issue}>
            question {prNum(q.issue)}
          </a>
          .
        </>
      ),
      detail: (
        <>
          <span className="font-mono text-[0.8rem]">{p.kind}</span>: upstream&rsquo;s fix rewrote existing 4.2 tests in the
          same commit, so the verified backport makes them fail. Adopt upstream&rsquo;s test changes, or not? That is the
          owner&rsquo;s call, not the agent&rsquo;s. {q.asking_trace && <Trace id={q.asking_trace} />}
        </>
      ),
    },
    ...q.waited.map((cve) => ({
      title: (
        <>
          <Nb>{cve}</Nb> hits the same kind of choice and waits on {prNum(q.issue)} instead of asking again.
        </>
      ),
    })),
    {
      title: (
        <>
          The owner answers{' '}
          <a className="link" href={q.issue}>
            <code className="whitespace-nowrap font-mono text-[0.9em]">{p.answer}</code>
          </a>
          .
        </>
      ),
    },
    {
      when: p.stored_at,
      title: <>Precedent {p.id} is stored: next time, the same kind of choice gets the same answer without asking.</>,
    },
    ...(own
      ? [
          {
            title: (
              <>
                <a className="link" href={own.pr}>
                  {prNum(own.pr)}
                </a>{' '}
                applies it (<Nb>{own.cve}</Nb>).
              </>
            ),
            detail: <Trace id={own.trace_id} />,
          },
        ]
      : []),
    ...reused.map((a) => ({
      title: (
        <>
          <a className="link" href={a.pr}>
            {prNum(a.pr)}
          </a>{' '}
          reuses it without asking (<Nb>{a.cve}</Nb>).
        </>
      ),
      detail: <Trace id={a.trace_id} />,
    })),
    ...(conn && connRow
      ? [
          {
            title: (
              <>
                <a className="link" href={connRow.campaign.link}>
                  #{conn.pr}
                </a>{' '}
                (<Nb>{conn.from}</Nb>) is stacked on #{conn.on}: its upstream fix rewrites lines that <Nb>{conn.to}</Nb>&rsquo;s fix introduced.
              </>
            ),
            detail: connRow.campaign.traces?.[0] ? <Trace id={connRow.campaign.traces[0]} /> : undefined,
          },
        ]
      : []),
  ];
  return (
    <Section
      id="query"
      title="The conservator’s query."
      lede={`One question in ${site.summary.cves} advisories, asked once and answered once. The answer became policy.`}
    >
      <ol className="relative mt-10 grid max-w-[52rem] gap-7 border-l border-rule pl-8 md:ml-[8.333%]">
        {steps.map((s, i) => (
          <li key={i} className="relative">
            <span
              aria-hidden
              className="absolute -left-8 top-[0.45rem] h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-ink bg-paper"
            />
            <p className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-mono text-[0.75rem] tabular-nums text-muted">{String(i + 1).padStart(2, '0')}</span>
              {s.when && <Stamp iso={s.when} />}
            </p>
            <p className="mt-0.5 text-[1.1rem] leading-snug">{s.title}</p>
            {s.detail && <p className="mt-1 max-w-measure text-[0.95rem] text-muted">{s.detail}</p>}
          </li>
        ))}
      </ol>
    </Section>
  );
}
