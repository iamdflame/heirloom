// Pulls the real terminal text the film types out, verbatim, into src/data/terminal.json.
// - the Ubuntu noble probe runs for CVE-2026-87890 (artifacts branch, B4 matrix logs)
// - `entire checkpoint explain` for PR #13 (docs/entire/checkpoint-pr13-*.txt)
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repo = join(import.meta.dirname, '..', '..');
const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' });

let ref = 'artifacts';
try { git('rev-parse', '--verify', '-q', ref); } catch { ref = 'origin/artifacts'; }

const dir = 'matrix/b4-20261011/CVE-2026-87890/ubuntu-noble/logs/calibrate/2e97ddd6';
const runs = [0, 1, 2].map((i) => {
  const file = `L-f566e91a2c-${i}.log`;
  const log = git('show', `${ref}:${dir}/${file}`).split('\n');
  const pick = (re) => log.find((l) => re.test(l)) ?? '';
  return {
    file,
    exit: pick(/^# exit=/),
    test: pick(/ \.\.\. (FAIL|ok|ERROR)$/),
    assertion: pick(/^AssertionError:/),
    result: pick(/^(FAILED|OK)/),
  };
});

const cpFile = readdirSync(join(repo, 'docs/entire')).find((f) => f.startsWith('checkpoint-pr13-'));
const cpText = readFileSync(join(repo, 'docs/entire', cpFile), 'utf8').split('\n');
const checkpointId = cpFile.replace(/^checkpoint-pr13-|\.txt$/g, '');
// header + intent: everything up to the transcript's first user line
const end = cpText.findIndex((l) => l.startsWith('[User]'));
const checkpoint = { id: checkpointId, file: `docs/entire/${cpFile}`, lines: cpText.slice(0, end + 1) };

writeFileSync(
  join(import.meta.dirname, '..', 'src/data/terminal.json'),
  JSON.stringify({ probe: { ref, dir, runs }, checkpoint }, null, 1) + '\n',
);
console.log('terminal.json:', runs.map((r) => r.test.slice(-6)).join(' '), '| checkpoint lines', checkpoint.lines.length);
