// The 1200×630 social card, rendered to public/og.png by scripts/og.mjs. Every number comes from site.json.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Hallmark } from './components/Hallmark';
import { longDate, site } from './lib/site';
import './index.css';

function Og() {
  const s = site.summary;
  const counts: [number, string][] = [
    [s.prs, 'candidate backports'],
    [site.backtest.v2.false_not_affected, 'false “not affected”'],
    [s.questions, s.questions === 1 ? 'question asked' : 'questions asked'],
  ];
  return (
    <main className="relative h-[630px] w-[1200px] overflow-hidden bg-paper text-ink">
      <img src={`${import.meta.env.BASE_URL}hero-poster.webp`} alt="" className="absolute inset-0 h-full w-full object-cover object-[85%_50%]" />
      <div className="absolute inset-0 bg-gradient-to-r from-paper via-paper/75 to-transparent" />
      <div className="relative flex h-full w-[760px] flex-col justify-between py-[52px] pl-[64px]">
        <div className="flex items-center gap-3">
          <Hallmark size={46} />
          <span className="font-display text-[34px] leading-none">Heirloom</span>
          <span className="ml-3 font-mono text-[14px] uppercase tracking-[0.14em] text-brass">
            Record {site.record} · {site.object}
          </span>
        </div>
        <div>
          <h1 className="display text-[112px] leading-[0.9]">
            Old software, <em className="italic text-brass-hi">kept honest.</em>
          </h1>
          <p className="mt-5 max-w-[620px] text-[22px] leading-snug text-ink/85">
            {s.cves} Django 4.2 advisories after its end of life on {longDate(site.eol)}, each verdict a test run you can open.
          </p>
        </div>
        <div>
          <ul className="flex gap-10 border-t border-brass/30 pt-5">
            {counts.map(([n, k]) => (
              <li key={k}>
                <span className="display block text-[56px] leading-none text-brass-hi">{n}</span>
                <span className="mt-1 block text-[17px]">{k}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 font-mono text-[15px] text-muted">heirloom-proof.vercel.app</p>
        </div>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Og />
  </StrictMode>,
);
