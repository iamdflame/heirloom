import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { m } from 'motion/react';
import type { Chip as ChipT, LineId, Row } from '@/data/types';
import { CHIP_META, lineById, shortDate, site } from '@/lib/site';
import { Chip, ChipLegend } from './Chip';
import { RstTitle } from './Code';
import { Replay } from './Replay';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';

export type OpenReceipt = (anchor: string, line: LineId, trigger: HTMLElement | null) => void;
type Filter = ChipT | 'ALL';

const INK = { duration: 0.18, ease: [0.23, 1, 0.32, 1] as const };
const LINES = site.lines.map((l) => l.id);

function rowTotal(r: Row) {
  const undecided = r.cells.filter((c) => c.chip === 'UNPROVEN' || c.chip === 'NO_PROBE').length;
  const n = r.cells.length;
  if (undecided === n) return `none of ${n} decided`;
  return `${r.affected} of ${n} lines affected` + (undecided ? ` · ${undecided} undecided` : '');
}

export function Register({ onOpen }: { onOpen: OpenReceipt }) {
  const last = site.stops.length - 1;
  const [stop, setStop] = useState(last); // default: the end, everything visible
  const [animate, setAnimate] = useState(false); // ink-in only once the visitor replays
  const [filter, setFilter] = useState<Filter>('ALL');
  const until = site.stops[stop]!.date;

  const arrived = useMemo(() => site.rows.filter((r) => r.date <= until), [until]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(site.chips.map((k) => [k, 0])) as Record<ChipT, number>;
    for (const r of arrived) for (const cell of r.cells) c[cell.chip]++;
    return c;
  }, [arrived]);
  const shown = useMemo(
    () => (filter === 'ALL' ? arrived : arrived.filter((r) => r.cells.some((c) => c.chip === filter))),
    [arrived, filter],
  );
  const shownSet = useMemo(() => new Set(shown.map((r) => r.anchor)), [shown]);
  // batch position, for the ink-in stagger
  const batchIndex = useMemo(() => {
    const seen = new Map<string, number>();
    return new Map(site.rows.map((r) => [r.anchor, ((seen.set(r.date, (seen.get(r.date) ?? -1) + 1), seen.get(r.date)) as number)]));
  }, []);

  // ---- roving tabindex over the visible cell buttons ----
  const [pos, setPos] = useState<[number, number]>([0, 0]);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const key = (anchor: string, col: number) => `${anchor}|${col}`;
  const safePos: [number, number] = [Math.min(pos[0], Math.max(shown.length - 1, 0)), pos[1]];
  const move = useCallback(
    (r: number, c: number) => {
      const rr = Math.max(0, Math.min(shown.length - 1, r));
      const cc = Math.max(0, Math.min(LINES.length - 1, c));
      setPos([rr, cc]);
      const row = shown[rr];
      if (row) cellRefs.current.get(key(row.anchor, cc))?.focus();
    },
    [shown],
  );
  const onKey = (e: React.KeyboardEvent, r: number, c: number) => {
    const map: Record<string, () => void> = {
      ArrowRight: () => move(r, c + 1),
      ArrowLeft: () => move(r, c - 1),
      ArrowDown: () => move(r + 1, c),
      ArrowUp: () => move(r - 1, c),
      Home: () => move(e.ctrlKey ? 0 : r, 0),
      End: () => move(e.ctrlKey ? shown.length - 1 : r, LINES.length - 1),
      PageDown: () => move(r + 5, c),
      PageUp: () => move(r - 5, c),
    };
    const f = map[e.key];
    if (f) {
      e.preventDefault();
      f();
    }
  };

  // ---- the 87890 → 15307 connector, drawn in the right margin ----
  const sheetRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const [geo, setGeo] = useState<{ y1: number; y2: number; x: number } | null>(null);
  const conn = site.connector;
  const fromRow = conn && site.rows.find((r) => r.cve === conn.from);
  const toRow = conn && site.rows.find((r) => r.cve === conn.to);
  const showConn = Boolean(conn && until >= conn.date && fromRow && toRow && shownSet.has(fromRow.anchor) && shownSet.has(toRow.anchor));
  const measure = useCallback(() => {
    const sheet = sheetRef.current;
    const a = fromRow && rowRefs.current.get(fromRow.anchor);
    const b = toRow && rowRefs.current.get(toRow.anchor);
    if (!sheet || !a || !b) return setGeo(null);
    const s = sheet.getBoundingClientRect();
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    setGeo({ y1: ra.top - s.top + ra.height / 2, y2: rb.top - s.top + rb.height / 2, x: ra.right - s.left });
  }, [fromRow, toRow]);
  useLayoutEffect(() => {
    measure();
  }, [measure, shown, showConn]);
  useEffect(() => {
    const ro = new ResizeObserver(measure);
    if (sheetRef.current) ro.observe(sheetRef.current);
    return () => ro.disconnect();
  }, [measure]);

  const liveCount =
    filter === 'ALL'
      ? `${shown.length} of ${site.rows.length} advisories shown`
      : `${shown.length} of ${arrived.length} advisories have a ${CHIP_META[filter].word.toUpperCase()} cell`;

  return (
    <section id="register" aria-labelledby="fig1" className="border-t border-rule pt-10">
      <figure className="m-0">
        <figcaption className="grid gap-2 md:grid-cols-12">
          <h2 id="fig1" className="text-3xl leading-tight md:col-span-8 md:text-4xl">
            Fig. 1 — The register.
          </h2>
          <p className="text-lg text-muted md:col-span-8">Every cell is a test run you can open.</p>
        </figcaption>

        <Replay
          stop={stop}
          count={arrived.length}
          onStop={(i) => setStop(i)}
          onReplayStart={() => setAnimate(true)}
        />

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
          <span className="label" id="filter-label">
            Filter
          </span>
          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={(v) => setFilter((v || 'ALL') as Filter)}
            aria-labelledby="filter-label"
          >
            <ToggleGroupItem value="ALL" aria-label={`All advisories, ${arrived.length}`}>
              All <span className="tabular-nums">{arrived.length}</span>
            </ToggleGroupItem>
            {site.chips.map((c) => (
              <ToggleGroupItem key={c} value={c} aria-label={`${CHIP_META[c].word}, ${counts[c]} cells`}>
                <span aria-hidden>{CHIP_META[c].symbol}</span> {CHIP_META[c].word}{' '}
                <span className="tabular-nums">{counts[c]}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p aria-live="polite" className="w-full font-mono text-xs text-muted md:ml-auto md:w-auto">
            {liveCount}
          </p>
        </div>

        {/* desktop/tablet: the ledger sheet */}
        <div ref={sheetRef} className="relative mt-5 hidden md:block xl:pr-56">
          <div className="overflow-x-auto rounded-[2px] border border-ledger-rule bg-ledger">
            <p id="register-help" className="sr-only">
              Each verdict cell is a button. Use the arrow keys to move between cells, Home and End for the start or end of a
              row, and Enter to open the receipt.
            </p>
            <table className="ledger w-full min-w-[54rem] border-collapse text-left" aria-describedby="register-help">
              <thead>
                <tr className="border-b-2 border-ledger-rule align-bottom">
                  <th scope="col" className="ledger-acc sticky left-0 z-10 bg-ledger px-3 py-3 label">
                    Accession
                  </th>
                  <th scope="col" className="px-4 py-3 label">
                    Advisory
                  </th>
                  {site.lines.map((l) => (
                    <th key={l.id} scope="col" className="w-[11.5rem] px-2 py-3 font-normal">
                      <span className="block text-[0.95rem] leading-tight">{l.label}</span>
                      <span className="mt-0.5 block whitespace-nowrap font-mono text-[0.7rem] text-muted">
                        {l.kind === 'eval' ? 'tag ' + l.version : l.version}
                      </span>
                    </th>
                  ))}
                  <th scope="col" className="w-[9.5rem] px-3 py-3 label">
                    Lines affected
                  </th>
                </tr>
              </thead>
              <tbody>
                {site.rows.map((r) => {
                  const isArrived = r.date <= until;
                  const visible = shownSet.has(r.anchor);
                  if (isArrived && !visible) return null;
                  const ri = shown.indexOf(r);
                  const delay = animate ? (batchIndex.get(r.anchor) ?? 0) * 0.045 : 0;
                  const ink = animate ? { initial: { opacity: 0, scale: 0.96 }, animate: { opacity: 1, scale: 1 }, transition: { ...INK, delay } } : { initial: false as const };
                  return (
                    <tr
                      key={r.anchor}
                      ref={(el) => {
                        if (el) rowRefs.current.set(r.anchor, el);
                        else rowRefs.current.delete(r.anchor);
                      }}
                      className="border-b border-ledger-rule"
                      aria-hidden={isArrived ? undefined : true}
                    >
                      <th scope="row" className="ledger-acc sticky left-0 z-10 bg-ledger px-3 py-2 text-left align-middle font-mono text-[0.8rem] font-normal">
                        <span className={isArrived ? 'whitespace-nowrap' : 'whitespace-nowrap text-muted'}>{r.acc}</span>
                      </th>
                      {isArrived ? (
                        <>
                          <td className="px-4 py-2 align-middle">
                            <m.div {...ink}>
                              <span className="font-mono text-[0.8rem]">{r.cve}</span>
                              {site.query_marker.cve === r.cve && (
                                <span className="ml-2 rounded-chip border border-ink/30 px-1 py-px font-mono text-[0.65rem] uppercase tracking-wide">
                                  query #{site.query_marker.number}
                                </span>
                              )}
                              <span className="block text-[0.95rem] leading-snug">
                                <RstTitle text={r.title} />
                              </span>
                              {conn && r.cve === conn.from && until >= conn.date && (
                                <span className="mt-0.5 block font-mono text-[0.7rem] text-muted xl:sr-only">
                                  stacked on our own backport · PR #{conn.pr} on #{conn.on}
                                </span>
                              )}
                            </m.div>
                          </td>
                          {r.cells.map((cell, ci) => {
                            const line = lineById[cell.line];
                            const active = safePos[0] === ri && safePos[1] === ci;
                            const match = filter !== 'ALL' && cell.chip === filter;
                            return (
                              <td key={cell.line} className="p-0 align-middle">
                                <button
                                  type="button"
                                  ref={(el) => {
                                    if (el) cellRefs.current.set(key(r.anchor, ci), el);
                                    else cellRefs.current.delete(key(r.anchor, ci));
                                  }}
                                  tabIndex={active ? 0 : -1}
                                  onFocus={() => setPos([ri, ci])}
                                  onKeyDown={(e) => onKey(e, ri, ci)}
                                  onClick={(e) => onOpen(r.anchor, cell.line, e.currentTarget)}
                                  aria-label={`${r.cve} on ${line.label}: ${CHIP_META[cell.chip].word}. Open receipt`}
                                  className="cell-btn press flex min-h-12 w-full items-center px-2 py-2 text-left"
                                >
                                  <m.span {...ink} className="inline-flex">
                                    <Chip chip={cell.chip} className={match ? 'outline outline-1 outline-offset-2 outline-ink' : ''} />
                                  </m.span>
                                </button>
                              </td>
                            );
                          })}
                          <td className="px-3 py-2 align-middle font-mono text-[0.75rem] text-muted">
                            <m.span {...ink} className="block">{rowTotal(r)}</m.span>
                          </td>
                        </>
                      ) : (
                        <td colSpan={2 + site.lines.length} className="px-4 py-2 align-middle">
                          <span className="block min-h-[2.6rem]" />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {showConn && geo && conn && (
            <Connector geo={geo} label={['stacked on our own backport', `PR #${conn.pr} on #${conn.on}`]} />
          )}
        </div>

        {/* mobile: one card per CVE */}
        <ol className="mt-5 grid gap-3 md:hidden" aria-label="Register entries">
          {shown.map((r) => (
            <li key={r.anchor} className="rounded-[2px] border border-ledger-rule bg-ledger p-4">
              <p className="flex items-baseline justify-between gap-3 font-mono text-[0.75rem] text-muted">
                <span>{r.acc}</span>
                <span>{shortDate(r.date)}</span>
              </p>
              <p className="mt-1 font-mono text-sm">
                {r.cve}
                {site.query_marker.cve === r.cve && (
                  <span className="ml-2 rounded-chip border border-ink/30 px-1 py-px text-[0.65rem] uppercase">
                    query #{site.query_marker.number}
                  </span>
                )}
              </p>
              <p className="mt-1 leading-snug">
                <RstTitle text={r.title} />
              </p>
              {conn && r.cve === conn.from && until >= conn.date && (
                <p className="mt-1 font-mono text-[0.7rem] text-muted">
                  stacked on our own backport · PR #{conn.pr} on #{conn.on}
                </p>
              )}
              <ul className="mt-3 divide-y divide-ledger-rule border-t border-ledger-rule">
                {r.cells.map((cell) => {
                  const line = lineById[cell.line];
                  return (
                    <li key={cell.line}>
                      <button
                        type="button"
                        onClick={(e) => onOpen(r.anchor, cell.line, e.currentTarget)}
                        aria-label={`${r.cve} on ${line.label}: ${CHIP_META[cell.chip].word}. Open receipt`}
                        className="press flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left"
                      >
                        <span className="text-[0.9rem] leading-tight">{line.label}</span>
                        <Chip chip={cell.chip} />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 font-mono text-[0.7rem] text-muted">{rowTotal(r)}</p>
            </li>
          ))}
        </ol>

        <div className="mt-6 border-t border-rule pt-4">
          <ChipLegend />
        </div>
      </figure>
    </section>
  );
}

function Connector({ geo, label }: { geo: { y1: number; y2: number; x: number }; label: [string, string] }) {
  const { y1, y2, x } = geo;
  const x0 = x + 6;
  const bend = 28;
  const top = Math.min(y1, y2);
  const d = `M${x0} ${y1} C${x0 + bend} ${y1} ${x0 + bend} ${y1} ${x0 + bend} ${y1 - 14} L${x0 + bend} ${y2 + 14} C${x0 + bend} ${y2} ${x0 + bend} ${y2} ${x0 + 7} ${y2}`;
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 hidden h-full w-full overflow-visible xl:block"
    >
      <path d={d} fill="none" stroke="rgb(var(--ink))" strokeWidth="1" />
      <path d={`M${x0} ${y2} l7 -4 v8 z`} fill="rgb(var(--ink))" />
      <circle cx={x0} cy={y1} r="2.5" fill="rgb(var(--ink))" />
      <text x={x0 + bend + 10} y={top + Math.abs(y1 - y2) / 2 - 4} className="fill-ink font-mono text-[11px]">
        {label[0]}
      </text>
      <text x={x0 + bend + 10} y={top + Math.abs(y1 - y2) / 2 + 12} className="fill-muted font-mono text-[11px]">
        {label[1]}
      </text>
    </svg>
  );
}
