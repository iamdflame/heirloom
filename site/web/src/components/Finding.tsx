import { REASONS, lineById, rowByAnchor, site } from '@/lib/site';
import { Nb, Section, Stamp, curly } from './Section';
import { Chip } from './Chip';

const times = (o: string[]) => (o.every((x) => x === o[0]) ? `${o[0]} ×${o.length}` : o.join(' · '));

/** Fig. 2 — the Ubuntu finding, told in three dated steps. */
export function Finding() {
  const f = site.finding;
  if (!f) return null;
  const line = lineById[f.line];
  const row = site.rows.find((r) => r.cve === f.cve);
  const amendsRow = site.rows.find((r) => r.cve === f.amends);
  const cell = row?.cells.find((c) => c.line === f.line);
  const short = f.fix_commit.slice(0, 8);
  const steps = [
    {
      date: f.distro_date,
      time: false,
      body: (
        <>
          Ubuntu ships its <Nb>{f.amends}</Nb> patch for {line.note}.{' '}
          <span className="text-muted">
            The package we tested, <code className="whitespace-nowrap font-mono text-[0.85em]">{f.version}</code>, carries it.
          </span>
        </>
      ),
    },
    {
      date: f.advisory_date,
      time: false,
      body: (
        <>
          Django discloses{' '}
          {f.advisory_url ? (
            <a className="link whitespace-nowrap" href={f.advisory_url}>
              {f.cve}
            </a>
          ) : (
            <Nb>{f.cve}</Nb>
          )}{' '}
          (bytes in spatial lookups), an amendment to the <Nb>{f.amends}</Nb> fix.
        </>
      ),
    },
    {
      date: f.probe_date,
      time: true,
      body: (
        <>
          Heirloom&rsquo;s probe on {line.note}&rsquo;s tree: <strong className="whitespace-nowrap font-mono font-medium">{times(f.lt)}</strong>.{' '}
          {cell && <Chip chip={cell.chip} className="ml-1 align-[0.1em]" />}
        </>
      ),
    },
  ];
  return (
    <Section id="finding" title="Fig. 2 — The finding." lede={`What the three-line matrix showed on ${line.name}.`}>
      <figure className="m-0 mt-8">
        <ol className="grid gap-px overflow-hidden rounded-[2px] border border-rule bg-rule md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={i} className="grid content-start gap-2 bg-surface p-5 md:p-6">
              <p>
                <Stamp iso={s.date} time={s.time} />
              </p>
              <p className="text-[1.1rem] leading-snug">{s.body}</p>
            </li>
          ))}
        </ol>
        <figcaption className="sr-only">Fig. 2 — three dated steps, from Ubuntu&rsquo;s patch to the failing probe.</figcaption>
      </figure>

      <div className="mt-10 grid gap-6 md:grid-cols-12">
        <blockquote className="m-0 border-l-2 border-margin/60 pl-5 md:col-span-10 xl:col-span-9">
          <p className="text-2xl leading-snug md:text-[2rem] md:leading-[1.2]">{curly(f.claim)
            .split(/(CVE-\d{4}-\d+)/)
            .map((t, i) => (i % 2 ? <Nb key={i}>{t}</Nb> : t))}</p>
        </blockquote>
        <div className="max-w-measure md:col-span-8">
          <p>
            The probe is {f.hand_written ? 'hand-written' : 'written by the independent porter'} and calibrated on
            Django&rsquo;s own fix commits ({times(f.um)} before{' '}
            <a className="link font-mono text-[0.9em]" href={f.fix_url}>
              {short}
            </a>
            , {times(f.up)} after).
          </p>
          <p className="mt-3 text-muted">
            This is a test result on one package version. It makes no claim about exploitability, and none about other
            Ubuntu releases.
            {amendsRow && f.amends_noble === 'UNPROVEN' && f.amends_noble_reason && REASONS[f.amends_noble_reason] && (
              <>
                {' '}
                <Nb>{f.amends}</Nb> itself stays UNPROVEN on {line.note}: {REASONS[f.amends_noble_reason]}.
              </>
            )}
          </p>
          <p className="mt-5 flex flex-wrap gap-x-6 gap-y-1">
            <a className="link" href={f.logs}>
              Raw logs of the matrix run
            </a>
            {row && rowByAnchor.has(row.anchor) && (
              <a className="link" href={`#${row.anchor}`}>
                Open the receipt ({row.acc})
              </a>
            )}
            <a className="link" href={f.draft}>
              Draft report to Ubuntu (not filed)
            </a>
          </p>
        </div>
      </div>
    </Section>
  );
}
