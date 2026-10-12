// The 1200×630 social card, rendered to public/og.png by scripts/og.mjs. Every number comes from site.json.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Seal } from './components/Seal';
import { CHIP_META, longDate, site } from './lib/site';
import { cn } from './lib/utils';
import './index.css';

function Og() {
  const s = site.summary;
  const v = s.verdicts;
  const counts: [string, number][] = [
    ['fix ready', s.prs],
    ['not affected', v.NOT_AFFECTED_PROVEN ?? 0],
    ['unproven', v.UNPROVEN ?? 0],
    [s.questions === 1 ? 'question' : 'questions', s.questions],
  ];
  return (
    <main className="relative flex h-[630px] w-[1200px] overflow-hidden bg-paper text-ink">
      <div className="flex w-[790px] flex-col justify-between py-[54px] pl-[64px] pr-[40px]">
        <div className="flex items-center gap-3">
          <Seal size={44} />
          <span className="text-[30px] font-medium">Heirloom</span>
          <span className="ml-3 font-mono text-[15px] uppercase tracking-[0.08em] text-muted">
            Record {site.record} · {site.object}
          </span>
        </div>
        <h1 className="text-[52px] leading-[1.06] tracking-[-0.02em]">
          Django stopped patching 4.2 on {longDate(site.eol)}. Debian 13 and Ubuntu 24.04 still ship it.
        </h1>
        <div>
          <p className="text-[24px] leading-snug">
            {s.cves} advisories × {site.lines.length} release lines, each verdict with a receipt.
          </p>
          <ul className="mt-4 flex flex-wrap gap-x-7 gap-y-1 font-mono text-[17px]">
            {counts.map(([k, n]) => (
              <li key={k}>
                <span className="text-[22px] font-medium">{n}</span> <span className="text-muted">{k}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 font-mono text-[16px] text-muted">iamdflame.github.io/heirloom</p>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center gap-8 border-l border-ledger-rule bg-ledger">
        <table className="border-separate border-spacing-[5px]">
          <thead>
            <tr>
              <th />
              {site.lines.map((l) => (
                <th key={l.id} className="pb-1 text-center font-mono text-[13px] font-medium text-muted">
                  {l.abbr}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {site.rows.map((r) => (
              <tr key={r.anchor}>
                <th className="pr-2 text-right font-mono text-[12px] font-normal leading-none text-muted">{r.acc.slice(-3)}</th>
                {r.cells.map((c) => (
                  <td key={c.line} className="p-0">
                    <span
                      className={cn(
                        'flex h-[22px] w-[34px] items-center justify-center rounded-[3px] border font-mono text-[13px] font-medium leading-none',
                        CHIP_META[c.chip].cls,
                      )}
                    >
                      {CHIP_META[c.chip].symbol}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="grid gap-2.5 font-mono text-[13px] uppercase tracking-[0.04em]">
          {site.chips.map((c) => (
            <li key={c} className="flex items-center gap-2">
              <span className={cn('flex h-[20px] w-[20px] items-center justify-center rounded-[3px] border', CHIP_META[c].cls)}>
                {CHIP_META[c].symbol}
              </span>
              {CHIP_META[c].word}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Og />
  </StrictMode>,
);
