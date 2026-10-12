// The site's counts must equal the README's first screen (between <!-- top:start --> and <!-- top:end -->).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Site } from './types';

const site: Site = JSON.parse(readFileSync(new URL('../../public/site.json', import.meta.url), 'utf8'));
const readme = readFileSync(new URL('../../../../README.md', import.meta.url), 'utf8');
const top = readme.split('<!-- top:start -->')[1]?.split('<!-- top:end -->')[0] ?? '';

const num = (re: RegExp) => {
  const m = top.match(re);
  if (!m?.[1]) throw new Error(`README first screen has no match for ${re}`);
  return Number(m[1]);
};

describe('site.json vs README first screen', () => {
  it('finds the first screen', () => expect(top.length).toBeGreaterThan(500));

  it('campaign size and verdicts', () => {
    expect(site.rows).toHaveLength(num(/\*\*(\d+) post-EOL Django CVEs on 4\.2/));
    expect(site.summary.verdicts.AFFECTED).toBe(num(/\*\*(\d+)\*\* AFFECTED/));
    expect(site.summary.verdicts.NOT_AFFECTED_PROVEN).toBe(num(/\*\*(\d+)\*\* NOT_AFFECTED_PROVEN/));
    expect(site.summary.verdicts.UNPROVEN).toBe(num(/\*\*(\d+)\*\* UNPROVEN/));
  });

  it('PRs, fail-to-pass, evidence issues, questions', () => {
    expect(site.summary.prs).toBe(num(/\*\*(\d+) candidate backport PRs\*\*/));
    expect(site.summary.fail_to_pass).toBe(num(/(\d+) of \d+ with the probe FAIL/));
    expect(site.summary.probe_before).toBe(num(/FAIL ×(\d+) before/));
    expect(site.summary.probe_after).toBe(num(/PASS ×(\d+) after the fix/));
    expect(site.summary.issues).toBe(num(/\*\*(\d+) evidence issues, no code,\*\*/));
    expect(site.summary.questions).toBe(num(/\*\*(\d+) question asked:\*\*/));
  });

  it('FIX READY equals the PR count; every row links its PR or issue', () => {
    expect(site.summary.chip_counts.FIX_READY).toBe(site.summary.prs);
    const prs = site.rows.filter((r) => r.campaign.treatment === 'pr').map((r) => r.campaign.link);
    const issues = site.rows.filter((r) => r.campaign.treatment === 'issue').map((r) => r.campaign.link);
    expect(new Set(prs)).toEqual(new Set(site.links.prs));
    expect(new Set(issues)).toEqual(new Set(site.links.issues));
  });

  it('per-line matrix table', () => {
    const labels: Record<string, string> = {
      '4.2.30': 'Django 4\\.2\\.30',
      'debian-trixie': 'Debian 13 trixie',
      'ubuntu-noble': 'Ubuntu 24\\.04 noble',
    };
    for (const line of site.lines) {
      const m = top.match(new RegExp(`^\\| ${labels[line.id]}[^|]*\\| (\\d+) \\| (\\d+) \\| (\\d+) \\| (\\d+) \\|`, 'm'));
      expect(m, `README row for ${line.id}`).toBeTruthy();
      const [, a, na, u, np] = m!.map(Number);
      expect(site.summary.by_line[line.id]).toEqual({
        AFFECTED: a,
        NOT_AFFECTED_PROVEN: na,
        UNPROVEN: u,
        no_calibrated_probe: np,
      });
    }
  });

  it('chip totals cover every cell', () => {
    const total = Object.values(site.summary.chip_counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(site.rows.length * site.lines.length);
  });

  it('backtest false NOT_AFFECTED matches', () => {
    const rows = [...top.matchAll(/^\| v(\d) · [^|]+\| (\d+) \| \d+% \((\d+)\) \| \*\*(\d+)\*\* \| (\d+) \|/gm)];
    expect(rows).toHaveLength(2);
    for (const [, v, cases, decided, fna, unp] of rows) {
      const b = site.backtest[`v${v}` as 'v1' | 'v2'];
      expect([b.cases, b.decided, b.false_not_affected, b.unproven]).toEqual([cases, decided, fna, unp].map(Number));
    }
  });
});
