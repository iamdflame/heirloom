// Every number and string the film shows comes from here: the site's data, the evals and real logs.
import site from '../../site/web/public/site.json';
import results from '../../evals/results.json';
import receipt6907 from '../../site/web/public/receipts/CVE-2026-6907.json';
import terminal from './data/terminal.json';
import type { Chip } from './theme';

export { site, results, terminal };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ymd = (iso: string) => iso.slice(0, 10).split('-').map(Number) as [number, number, number];
/** 2026-04-07 → "7 April 2026" */
export const longDate = (iso: string) => {
  const [y, m, d] = ymd(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
/** 2026-10-01 → "Oct 1" */
export const shortDate = (iso: string) => {
  const [, m, d] = ymd(iso);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}`;
};
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export const line = (id: string) => site.lines.find((l) => l.id === id)!;
export const DEBIAN = line('debian-trixie');
export const UBUNTU = line('ubuntu-noble');
export const UPSTREAM = line('4.2.30');

export const SUMMARY = site.summary;
export const ROWS = site.rows;
export const FINDING = site.finding;
export const CONNECTOR = site.connector;
export const QUERY = site.query;
export const PRECEDENT = site.query.precedent;

/** Advisories published after EOL; none has an upstream 4.2 release (4.2 is past end of life). */
export const ADVISORIES = ROWS.map((r) => ({ cve: r.cve, date: r.date, verdict: r.campaign.verdict as string }));
export const UPSTREAM_42_PATCHES = 0;

export const PR_ROWS = ROWS.filter((r) => r.campaign.treatment === 'pr');
export const UNPROVEN_N = SUMMARY.verdicts.UNPROVEN;

/** The backtest (evals/results.json summary): v1 = the naive pipeline, v2 = Heirloom with calibration. */
export const BACKTEST = results.summary;

/** "$0.22": the measured model cost per advisory (site.economics inputs). */
const costInput = site.economics.inputs.find((i) => i.name === 'Model cost per CVE USD')!;
export const COST_PER_CVE = Number(costInput.base);
export const COST_STATUS = costInput.status;
export const CFO_BASE = site.economics.pages.find((p) => p.name === 'Base')!.url;

/** The worked example on the site's register: CVE-2026-6907 × Django 4.2.30. */
export const EXAMPLE = {
  cve: site.method.example.cve,
  pr: site.method.example.number,
  row: ROWS.find((r) => r.cve === site.method.example.cve)!,
  receipt: receipt6907,
};
export const exampleCell = (lineId: string) => EXAMPLE.receipt.cells.find((c) => c.line === lineId)!;

export const GATES: Record<string, string> = {
  C1: 'Probe fails on U⁻ with stable test ids, passes on U⁺',
  C2: 'Probe runs cleanly on this line',
  C3: 'Coverage reaches the code the fix changes',
  C4ab: 'A rebuilt vulnerability on this line is caught',
};

export const chipFor = (verdict: string): Chip =>
  verdict === 'AFFECTED' ? 'AFFECTED' : verdict === 'NOT_AFFECTED_PROVEN' ? 'NOT_AFFECTED' : verdict === 'UNPROVEN' ? 'UNPROVEN' : 'NO_PROBE';

export const REPO = site.repo.replace('https://', '');
export const SITE_URL = 'heirloom-proof.vercel.app';
