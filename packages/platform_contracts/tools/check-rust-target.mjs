import { appendFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
const rustFiles = trackedFiles.filter((path) => path.endsWith('.rs') || path.endsWith('Cargo.toml'));

if (rustFiles.length > 0) {
  console.error(`A Rust target now exists (${rustFiles.join(', ')}). Replace this blocked check with real generation and fixture compilation.`);
  process.exit(1);
}

const message = 'BLOCKED: no tracked Rust source or Cargo.toml exists for a real Rust target. No Rust stub or passing result is claimed.';
console.log(message);
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) await appendFile(summaryPath, `### Rust contract fixtures\n\n${message}\n`);
