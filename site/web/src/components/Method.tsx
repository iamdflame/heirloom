import { prNum, site } from '@/lib/site';
import { Section } from './Section';

/** How a verdict is earned: the rule, then five numbered stages with the artifact behind each. */
export function Method() {
  const s = site.summary;
  const m = site.method;
  const f = site.finding;
  const q = site.query;
  const stages: { name: string; text: React.ReactNode; proof: React.ReactNode }[] = [
    {
      name: 'Locate the fix',
      text: 'Find the upstream commit that fixed the CVE on a supported branch, with its message and its test changes.',
      proof: (
        <>
          {f && (
            <>
              <a className="link font-mono text-[0.9em]" href={f.fix_url}>
                {f.fix_commit.slice(0, 10)}
              </a>{' '}
              for {f.cve} ·{' '}
            </>
          )}
          <a className="link" href={m.code.locate}>
            locate.py
          </a>
        </>
      ),
    },
    {
      name: 'Write an independent probe',
      text: 'A porter model writes a test from the advisory and upstream’s test diff. It never sees the fix’s code hunks.',
      proof: (
        <>
          The probe&rsquo;s sha in every receipt ·{' '}
          <a className="link" href={m.code.probe}>
            probe.py
          </a>
        </>
      ),
    },
    {
      name: 'Calibrate on upstream',
      text: `The probe must fail ×${s.probe_before} before the fix and pass ×${s.probe_after} after it, its coverage must reach the code the fix changes, and a rebuilt vulnerability must be caught.`,
      proof: (
        <>
          The calibration triangle in each receipt, e.g.{' '}
          <a className="link" href={`#${m.example.anchor}`}>
            {m.example.cve}
          </a>{' '}
          ·{' '}
          <a className="link" href={m.code.calibrate}>
            calibrate.py
          </a>
        </>
      ),
    },
    {
      name: 'Adapt and verify on the old line',
      text: 'Port the fix to 4.2. There the probe must go from fail to pass, and Django’s own tests must show no new failures.',
      proof: (
        <>
          {s.fail_to_pass} of {s.prs} PRs FAIL ×{s.probe_before} → PASS ×{s.probe_after}:{' '}
          <a className="link" href={m.evidence}>
            campaign_evidence.json
          </a>{' '}
          ·{' '}
          <a className="link" href={m.code.verify}>
            verify.py
          </a>
        </>
      ),
    },
    {
      name: 'Decide and publish',
      text: 'A verified port becomes a candidate backport PR with a claim table. What it cannot prove becomes an evidence issue. When a choice is real, it asks the owner once.',
      proof: (
        <>
          <a className="link" href={m.example.pr}>
            PR {prNum(m.example.pr)}
          </a>{' '}
          ·{' '}
          <a className="link" href={m.issue.url}>
            evidence {prNum(m.issue.url)}
          </a>{' '}
          ·{' '}
          <a className="link" href={q.issue}>
            question {prNum(q.issue)}
          </a>{' '}
          ·{' '}
          <a className="link" href={m.code.decide}>
            decide.py
          </a>
        </>
      ),
    },
  ];
  return (
    <Section id="method" title="Method — how a verdict is earned.">
      <p className="mt-8 max-w-[22ch] text-[2.4rem] leading-[1.08] tracking-[-0.02em] md:text-[3.4rem]">
        Never trust a test that hasn&rsquo;t failed.
      </p>
      <ol className="mt-10 grid border-t border-rule">
        {stages.map((st, i) => (
          <li key={st.name} className="grid gap-x-8 gap-y-1 border-b border-rule py-5 md:grid-cols-12">
            <p className="font-mono text-sm tabular-nums text-muted md:col-span-1">{String(i + 1).padStart(2, '0')}</p>
            <h3 className="text-xl leading-snug md:col-span-3">{st.name}</h3>
            <div className="md:col-span-8">
              <p className="max-w-measure">{st.text}</p>
              <p className="mt-1 text-[0.95rem] text-muted">
                <span className="label mr-2">Artifact</span>
                {st.proof}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
