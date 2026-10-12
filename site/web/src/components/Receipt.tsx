import { useEffect, useState } from 'react';
import type { LineId, Receipt as ReceiptT, ReceiptCell, Row } from '@/data/types';
import { CHIP_META, GATES, REASONS, lineById, prNum, shortDate, site } from '@/lib/site';
import { cn } from '@/lib/utils';
import { useMedia } from '@/lib/useMedia';
import { Chip } from './Chip';
import { Breakable, RstTitle } from './Code';
import { FileText, GitPullRequest } from 'lucide-react';
import { CopyButton } from './CopyButton';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

const cache = new Map<string, Promise<ReceiptT>>();
function load(cve: string) {
  let p = cache.get(cve);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}receipts/${cve}.json`).then((r) => {
      if (!r.ok) throw new Error(`receipt ${cve}: ${r.status}`);
      return r.json() as Promise<ReceiptT>;
    });
    cache.set(cve, p);
  }
  return p;
}

export default function Receipt({
  row,
  line,
  onClose,
  onLine,
  returnFocus,
}: {
  row: Row | null;
  line: LineId;
  onClose: () => void;
  onLine: (l: LineId) => void;
  returnFocus: () => void;
}) {
  const wide = useMedia('(min-width: 768px)');
  const [data, setData] = useState<ReceiptT | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!row) return;
    setData(null);
    setErr(null);
    load(row.cve).then(setData, (e: Error) => setErr(e.message));
  }, [row]);

  return (
    <Sheet open={Boolean(row)} onOpenChange={(o) => !o && onClose()}>
      {row && (
        <SheetContent
          side={wide ? 'right' : 'bottom'}
          className="overflow-y-auto overscroll-contain"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            returnFocus();
          }}
        >
          <div className="px-5 pb-10 pt-5 md:px-8 md:pt-7">
            <header className="pr-12">
              <p className="font-mono text-xs text-muted">
                {row.acc} · advisory {shortDate(row.date)}
              </p>
              <SheetTitle className="mt-1 font-mono text-lg font-medium">{row.cve}</SheetTitle>
              <SheetDescription className="mt-1 text-xl leading-snug text-ink">
                <RstTitle text={row.title} />
              </SheetDescription>
              {row.url && (
                <a className="link mt-2 inline-block text-[0.95rem]" href={row.url}>
                  Django&rsquo;s advisory
                </a>
              )}
            </header>

            <Field name="Condition">
              <ul className="grid gap-2">
                {row.cells.map((c) => (
                  <li key={c.line} className="grid grid-cols-[1fr_auto] items-start gap-x-3">
                    <span className="text-[0.95rem] leading-snug">
                      {lineById[c.line].label}
                      <span className="block font-mono text-[0.7rem] text-muted sm:ml-2 sm:inline">{lineById[c.line].version}</span>
                    </span>
                    <Chip chip={c.chip} className="mt-0.5" />
                  </li>
                ))}
              </ul>
            </Field>

            <Field name="Examination">
              {err && <p className="text-aff-fg">The receipt could not be loaded ({err}).</p>}
              {!data && !err && <p className="text-muted">Loading the runs…</p>}
              {data && (
                <Tabs value={line} onValueChange={(v) => onLine(v as LineId)}>
                  <TabsList aria-label="Release line">
                    {site.lines.map((l) => (
                      <TabsTrigger key={l.id} value={l.id}>
                        {l.name}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {data.cells.map((c) => (
                    <TabsContent key={c.line} value={c.line} className="pt-4">
                      <Examination cell={c} row={row} />
                    </TabsContent>
                  ))}
                </Tabs>
              )}
            </Field>

            <Field name="Treatment">
              <Treatment row={row} />
            </Field>

            <Field name="Evidence">
              <Evidence row={row} matrixLogs={data?.matrix_logs} />
            </Field>
          </div>
        </SheetContent>
      )}
    </Sheet>
  );
}

function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <section className="mt-7 border-t border-rule pt-4">
      <h3 className="label mb-3">{name}</h3>
      {children}
    </section>
  );
}

function times(outcomes: string[] | undefined) {
  if (!outcomes?.length) return '—';
  const same = outcomes.every((o) => o === outcomes[0]);
  return same ? `${outcomes[0]} ×${outcomes.length}` : outcomes.join(' · ');
}

function Examination({ cell, row }: { cell: ReceiptCell; row: Row }) {
  const chip = row.cells.find((c) => c.line === cell.line)!.chip;
  const line = lineById[cell.line];
  const ids = [...new Set([...(cell.runs.um?.failing_ids ?? []), ...(cell.runs.lt?.failing_ids ?? [])])];
  if (cell.verdict === 'no_calibrated_probe') {
    return (
      <p className="text-[0.95rem]">
        No probe passed calibration for this CVE, so nothing was run on {line.label}.
        {row.campaign.reason && REASONS[row.campaign.reason] ? ` In the campaign, ${REASONS[row.campaign.reason]}.` : ''}
      </p>
    );
  }
  return (
    <div className="grid gap-5">
      <figure className="m-0">
        <Triangle um={times(cell.runs.um?.outcomes)} up={times(cell.runs.up?.outcomes)} lt={times(cell.runs.lt?.outcomes)} line={line.name} chip={chip} />
        <figcaption className="mt-2 text-sm text-muted">
          Calibration: the probe on upstream before the fix (U⁻), after it (U⁺), and on {line.label}.
          {cell.detail && <> Result: {cell.detail}.</>}
          {cell.reason && REASONS[cell.reason] && <> Unproven because {REASONS[cell.reason]}.</>}
        </figcaption>
      </figure>
      {ids.length > 0 && (
        <div>
          <p className="label mb-1">Failing tests</p>
          <ul className="grid gap-1 font-mono text-[0.72rem] leading-snug">
            {ids.map((id) => (
              <li key={id}>
                <Breakable text={id} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {cell.gates.length > 0 && (
        <div>
          <p className="label mb-1">Gates</p>
          <ul className="grid gap-2">
            {cell.gates.map((g) => (
              <li key={g.id} className="grid grid-cols-[2.6rem_1fr] gap-x-2 text-[0.9rem] leading-snug">
                <span className="font-mono text-[0.75rem]">
                  <span aria-hidden>{g.ok ? '✓' : '·'}</span> {g.id.replace('C4ab', 'C4')}
                  <span className="sr-only">{g.ok ? ' holds' : ' does not hold'}</span>
                </span>
                <span>
                  {GATES[g.id] ?? g.id}
                  {(g.detail || g.reason) && (
                    <span className="block font-mono text-[0.7rem] text-muted [overflow-wrap:anywhere]">
                      {[g.reason, g.detail].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {cell.probe && (
        <p className="text-[0.9rem]">
          <span className="label mr-2">Probe</span>
          {cell.probe.origin === 'porter' ? 'written by the independent porter' : 'hand-written and calibrated like any other'}
          <span className="ml-2 font-mono text-[0.7rem] text-muted">sha {cell.probe.sha.slice(0, 12)}</span>
        </p>
      )}
    </div>
  );
}

function Triangle({ um, up, lt, line, chip }: { um: string; up: string; lt: string; line: string; chip: Row['cells'][number]['chip'] }) {
  return (
    <div className="relative grid grid-cols-2 gap-x-6 gap-y-8 text-center">
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        <path d="M25 22 L75 22 L50 80 Z" fill="none" stroke="rgb(var(--rule))" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
      </svg>
      <Node k="U⁻" sub="upstream before fix" v={um} />
      <Node k="U⁺" sub="upstream after fix" v={up} />
      <div className="col-span-2 mx-auto">
        <Node k={line} sub="this line" v={lt}>
          <Chip chip={chip} className="mt-1" />
        </Node>
      </div>
      <span className="sr-only">{`${CHIP_META[chip].word}.`}</span>
    </div>
  );
}

function Node({ k, sub, v, children }: { k: string; sub: string; v: string; children?: React.ReactNode }) {
  return (
    <div className="relative mx-auto min-w-[9rem] rounded-chip border border-rule bg-surface px-3 py-2">
      <p className="font-mono text-sm">{k}</p>
      <p className="text-[0.75rem] text-muted">{sub}</p>
      <p className="mt-1 font-mono text-[0.8rem] font-medium">{v}</p>
      {children}
    </div>
  );
}

function Treatment({ row }: { row: Row }) {
  const c = row.campaign;
  if (c.treatment === 'pr') {
    return (
      <div className="grid gap-2 text-[0.95rem]">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <TreatmentLink href={c.link} icon="pr">
            Open the candidate backport, PR {prNum(c.link)}
          </TreatmentLink>
          {c.fail_to_pass && (
            <span className="font-mono text-[0.8rem]">
              probe {c.fail_to_pass.before[0]}×{c.fail_to_pass.before.length} → {c.fail_to_pass.after[0]}×{c.fail_to_pass.after.length}
            </span>
          )}
        </p>
        {c.reason === 'ALREADY_PUBLISHED' && <p className="text-muted">Published earlier by the first end-to-end run; the campaign did not open a second PR.</p>}
        {c.precedent && (
          <p className="text-muted">
            Applies precedent {c.precedent} (adopt upstream&rsquo;s test changes), stored from the answer to{' '}
            <a className="link" href={site.query.issue}>
              question {prNum(site.query.issue)}
            </a>
            {c.asked ? ', which this CVE asked.' : c.waited_on ? '; this CVE waited for it instead of asking again.' : '.'}
          </p>
        )}
        {c.stacked_on && (
          <p className="text-muted">
            Stacked on Heirloom&rsquo;s own backport{' '}
            <a className="link" href={c.stacked_on}>
              {prNum(c.stacked_on)}
            </a>
            {c.depends_on?.length ? ` (${c.depends_on.join(', ')})` : ''}: the upstream fix rewrites lines that fix introduced.
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="grid gap-2 text-[0.95rem]">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <TreatmentLink href={c.link} icon="issue">
          Open the evidence, issue {prNum(c.link)}
        </TreatmentLink>
        <span className="font-mono text-[0.75rem] text-muted">{c.verdict.replaceAll('_', ' ')}{c.reason ? ` · ${c.reason}` : ''}</span>
      </p>
      <p className="text-muted">
        {c.verdict === 'NOT_AFFECTED_PROVEN'
          ? 'No code: the probe proved 4.2 is not affected, so the evidence is published instead of a patch.'
          : `No code: ${c.reason && REASONS[c.reason] ? REASONS[c.reason] : 'it could not prove either way'}, so it published the evidence instead of a guess.`}
      </p>
    </div>
  );
}

function TreatmentLink({ href, icon, children }: { href: string; icon: 'pr' | 'issue'; children: React.ReactNode }) {
  const Icon = icon === 'pr' ? GitPullRequest : FileText;
  return (
    <a
      href={href}
      className="press inline-flex min-h-11 items-center gap-2 text-[1.1rem] font-medium underline decoration-ink/40 underline-offset-[0.2em] hover-underline"
    >
      <Icon className="h-[1.1rem] w-[1.1rem] shrink-0" aria-hidden />
      {children}
    </a>
  );
}

function Evidence({ row, matrixLogs }: { row: Row; matrixLogs?: string }) {
  const c = row.campaign;
  const cmd = `heirloom report --cve ${row.cve}`;
  const items: [string, string, boolean][] = [];
  if (c.run_id) items.push(['Run', c.run_id, true]);
  if (c.checkpoint) items.push(['Entire checkpoint', c.checkpoint, true]);
  for (const t of c.traces ?? []) items.push(['neatlogs trace', t, true]);
  return (
    <div className="grid gap-3">
      <dl className="grid gap-1">
        {items.map(([k, v]) => (
          <div key={k + v} className="grid grid-cols-[8.5rem_1fr] items-center gap-x-2">
            <dt className="label">{k}</dt>
            <dd className="flex items-center justify-between gap-2 font-mono text-[0.75rem] [overflow-wrap:anywhere]">
              <span>{v}</span>
              <CopyButton value={v} label={k} />
            </dd>
          </div>
        ))}
        <div className="grid grid-cols-[8.5rem_1fr] items-center gap-x-2 py-2">
          <dt className="label">Cost</dt>
          <dd className="font-mono text-[0.8rem]">
            ${c.cost_usd.toFixed(2)} model · {c.minutes.toFixed(1)} min
          </dd>
        </div>
      </dl>
      <p className="flex flex-wrap gap-x-5 gap-y-1 text-[0.95rem]">
        {c.logs && (
          <a className="link" href={c.logs}>
            Raw logs (campaign run)
          </a>
        )}
        {matrixLogs && (
          <a className="link" href={matrixLogs}>
            Raw logs (three-line matrix)
          </a>
        )}
      </p>
      <div>
        <p className="label mb-1">Reproduce from the ledger</p>
        <div className={cn('flex items-center justify-between gap-2 rounded-chip border border-rule bg-paper px-3')}>
          <code className="font-mono text-[0.8rem] [overflow-wrap:anywhere]">{cmd}</code>
          <CopyButton value={cmd} label="command" />
        </div>
      </div>
    </div>
  );
}
