import { useRef, useState } from 'react';
import type { Chip as ChipT } from '@/data/types';
import { CHIP_META, prNum, site } from '@/lib/site';
import { gotoRow } from '@/lib/goto';
import { cn } from '@/lib/utils';
import { Seal } from './Seal';

/** The hero's index card: the treatment record's fields, then the whole register in miniature. */
export function CatalogueCard({ className }: { className?: string }) {
  const s = site.summary;
  const v = s.verdicts;
  const distros = site.lines.filter((l) => l.kind === 'distro');
  const fields: [string, React.ReactNode][] = [
    ['Object', site.object],
    [
      'End of life',
      <>
        <time dateTime={site.eol}>{site.eol}</time>{' '}
        <a className="link ml-1 font-mono text-[0.75rem]" href={site.eol_source}>
          {site.eol_source.replace(/^https:\/\//, '')}
        </a>
      </>,
    ],
    [
      'Still shipped by',
      <span className="grid gap-1">
        {distros.map((l) => (
          <span key={l.id} className="block">
            {l.name}
            <code className="block font-mono text-[0.75rem] leading-snug text-muted [overflow-wrap:anywhere]">{l.version}</code>
          </span>
        ))}
      </span>,
    ],
    ['Advisories examined', s.cves],
    [
      'Treatments proposed',
      <>
        {s.prs} <span className="text-muted">(fix ready)</span>
      </>,
    ],
    [
      'Proven sound',
      <>
        {v.NOT_AFFECTED_PROVEN ?? 0} <span className="text-muted">(not affected)</span>
      </>,
    ],
    ['Unproven, evidence filed', v.UNPROVEN ?? 0],
    [
      'Queries to the owner',
      <>
        {s.questions}{' '}
        <a className="link text-muted" href={site.query.issue}>
          ({prNum(site.query.issue)})
        </a>
      </>,
    ],
  ];
  return (
    <aside
      aria-labelledby="card-title"
      className={cn('relative rounded-[2px] border border-ledger-rule bg-ledger px-5 pb-5 pt-4 sm:px-6', className)}
    >
      <Seal size={56} className="absolute -right-3 -top-4 -rotate-12" />
      <h2 id="card-title" className="pr-20 font-mono text-[0.8rem] font-medium uppercase tracking-[0.08em]">
        Treatment record <span className="text-muted">· {site.record}</span>
      </h2>
      {/* index-card header rule, in the margin red */}
      <div aria-hidden className="mt-3 h-px bg-margin/60" />
      <dl className="mt-1">
        {fields.map(([k, val]) => (
          <div
            key={k}
            className="grid items-baseline gap-x-3 border-b border-ledger-rule py-[0.4rem] sm:grid-cols-[12rem_minmax(0,1fr)]"
          >
            <dt className="label text-[0.68rem] leading-snug">{k}</dt>
            <dd className="text-[1rem] leading-snug tabular-nums">{val}</dd>
          </div>
        ))}
      </dl>
      <MiniRegister />
    </aside>
  );
}

function MiniRegister() {
  const rows = site.rows;
  const cols = site.lines;
  const [pos, setPos] = useState<[number, number]>([0, 0]);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const move = (r: number, c: number) => {
    const rr = Math.max(0, Math.min(rows.length - 1, r));
    const cc = Math.max(0, Math.min(cols.length - 1, c));
    setPos([rr, cc]);
    refs.current.get(`${rr}|${cc}`)?.focus();
  };
  const onKey = (e: React.KeyboardEvent, r: number, c: number) => {
    const map: Record<string, () => void> = {
      ArrowRight: () => move(r, c + 1),
      ArrowLeft: () => move(r, c - 1),
      ArrowDown: () => move(r + 1, c),
      ArrowUp: () => move(r - 1, c),
      Home: () => move(e.ctrlKey ? 0 : r, 0),
      End: () => move(e.ctrlKey ? rows.length - 1 : r, cols.length - 1),
    };
    const f = map[e.key];
    if (f) {
      e.preventDefault();
      f();
    }
  };
  const counts = site.summary.chip_counts;
  return (
    <figure className="m-0 mt-5 flex gap-6">
      <table className="shrink-0 border-separate border-spacing-[4px] -m-[4px]" aria-describedby="mini-cap">
        <thead>
          <tr>
            <th scope="col" className="p-0">
              <span className="sr-only">Accession</span>
            </th>
            {cols.map((l) => (
              <th
                key={l.id}
                scope="col"
                className="p-0 text-center font-mono text-[0.62rem] font-medium tracking-wide text-muted"
              >
                <abbr title={l.label} className="no-underline">
                  {l.abbr}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r.anchor}>
              <th
                scope="row"
                className="p-0 pr-1 text-right font-mono text-[0.6rem] font-normal leading-none text-muted"
              >
                <span aria-hidden>{r.acc.slice(-3)}</span>
                <span className="sr-only">{r.acc}</span>
              </th>
              {r.cells.map((cell, ci) => {
                const m = CHIP_META[cell.chip];
                const line = site.lines[ci]!;
                return (
                  <td key={cell.line} className="p-0">
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) refs.current.set(`${ri}|${ci}`, el);
                        else refs.current.delete(`${ri}|${ci}`);
                      }}
                      tabIndex={pos[0] === ri && pos[1] === ci ? 0 : -1}
                      onFocus={() => setPos([ri, ci])}
                      onKeyDown={(e) => onKey(e, ri, ci)}
                      onClick={() => gotoRow({ anchor: r.anchor, col: ci })}
                      aria-label={`${r.acc}, ${r.cve} on ${line.name}: ${m.word}. Go to the row in Fig. 1`}
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded-[3px] border font-mono text-[0.62rem] font-medium leading-none',
                        m.cls,
                      )}
                    >
                      <span aria-hidden>{m.symbol}</span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex min-w-0 flex-col gap-5 pt-5">
        <ul className="grid gap-1.5" aria-label="Cells by verdict">
          {(site.chips as ChipT[]).map((c) => (
            <li key={c} className="flex items-center gap-2 text-[0.85rem] leading-tight">
              <span
                aria-hidden
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border font-mono text-[0.55rem]',
                  CHIP_META[c].cls,
                )}
              >
                {CHIP_META[c].symbol}
              </span>
              <span className="font-mono text-[0.68rem] uppercase tracking-[0.04em]">{CHIP_META[c].word}</span>
              <span className="ml-auto pl-2 tabular-nums">{counts[c]}</span>
            </li>
          ))}
        </ul>
        <figcaption id="mini-cap" className="text-[0.9rem] leading-snug text-muted">
          The whole register at a glance: {site.rows.length} advisories × {site.lines.length} lines, in accession order.
          Each square takes you to its row in Fig. 1.
        </figcaption>
      </div>
    </figure>
  );
}
