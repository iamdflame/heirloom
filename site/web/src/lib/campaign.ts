// The campaign told as steps, all derived from site.json: the dated stops, the batches, the question,
// the precedent reuse and the 87890 → 15307 connector.
import type { Row } from '@/data/types';
import { site } from './site';

const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const md = (iso: string) => `${M[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`;
const dayNo = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;
export const DAY0 = site.stops[0]!.date;
export const SPAN = dayNo(site.stops.at(-1)!.date) - dayNo(DAY0);
export const dayOf = (iso: string) => dayNo(iso) - dayNo(DAY0);

export type StepKind = 'eol' | 'batch' | 'question' | 'distro' | 'amend' | 'reuse' | 'followup';
export interface Step {
  kind: StepKind;
  date: string;
  title: string;
  sub?: string;
  /** CVEs this step points at (pulse, connector ends) */
  focus?: string[];
}

const q = site.query;
const conn = site.connector;
const asker = site.rows.find((r) => r.cve === q.asked_by);
const reuser = q.waited[0] ? site.rows.find((r) => r.cve === q.waited[0]) : undefined;
const reusePr = q.precedent.applied_by.find((a) => a.cve === reuser?.cve);
const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

export const STEPS: Step[] = [];
for (const s of site.stops) {
  const batch = site.rows.filter((r) => r.date === s.date);
  if (s.kind === 'eol') STEPS.push({ kind: 'eol', date: s.date, title: `${md(s.date)} · ${s.label}`, sub: 'From here on, no 4.2 release gets a security fix upstream.' });
  else if (s.kind === 'advisories') {
    const prs = batch.filter((r) => r.campaign.treatment === 'pr').length;
    STEPS.push({
      kind: 'batch',
      date: s.date,
      title: `${md(s.date)} · ${n(batch.length, 'advisory', 'advisories')} · ${n(prs, 'candidate backport', 'candidate backports')}`,
      sub: batch.length - prs ? `${n(batch.length - prs, 'evidence issue', 'evidence issues')} filed instead of a patch.` : 'Each probe fails before the fix and passes after it.',
      focus: batch.map((r) => r.cve),
    });
    if (asker && asker.date === s.date)
      STEPS.push({
        kind: 'question',
        date: s.date,
        title: `${md(s.date)} · ${asker.cve} asks the owner one question`,
        sub: `Issue #${q.number}. The answer, “${q.precedent.answer}”, became precedent ${q.precedent.id}.`,
        focus: [asker.cve],
      });
    if (conn && conn.date === s.date)
      STEPS.push({
        kind: 'amend',
        date: s.date,
        title: `${md(s.date)} · Django amends it: ${conn.from}`,
        sub: `Stacked on our own backport · PR #${conn.pr} on #${conn.on}.`,
        focus: [conn.from, conn.to],
      });
    if (reuser && reuser.date === s.date)
      STEPS.push({
        kind: 'reuse',
        date: s.date,
        title: `${reuser.cve} reuses the answer without asking`,
        sub: `Precedent ${q.precedent.id} applied${reusePr ? ` · PR #${reusePr.number}` : ''}.`,
        focus: [reuser.cve],
      });
  } else if (s.kind === 'distro') STEPS.push({ kind: 'distro', date: s.date, title: `${md(s.date)} · ${s.label}`, sub: 'The patch Heirloom’s probe later tests on noble.', focus: conn ? [conn.to] : [] });
  else STEPS.push({ kind: 'followup', date: s.date, title: `${md(s.date)} · ${s.label}`, focus: [] });
}

export interface Tally {
  advisories: number;
  backports: number;
  evidence: number;
  questions: number;
}
export function tally(i: number): Tally {
  const st = STEPS[i]!;
  const rows = site.rows.filter((r: Row) => r.date <= st.date);
  const qi = STEPS.findIndex((s) => s.kind === 'question');
  return {
    advisories: rows.length,
    backports: rows.filter((r) => r.campaign.treatment === 'pr').length,
    evidence: rows.filter((r) => r.campaign.treatment === 'issue').length,
    questions: qi >= 0 && i >= qi ? site.summary.questions : 0,
  };
}
