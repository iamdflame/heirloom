// Verifies every PR and issue URL in public/site.json exists, via `gh api` (run after build-data).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const site = JSON.parse(readFileSync(new URL('../public/site.json', import.meta.url), 'utf8'));
const urls = new Set([
  ...site.links.prs,
  ...site.links.issues,
  site.query.issue,
  ...site.rows.map((r) => r.campaign.link),
  ...site.query.precedent.applied_by.map((a) => a.pr),
]);
let bad = 0;
for (const url of [...urls].sort()) {
  const m = url.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/(pull|issues)\/(\d+)$/);
  if (!m) {
    console.log(`SKIP ${url}`);
    continue;
  }
  const [, repo, kind, n] = m;
  try {
    execFileSync('gh', ['api', `repos/${repo}/${kind === 'pull' ? 'pulls' : 'issues'}/${n}`, '--jq', '.number'], { stdio: 'pipe' });
    console.log(`200  ${url}`);
  } catch {
    console.log(`FAIL ${url}`);
    bad++;
  }
}
console.log(`${urls.size - bad}/${urls.size} links resolve`);
process.exit(bad ? 1 : 0);
