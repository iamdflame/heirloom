import data from '@/data/site.json';
import type { Chip, Line, LineId, Row, Site } from '@/data/types';

export const site = data as unknown as Site;
export const lineById = Object.fromEntries(site.lines.map((l) => [l.id, l])) as Record<LineId, Line>;
export const rowByAnchor = new Map<string, Row>(site.rows.map((r) => [r.anchor, r]));

export const CHIP_META: Record<Chip, { word: string; symbol: string; cls: string; meaning: string }> = {
  FIX_READY: { word: 'Fix ready', symbol: '✓', cls: 'bg-fix-bg text-fix-fg border-fix-fg/25', meaning: 'affected, and a verified candidate backport is open' },
  NOT_AFFECTED: { word: 'Not affected', symbol: '○', cls: 'bg-na-bg text-na-fg border-na-fg/25', meaning: 'proven not affected by a calibrated probe' },
  UNPROVEN: { word: 'Unproven', symbol: '?', cls: 'bg-unp-bg text-unp-fg border-unp-fg/25', meaning: 'the probe could not decide; evidence filed' },
  AFFECTED: { word: 'Affected', symbol: '!', cls: 'bg-aff-bg text-aff-fg border-aff-fg/25', meaning: 'the calibrated probe fails on this line' },
  NO_PROBE: { word: 'No probe', symbol: '–', cls: 'bg-np-bg text-np-fg border-np-fg/25', meaning: 'no probe passed calibration' },
};

export const REASONS: Record<string, string> = {
  NO_REACH: 'the probe never reached the code the fix changes on this line',
  NON_DISCRIMINATING: 'no probe failed before the fix and passed after it',
  PROBE_ERROR: 'the probe could not be made to run cleanly',
  MUTANT_UNBUILDABLE: 'the vulnerability could not be rebuilt inside this line to check the probe catches it',
  MUTANT_SURVIVED: 'a rebuilt vulnerability was not caught by the probe',
  FLAKY: 'the probe gave different results across runs',
  FAIL_MISMATCH: 'the probe failed on this line with different test ids than before the fix',
  STRUCTURAL_TEST: 'upstream tests error before the fix, so they cannot serve as the probe',
  ENV_SKIP: 'the probe needs a backend this harness does not run',
  ALREADY_PUBLISHED: 'published earlier by the first end-to-end run; no new PR',
};

export const GATES: Record<string, string> = {
  C0: 'Upstream tests fail before the fix and pass after it',
  C1: 'Probe fails on U⁻ with stable test ids, passes on U⁺',
  C2: 'Probe runs cleanly on this line',
  C3: 'Coverage reaches the code the fix changes',
  C4ab: 'A rebuilt vulnerability on this line is caught',
  C4c: 'The vulnerable lines were never on this line (provenance)',
  absent: 'The fixed symbol does not exist on this line',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 2026-08-04 → "Aug 4 2026" */
export function shortDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${d} ${y}`;
}
/** 2026-04-07 → "7 April 2026" */
export function longDate(iso: string) {
  const full = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${full[(m ?? 1) - 1]} ${y}`;
}
export const DEMO_URL = 'https://youtu.be/L4Zw555RuMs';
export const DEMO_LABEL = 'Watch the demo (2:27)';

export const prNum = (url: string) => `#${url.split('/').pop()}`;
