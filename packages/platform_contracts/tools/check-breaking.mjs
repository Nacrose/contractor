import { appendFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';

const tags = execFileSync(
  'git',
  ['tag', '--list', 'platform-contracts/v*', '--sort=-version:refname'],
  { encoding: 'utf8' },
).trim().split('\n').filter(Boolean);

if (tags.length === 0) {
  const message = 'BLOCKED: no earlier platform-contracts release tag exists yet; this is the initial schema release.';
  console.log(message);
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) await appendFile(summaryPath, `### Schema compatibility\n\n${message}\n`);
  process.exit(0);
}

const baselineTag = tags[0];
console.log(`Checking schema compatibility against ${baselineTag}`);
const result = spawnSync(
  './node_modules/.bin/buf',
  ['breaking', '--against', `../../.git#tag=${baselineTag},subdir=packages/platform_contracts/proto`],
  { stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
