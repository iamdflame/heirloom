// Builds public/site.json (the page), public/receipts/<CVE>.json (lazy receipt detail) and
// src/data/types.ts from the export (site/data), evals/*.json and docs/business-plan.md.
// No number on the page is typed by hand: everything comes from here, and a missing required
// field fails the build loudly.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(WEB, '../..');
const DATA = join(ROOT, 'site/data');
const EVALS = join(ROOT, 'evals');

const read = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    fail(`cannot read ${relative(ROOT, p)}: ${e.message}`);
  }
};
function fail(msg) {
  console.error(`build-data: ${msg}`);
  process.exit(1);
}
/** need(obj, 'a.b.c', where) returns the value or fails the build. */
function need(obj, path, where) {
  let v = obj;
  for (const k of Array.isArray(path) ? path : path.split('.')) {
    if (v == null || !(k in Object(v))) fail(`missing required field ${path} in ${where}`);
    v = v[k];
  }
  if (v === undefined || v === null || v === '') fail(`empty required field ${path} in ${where}`);
  return v;
}
const opt = (v) => (v === undefined || v === null || v === '' || v === 'NONE' ? undefined : v);

// ---------- inputs ----------
const campaign = read(join(DATA, 'campaign.json'));
const matrix = read(join(DATA, 'matrix.json'));
const backtestExport = read(join(DATA, 'backtest.json'));
const index = read(join(DATA, 'index.json'));
read(join(DATA, 'events.json')); // required by the brief; detections come from evals/detections.json
const advisories = need(read(join(DATA, 'advisories.json')), 'advisories', 'site/data/advisories.json');
const artifacts = read(join(DATA, 'artifacts.json'));
const evidence = read(join(EVALS, 'campaign_evidence.json'));
const results = read(join(EVALS, 'results.json'));
const live = read(join(EVALS, 'results_live.json'));
const detections = read(join(EVALS, 'detections.json'));
const distro = need(read(join(EVALS, 'distro_lines.json')), 'lines', 'evals/distro_lines.json');
const cveDocs = Object.fromEntries(
  readdirSync(join(DATA, 'cve'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.replace(/\.json$/, ''), read(join(DATA, 'cve', f))]),
);
const lineDocs = Object.fromEntries(
  readdirSync(join(DATA, 'line'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f.replace(/\.json$/, ''), read(join(DATA, 'line', f))]),
);
const businessPlan = readFileSync(join(ROOT, 'docs/business-plan.md'), 'utf8');

// ---------- constants that are editorial, not data ----------
const REPO = 'https://github.com/iamdflame/heirloom';
const EOL = '2026-04-07';
const LINE_ORDER = ['4.2.30', 'debian-trixie', 'ubuntu-noble'];
const LINE_LABEL = {
  '4.2.30': { name: 'Django 4.2.30', note: 'upstream' },
  'debian-trixie': { name: 'Debian 13', note: 'trixie' },
  'ubuntu-noble': { name: 'Ubuntu 24.04', note: 'noble' },
};
const RECORD = 'HL–4.2';
const OBJECT = 'Django 4.2 LTS';
const EOL_SOURCE = 'https://endoflife.date/django'; // outside confirmation of the EOL date
const LINE_ABBR = { '4.2.30': 'DJ', 'debian-trixie': 'DE', 'ubuntu-noble': 'UB' };

// ---------- campaign scope: the 19 post-EOL CVEs ----------
const perCve = need(campaign, 'per_cve', 'campaign.json');
const summary = need(campaign, 'summary', 'campaign.json');
const scope = Object.keys(perCve);
if (scope.length !== need(summary, 'cves', 'campaign.json summary')) fail('per_cve does not match summary.cves');
for (const c of scope) if (!index.cves.includes(c)) fail(`${c} is not in index.json`);

const cveNum = (c) => {
  const [, y, n] = c.match(/^CVE-(\d{4})-(\d+)$/) ?? fail(`bad CVE id ${c}`);
  return [Number(y), Number(n)];
};
const ordered = [...scope].sort((a, b) => {
  const da = need(advisories, [a, 'date'], 'advisories.json');
  const db = need(advisories, [b, 'date'], 'advisories.json');
  if (da !== db) return da < db ? -1 : 1;
  const [ya, na] = cveNum(a);
  const [yb, nb] = cveNum(b);
  return ya - yb || na - nb;
});
const accession = (i) => `${RECORD}–${String(i + 1).padStart(3, '0')}`;
const anchor = (acc) => acc.replaceAll('–', '-');

// ---------- lines ----------
const lines = LINE_ORDER.map((id) => {
  const spec = need(matrix, ['lines', id], 'matrix.json');
  const d = distro[id];
  const version = d ? need(d, 'version', `distro_lines.json ${id}`) : id;
  const upstream = d ? need(d, 'upstream_tag', `distro_lines.json ${id}`) : id;
  const lab = LINE_LABEL[id];
  return {
    id,
    name: lab.name,
    note: lab.note,
    abbr: LINE_ABBR[id],
    kind: need(spec, 'kind', `matrix.lines.${id}`),
    version, // exact package version string (or the upstream tag for the eval line)
    upstream, // the upstream 4.2.x it is built on
    label:
      id === '4.2.30'
        ? `${lab.name} (upstream)`
        : id === 'ubuntu-noble'
          ? `${lab.name} · ${upstream} + Ubuntu patches`
          : `${lab.name} · ${upstream}`,
    tip: need(spec, 'tip', `matrix.lines.${id}`),
    ...(d?.changelog_date ? { changelog_date: d.changelog_date } : {}),
  };
});

// ---------- verdict → chip ----------
const CHIPS = ['FIX_READY', 'NOT_AFFECTED', 'UNPROVEN', 'AFFECTED', 'NO_PROBE'];
const chipOf = (verdict, line, hasPr) => {
  switch (verdict) {
    case 'AFFECTED':
      return line === '4.2.30' && hasPr ? 'FIX_READY' : 'AFFECTED';
    case 'NOT_AFFECTED_PROVEN':
      return 'NOT_AFFECTED';
    case 'UNPROVEN':
      return 'UNPROVEN';
    case 'no_calibrated_probe':
      return 'NO_PROBE';
    default:
      return fail(`unknown matrix verdict ${verdict}`);
  }
};

const cellsBy = new Map(need(matrix, 'cells', 'matrix.json').map((c) => [`${c.cve}|${c.line}`, c]));
const f2p = new Map(need(evidence, 'fail_to_pass', 'campaign_evidence.json').map((x) => [x.cve, x]));
const questions = need(evidence, 'questions', 'campaign_evidence.json');
const precedents = need(evidence, 'precedents', 'campaign_evidence.json');
const artifactDirs = new Set(need(artifacts, 'dirs', 'artifacts.json'));
const artifactUrl = (dir) => `${REPO}/tree/${need(artifacts, 'sha', 'artifacts.json')}/${dir}`;
const numOf = (url) => Number(url.split('/').pop());

const runSummary = (runs) =>
  runs && runs.length
    ? {
        outcomes: runs.map((r) => need(r, 'outcome', 'matrix run')),
        failing_ids: [...new Set(runs.flatMap((r) => r.failing_ids ?? []))],
      }
    : undefined;

const campaignEvents = (cve) => (cveDocs[cve]?.campaign ?? []).filter((e) => e.cve === cve);

const rows = ordered.map((cve, i) => {
  const adv = need(advisories, [cve], 'advisories.json');
  const pc = need(perCve, [cve], 'campaign.json per_cve');
  const link = need(pc, 'link', `per_cve ${cve}`);
  const isPr = link.includes('/pull/');
  const events = campaignEvents(cve);
  const main = events.find((e) => e.kind === 'new') ?? events[0];
  if (!main) fail(`no campaign event for ${cve}`);
  const followups = events.filter((e) => e !== main);
  const ftp = f2p.get(cve);
  const prec = precedents.find((p) => p.applied_by.some((a) => a.cve === cve));
  const asked = questions.find((q) => q.asked_by === cve);
  const waited = questions.find((q) => q.waited.includes(cve));
  // campaign_evidence names the run that did the work; the event's run_id can be a later
  // resume that only published. Raw logs: that run's artifacts dir, else the CVE's latest one.
  const runId = opt(ftp?.run_id) ?? opt(main.run_id);
  const traces = [
    ...new Set([
      ...(ftp?.trace_id ? [ftp.trace_id] : []),
      ...(cveDocs[cve]?.stages ?? [])
        .filter((s) => s.run_id === runId && s.line === '4.2' && opt(s.trace_id))
        .map((s) => s.trace_id),
    ]),
  ];
  const cveDirs = [...artifactDirs].filter((d) => d.startsWith('runs/') && d.endsWith(`/${cve}-4.2`)).sort();
  const logsDir = cveDirs.find((d) => d === `runs/${runId}/${cve}-4.2`) ?? cveDirs.at(-1);
  const cells = LINE_ORDER.map((line) => {
    const c = cellsBy.get(`${cve}|${line}`) ?? fail(`matrix has no cell ${cve} × ${line}`);
    return { line, verdict: need(c, 'verdict', `cell ${cve} ${line}`), chip: chipOf(c.verdict, line, isPr) };
  });
  const affected = cells.filter((c) => c.chip === 'FIX_READY' || c.chip === 'AFFECTED').length;
  return {
    acc: accession(i),
    anchor: anchor(accession(i)),
    cve,
    title: need(adv, 'title', `advisory ${cve}`),
    date: need(adv, 'date', `advisory ${cve}`),
    ...(adv.url ? { url: adv.url } : {}),
    cells,
    affected,
    campaign: {
      verdict: need(pc, 'verdict', `per_cve ${cve}`),
      ...(opt(pc.reason) ? { reason: pc.reason } : {}),
      status: need(pc, 'status', `per_cve ${cve}`),
      treatment: isPr ? 'pr' : 'issue',
      link,
      number: numOf(link),
      ...(runId ? { run_id: runId } : {}),
      ...(opt(main.checkpoint) ? { checkpoint: main.checkpoint } : {}),
      ...(traces.length ? { traces } : {}),
      cost_usd: pc.ledger_cost_usd ?? 0,
      minutes: pc.minutes ?? 0,
      escalated: Boolean(pc.escalated),
      ...(pc.depends_on?.length ? { depends_on: pc.depends_on } : {}),
      ...(main.supersedes?.pr ? { stacked_on: main.supersedes.pr } : {}),
      ...(opt(main.note) ? { note: main.note } : {}),
      ...(ftp?.fail_to_pass ? { fail_to_pass: { before: ftp.probe_before, after: ftp.probe_after } } : {}),
      ...(prec ? { precedent: prec.id } : {}),
      ...(asked ? { asked: asked.issue } : {}),
      ...(waited ? { waited_on: waited.issue } : {}),
      ...(logsDir ? { logs: artifactUrl(logsDir) } : {}),
      ...(followups.length ? { followups: followups.map((e) => ({ date: e.archive_date, kind: e.kind })) } : {}),
    },
  };
});

// ---------- receipts (lazy) ----------
const receipts = Object.fromEntries(
  ordered.map((cve) => {
    const lineCells = LINE_ORDER.map((line) => {
      const c = cellsBy.get(`${cve}|${line}`);
      const gates = Object.entries(c.gates ?? {}).map(([id, g]) => ({
        id,
        ok: Boolean(g.ok),
        ...(opt(g.detail) ? { detail: g.detail } : {}),
        ...(opt(g.reason) ? { reason: g.reason } : {}),
      }));
      const origin = c.probe?.origin;
      return {
        line,
        verdict: c.verdict,
        ...(opt(c.reason) ? { reason: c.reason } : {}),
        ...(opt(c.detail) ? { detail: c.detail } : {}),
        gates,
        ...(origin
          ? { probe: { origin: origin === 'porter' ? 'porter' : 'hand-written', sha: need(c, 'probe.sha', `cell ${cve}`) } }
          : {}),
        ...(c.fix?.commits ? { fix: { series: c.fix.series, commits: c.fix.commits, um: c.fix.um } } : {}),
        runs: Object.fromEntries(
          ['um', 'up', 'lt'].map((k) => [k, runSummary(c.runs?.[k])]).filter(([, v]) => v),
        ),
      };
    });
    const logs = artifactDirs.has(`matrix/b4-20261011/${cve}`) ? artifactUrl(`matrix/b4-20261011/${cve}`) : undefined;
    return [cve, { cve, cells: lineCells, ...(logs ? { matrix_logs: logs } : {}) }];
  }),
);

// ---------- counts ----------
const chipCounts = Object.fromEntries(CHIPS.map((k) => [k, 0]));
for (const r of rows) for (const c of r.cells) chipCounts[c.chip]++;
const byLine = Object.fromEntries(
  LINE_ORDER.map((line) => {
    const counts = { AFFECTED: 0, NOT_AFFECTED_PROVEN: 0, UNPROVEN: 0, no_calibrated_probe: 0 };
    for (const r of rows) counts[r.cells.find((c) => c.line === line).verdict]++;
    return [line, counts];
  }),
);
const verdicts = need(summary, 'verdicts', 'campaign.summary');
const prs = need(summary, 'prs', 'campaign.summary');
const issues = need(summary, 'evidence_issues', 'campaign.summary');
const f2pDone = [...f2p.values()].filter((x) => x.fail_to_pass);
const minRuns = (k) => Math.min(...f2pDone.map((x) => x[k].length));

// ---------- replay stops ----------
const batches = [...new Set(rows.map((r) => r.date))].sort();
const followupDates = rows.flatMap((r) => (r.campaign.followups ?? []).map((f) => ({ date: f.date, cve: r.cve })));
const stops = [
  { date: EOL, kind: 'eol', label: 'Django 4.2 end of life' },
  ...batches.map((d) => ({ date: d, kind: 'advisories', label: `${rows.filter((r) => r.date === d).length} advisories` })),
  // Ubuntu's noble upload with its CVE-2026-15307 patch. The date is the brief's (publication);
  // the package changelog in evals/distro_lines.json is dated 2026-09-28.
  { date: '2026-10-01', kind: 'distro', label: 'Ubuntu ships its CVE-2026-15307 patch' },
  ...followupDates.map((f) => ({ date: f.date, kind: 'followup', label: `Follow-up fix for ${f.cve}` })),
].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

const stacked = rows.find((r) => r.campaign.stacked_on);
const stackedOn = stacked && rows.find((r) => r.campaign.link === stacked.campaign.stacked_on);
const q = questions[0] ?? fail('campaign_evidence.json has no question');
const qRow = rows.find((r) => r.cve === q.asked_by);

// ---------- query timeline (B7b renders it) ----------
const p001 = precedents.find((p) => p.issue === q.issue) ?? fail('no precedent for the question');
const query = {
  issue: q.issue,
  number: numOf(q.issue),
  asked_by: q.asked_by,
  asked_at: need(q, 'asked_at', 'question'),
  asking_trace: opt(q.asking_trace),
  waited: q.waited,
  precedent: {
    id: p001.id,
    kind: p001.kind,
    answer: p001.answer,
    stored_at: need(p001, 'stored_at', 'precedent'),
    applied_by: p001.applied_by.map((a) => ({ cve: a.cve, pr: a.pr, number: numOf(a.pr), trace_id: a.trace_id, run_id: a.run_id })),
  },
};

// ---------- backtest ----------
const bt = need(results, 'summary', 'results.json');
const backtest = Object.fromEntries(
  ['v1', 'v2'].map((k) => {
    const b = need(bt, k, 'results.json summary');
    return [
      k,
      {
        cases: need(b, 'cases', k),
        decided: need(b, 'decided', k),
        accuracy: need(b, 'verdict_accuracy', k),
        false_not_affected: b.false_not_affected,
        false_affected: b.false_affected,
        unproven: b.unproven,
        escalation_rate: b.escalation_rate,
        usd_per_case: b.usd_per_case,
      },
    ];
  }),
);
if (backtestExport.summary?.v2?.cases !== backtest.v2.cases) fail('site/data/backtest.json disagrees with evals/results.json');

// ---------- economics (business-plan inputs table) ----------
const inputs = [];
{
  const tbl = businessPlan.split('## Inputs and sources')[1]?.split('\n## ')[0] ?? fail('business-plan.md has no inputs table');
  for (const line of tbl.split('\n')) {
    const cols = line.split('|').slice(1, -1).map((s) => s.trim());
    if (cols.length < 6 || cols[0].startsWith('Input') || cols[0].startsWith('---')) continue;
    inputs.push({ name: cols[0], base: cols[1], bear: cols[2], bull: cols[3], status: cols[4].replaceAll('*', '') });
  }
  if (!inputs.length) fail('business-plan.md inputs table is empty');
}
// "- Base: <https://app.cfo.ai/s/…>" in the plan (or "[Base](…)" in the README)
const cfoPages = [...businessPlan.matchAll(/(?:\[|- )(Base|Bear|Bull)(?:\]\(|: <)(https:\/\/app\.cfo\.ai\/s\/[^)>]+)[)>]/g)]
  .map((m) => ({ name: m[1], url: m[2] }))
  .filter((p, i, a) => a.findIndex((q) => q.name === p.name) === i);
if (cfoPages.length !== 3) fail(`business-plan.md: expected the Base/Bear/Bull cfo.ai links, found ${cfoPages.length}`);
// the plan's results table, read back from cfo.ai (hypothesis outputs)
const planResults = [];
{
  const tbl = businessPlan.split('## Results')[1]?.split('\n## ')[0] ?? fail('business-plan.md has no results table');
  for (const line of tbl.split('\n')) {
    const cols = line.split('|').slice(1, -1).map((s) => s.trim());
    if (cols.length !== 4 || !cols[0] || cols[0].startsWith('---')) continue;
    planResults.push({ name: cols[0], base: cols[1], bear: cols[2], bull: cols[3] });
  }
  if (planResults.length < 3) fail('business-plan.md results table is too short');
}

// ---------- detections ----------
const det = Object.entries(need(detections, 'neatlogs', 'detections.json')).map(([name, d]) => ({ name, hits: d.hits }));

// ---------- Fig. 2: the Ubuntu finding (the stacked CVE on noble) ----------
const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
const hackathon = readFileSync(join(ROOT, 'hackathon.md'), 'utf8');
const repoFile = (path) => {
  try {
    readFileSync(join(ROOT, path));
  } catch {
    fail(`linked repo file ${path} does not exist`);
  }
  return `${REPO}/blob/main/${path}`;
};
let finding;
if (stacked && stackedOn) {
  const noble = cellsBy.get(`${stacked.cve}|ubuntu-noble`) ?? fail(`no noble cell for ${stacked.cve}`);
  const outcomes = (k) => need(noble, ['runs', k], `noble cell ${stacked.cve}`).map((r) => r.outcome);
  const claim = readme.match(/\*\*Ubuntu finding:\*\* (.+?;.+?\.) /)?.[1] ?? fail('README has no "Ubuntu finding" sentence');
  const distroStop = stops.find((x) => x.kind === 'distro') ?? fail('no distro stop');
  const sha = need(noble, 'fix.commits.0', `noble cell ${stacked.cve}`);
  const logs = receipts[stacked.cve]?.matrix_logs ?? fail(`no matrix logs for ${stacked.cve}`);
  finding = {
    cve: stacked.cve,
    title: stacked.title,
    advisory_date: stacked.date,
    advisory_url: stacked.url,
    amends: stackedOn.cve,
    distro_date: distroStop.date,
    line: 'ubuntu-noble',
    version: lines.find((l) => l.id === 'ubuntu-noble').version,
    um: outcomes('um'),
    up: outcomes('up'),
    lt: outcomes('lt'),
    fix_commit: sha,
    fix_url: `https://github.com/django/django/commit/${sha}`,
    hand_written: String(need(noble, 'probe.origin', 'noble probe')).startsWith('hand-written'),
    probe_sha: need(noble, 'probe.sha', 'noble probe'),
    logs,
    claim,
    draft: repoFile('docs/outreach/ubuntu-cve-2026-87890.md'),
    amends_noble: cellsBy.get(`${stackedOn.cve}|ubuntu-noble`)?.verdict,
  };
}

// ---------- Method: the artifact behind each stage ----------
const example = rows.find((r) => r.campaign.number === 13 && r.campaign.treatment === 'pr') ?? rows.find((r) => r.campaign.treatment === 'pr');
const exampleIssue = rows.find((r) => r.campaign.treatment === 'issue');
const method = {
  example: { cve: example.cve, anchor: example.anchor, pr: example.campaign.link, number: example.campaign.number },
  issue: { cve: exampleIssue.cve, anchor: exampleIssue.anchor, url: exampleIssue.campaign.link, number: exampleIssue.campaign.number },
  code: {
    locate: repoFile('heirloom/pipeline/locate.py'),
    probe: repoFile('heirloom/pipeline/probe.py'),
    calibrate: repoFile('heirloom/pipeline/calibrate.py'),
    verify: repoFile('heirloom/pipeline/verify.py'),
    decide: repoFile('heirloom/pipeline/decide.py'),
  },
  evidence: repoFile('evals/campaign_evidence.json'),
};

// ---------- Stated limits: the facts behind them ----------
const recovery = read(join(EVALS, 'recovery_b4.json'));
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const restartsWord = hackathon.match(/restarted the campaign workers (\w+) times/)?.[1] ?? fail('hackathon.md: no restart count');
const limits = {
  restarts: WORDS[restartsWord] ?? Number(restartsWord),
  recovery: {
    cve: need(recovery, 'cve', 'recovery_b4.json'),
    run_id: need(recovery, 'runs.0.run_id', 'recovery_b4.json'),
    url: repoFile('evals/recovery_b4.json'),
  },
};

const site = {
  record: RECORD,
  object: OBJECT,
  eol_source: EOL_SOURCE,
  repo: REPO,
  generated_at: need(campaign, 'generated_at', 'campaign.json'),
  eol: EOL,
  campaign: need(campaign, 'campaign', 'campaign.json'),
  lines,
  chips: CHIPS,
  summary: {
    cves: rows.length,
    verdicts,
    prs: prs.length,
    issues: issues.length,
    questions: questions.length,
    fail_to_pass: f2pDone.length,
    probe_before: minRuns('probe_before'),
    probe_after: minRuns('probe_after'),
    chip_counts: chipCounts,
    by_line: byLine,
    cost_usd: need(summary, 'ledger_cost_usd', 'campaign.summary'),
    minutes: need(summary, 'minutes_total', 'campaign.summary'),
  },
  rows,
  stops,
  connector: stacked && stackedOn
    ? { from: stacked.cve, to: stackedOn.cve, pr: stacked.campaign.number, on: stackedOn.campaign.number, date: stacked.date }
    : undefined,
  query_marker: { cve: qRow.cve, number: numOf(q.issue) },
  query,
  backtest,
  detections: det,
  economics: {
    inputs,
    pages: cfoPages,
    results: planResults,
    plan: repoFile('docs/business-plan.md'),
  },
  finding,
  method,
  limits,
  files: {
    detections: repoFile('evals/detections.json'),
    detections_flag_check: repoFile('evals/detections_flag_check.json'),
    results: repoFile('evals/results.json'),
    results_live: repoFile('evals/results_live.json'),
    entire_docs: `${REPO}/tree/main/docs/entire`,
    evidence_md: repoFile('EVIDENCE.md'),
  },
  links: { prs: prs.sort((a, b) => numOf(a) - numOf(b)), issues: issues.sort((a, b) => numOf(a) - numOf(b)) },
  live_summary: live.summary?.verdicts,
};

// ---------- write ----------
const pub = join(WEB, 'public');
writeFileSync(join(pub, 'site.json'), JSON.stringify(site));
writeFileSync(join(WEB, 'src/data/site.json'), JSON.stringify(site)); // bundled: the register renders without a fetch
rmSync(join(pub, 'receipts'), { recursive: true, force: true });
mkdirSync(join(pub, 'receipts'));
for (const [cve, r] of Object.entries(receipts)) writeFileSync(join(pub, 'receipts', `${cve}.json`), JSON.stringify(r));
const size = readFileSync(join(pub, 'site.json')).length;
if (size > 150_000) fail(`site.json is ${size} bytes (budget 150 kB)`);

writeFileSync(join(WEB, 'src/data/types.ts'), TYPES());
console.log(`build-data: site.json ${(size / 1024).toFixed(1)} kB, ${rows.length} rows, ${Object.keys(receipts).length} receipts`);
void lineDocs;

function TYPES() {
  return `// generated by scripts/build-data.mjs — do not edit
export type Chip = 'FIX_READY' | 'NOT_AFFECTED' | 'UNPROVEN' | 'AFFECTED' | 'NO_PROBE';
export type MatrixVerdict = 'AFFECTED' | 'NOT_AFFECTED_PROVEN' | 'UNPROVEN' | 'no_calibrated_probe';
export type LineId = ${LINE_ORDER.map((l) => `'${l}'`).join(' | ')};

export interface Line {
  id: LineId;
  name: string;
  note: string;
  abbr: string;
  kind: string;
  version: string;
  upstream: string;
  label: string;
  tip: string;
  changelog_date?: string;
}

export interface Cell {
  line: LineId;
  verdict: MatrixVerdict;
  chip: Chip;
}

export interface Treatment {
  verdict: string;
  reason?: string;
  status: string;
  treatment: 'pr' | 'issue';
  link: string;
  number: number;
  run_id?: string;
  checkpoint?: string;
  traces?: string[];
  cost_usd: number;
  minutes: number;
  escalated: boolean;
  depends_on?: string[];
  stacked_on?: string;
  note?: string;
  fail_to_pass?: { before: string[]; after: string[] };
  precedent?: string;
  asked?: string;
  waited_on?: string;
  logs?: string;
  followups?: { date: string; kind: string }[];
}

export interface Row {
  acc: string;
  anchor: string;
  cve: string;
  title: string;
  date: string;
  url?: string;
  cells: Cell[];
  affected: number;
  campaign: Treatment;
}

export interface Stop {
  date: string;
  kind: 'eol' | 'advisories' | 'distro' | 'followup';
  label: string;
}

export interface Finding {
  cve: string;
  title: string;
  advisory_date: string;
  advisory_url?: string;
  amends: string;
  distro_date: string;
  line: LineId;
  version: string;
  um: string[];
  up: string[];
  lt: string[];
  fix_commit: string;
  fix_url: string;
  hand_written: boolean;
  probe_sha: string;
  logs: string;
  claim: string;
  draft: string;
  amends_noble?: MatrixVerdict;
}

export interface Site {
  record: string;
  object: string;
  eol_source: string;
  repo: string;
  generated_at: string;
  eol: string;
  campaign: string;
  lines: Line[];
  chips: Chip[];
  summary: {
    cves: number;
    verdicts: Record<string, number>;
    prs: number;
    issues: number;
    questions: number;
    fail_to_pass: number;
    probe_before: number;
    probe_after: number;
    chip_counts: Record<Chip, number>;
    by_line: Record<LineId, Record<MatrixVerdict, number>>;
    cost_usd: number;
    minutes: number;
  };
  rows: Row[];
  stops: Stop[];
  connector?: { from: string; to: string; pr: number; on: number; date: string };
  query_marker: { cve: string; number: number };
  query: {
    issue: string;
    number: number;
    asked_by: string;
    asked_at: string;
    asking_trace?: string;
    waited: string[];
    precedent: {
      id: string;
      kind: string;
      answer: string;
      stored_at: string;
      applied_by: { cve: string; pr: string; number: number; trace_id: string; run_id: string }[];
    };
  };
  backtest: Record<'v1' | 'v2', {
    cases: number;
    decided: number;
    accuracy: number;
    false_not_affected: number;
    false_affected: number;
    unproven: number;
    escalation_rate: number;
    usd_per_case: number;
  }>;
  detections: { name: string; hits: number }[];
  economics: {
    inputs: { name: string; base: string; bear: string; bull: string; status: string }[];
    pages: { name: string; url: string }[];
    results: { name: string; base: string; bear: string; bull: string }[];
    plan: string;
  };
  finding?: Finding;
  method: {
    example: { cve: string; anchor: string; pr: string; number: number };
    issue: { cve: string; anchor: string; url: string; number: number };
    code: Record<'locate' | 'probe' | 'calibrate' | 'verify' | 'decide', string>;
    evidence: string;
  };
  limits: { restarts: number; recovery: { cve: string; run_id: string; url: string } };
  files: Record<'detections' | 'detections_flag_check' | 'results' | 'results_live' | 'entire_docs' | 'evidence_md', string>;
  links: { prs: string[]; issues: string[] };
}

export interface Gate {
  id: string;
  ok: boolean;
  detail?: string;
  reason?: string;
}

export interface RunSummary {
  outcomes: string[];
  failing_ids: string[];
}

export interface ReceiptCell {
  line: LineId;
  verdict: MatrixVerdict;
  reason?: string;
  detail?: string;
  gates: Gate[];
  probe?: { origin: 'porter' | 'hand-written'; sha: string };
  fix?: { series: string; commits: string[]; um: string };
  runs: Partial<Record<'um' | 'up' | 'lt', RunSummary>>;
}

export interface Receipt {
  cve: string;
  cells: ReceiptCell[];
  matrix_logs?: string;
}
`;
}
