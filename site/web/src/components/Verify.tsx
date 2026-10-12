import { REASONS, prNum, site } from '@/lib/site';
import { RstTitle } from './Code';
import { CopyButton } from './CopyButton';
import { Section } from './Section';

const ENTIRE_CMD = "git log --format='%h %(trailers:key=Entire-Checkpoint,valueonly)'";

/** Verify it yourself: the front shelf of everything a claim on this page rests on. */
export function Verify() {
  const prs = site.rows.filter((r) => r.campaign.treatment === 'pr').sort((a, b) => a.campaign.number - b.campaign.number);
  const issues = site.rows.filter((r) => r.campaign.treatment === 'issue').sort((a, b) => a.campaign.number - b.campaign.number);
  const line = site.lines.find((l) => l.kind === 'eval') ?? site.lines[0]!;
  const ftp = (r: (typeof prs)[number]) => {
    const f = r.campaign.fail_to_pass;
    return f ? `${f.before[0]}×${f.before.length} → ${f.after[0]}×${f.after.length}` : '';
  };
  return (
    <Section
      id="verify"
      title="Verify it yourself."
      lede="Everything this page claims rests on something public. Start anywhere on the shelf."
    >
      <div className="mt-10 grid gap-x-12 gap-y-14 lg:grid-cols-12">
        <Shelf title={`Candidate backport PRs · ${prs.length}`} className="lg:col-span-12">
          <ul className="border-t border-rule">
            {prs.map((r) => (
              <li
                key={r.cve}
                className="grid gap-x-4 gap-y-0.5 border-b border-rule py-2.5 md:grid-cols-[4rem_10.5rem_minmax(0,1fr)] md:items-baseline lg:grid-cols-[4rem_10.5rem_minmax(0,1fr)_auto]"
              >
                <a className="link font-mono text-[0.95rem]" href={r.campaign.link}>
                  {prNum(r.campaign.link)}
                </a>
                <span className="font-mono text-[0.8rem]">{r.cve}</span>
                <span className="leading-snug [overflow-wrap:anywhere]">
                  <RstTitle text={r.title} />
                </span>
                <span className="font-mono text-[0.75rem] text-muted md:col-start-3 lg:col-start-auto lg:text-right">
                  {line.name} · {ftp(r)}
                </span>
              </li>
            ))}
          </ul>
        </Shelf>

        <Shelf title={`Evidence issues · ${issues.length}`} className="lg:col-span-7">
          <ul className="border-t border-rule">
            {issues.map((r) => (
              <li key={r.cve} className="grid gap-x-4 gap-y-0.5 border-b border-rule py-2.5 sm:grid-cols-[3rem_10.5rem_minmax(0,1fr)]">
                <a className="link font-mono text-[0.95rem]" href={r.campaign.link}>
                  {prNum(r.campaign.link)}
                </a>
                <span className="font-mono text-[0.8rem]">{r.cve}</span>
                <span className="leading-snug">
                  <span className="font-mono text-[0.75rem]">{r.campaign.verdict.replaceAll('_', ' ')}</span>
                  {r.campaign.reason && REASONS[r.campaign.reason] && (
                    <span className="block text-[0.95rem] text-muted">{REASONS[r.campaign.reason]}</span>
                  )}
                  {r.campaign.verdict === 'NOT_AFFECTED_PROVEN' && (
                    <span className="block text-[0.95rem] text-muted">proven not affected; evidence instead of a patch</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[0.95rem] text-muted">
            And the one question:{' '}
            <a className="link" href={site.query.issue}>
              {prNum(site.query.issue)}
            </a>
            .
          </p>
        </Shelf>

        <div className="grid content-start gap-12 lg:col-span-5">
          <Shelf title="Entire checkpoints">
            <p>
              Build sessions are linked from this repository&rsquo;s commit trailers. Every backport commit also carries its
              runtime checkpoint (refs under <code className="font-mono text-[0.85em]">refs/entire/checkpoints/</code>).
            </p>
            <div className="mt-3 flex items-center justify-between gap-2 rounded-chip border border-rule bg-surface pl-3">
              <code className="min-w-0 font-mono text-[0.75rem] [overflow-wrap:anywhere]">{ENTIRE_CMD}</code>
              <CopyButton value={ENTIRE_CMD} label="command" />
            </div>
            <p className="mt-2 text-[0.95rem]">
              <a className="link" href={site.files.entire_docs}>
                Saved review, recap and checkpoint explanations
              </a>
            </p>
          </Shelf>

          <Shelf title="neatlogs detections">
            <ul className="grid gap-1">
              {site.detections.map((d) => (
                <li key={d.name} className="flex items-baseline justify-between gap-3">
                  <code className="min-w-0 font-mono text-[0.78rem] [overflow-wrap:anywhere]">{d.name}</code>
                  <span className="font-mono text-[0.8rem] tabular-nums">
                    {d.hits} {d.hits === 1 ? 'hit' : 'hits'}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[0.95rem]">
              <a className="link" href={site.files.detections}>
                detections.json
              </a>{' '}
              ·{' '}
              <a className="link" href={site.files.detections_flag_check}>
                the flag check
              </a>
              . Traces live in a private neatlogs org; their ids are on every PR, issue and receipt.
            </p>
          </Shelf>

          <Shelf title="Outside the repository">
            <ul className="grid gap-1.5">
              <li>
                <a className="link" href={site.eol_source}>
                  endoflife.date/django
                </a>{' '}
                <span className="text-muted">confirms 4.2&rsquo;s end of life on {site.eol}.</span>
              </li>
              <li>
                <a className="link" href={site.repo}>
                  The repository
                </a>{' '}
                <span className="text-muted">holds the code, the ledger exports and this page&rsquo;s source.</span>
              </li>
              <li>
                <a className="link" href={site.files.evidence_md}>
                  EVIDENCE.md
                </a>{' '}
                <span className="text-muted">maps each claim to its link.</span>
              </li>
            </ul>
          </Shelf>
        </div>
      </div>
    </Section>
  );
}

function Shelf({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <h3 className="mb-3 text-2xl leading-tight">{title}</h3>
      {children}
    </div>
  );
}
