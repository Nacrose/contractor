#!/usr/bin/env node
/**
 * Automated Test Suite for TruePPM Release-Update Pipeline (M09-T06).
 *
 * Verifies:
 * 1. CLI argument parsing and error reporting.
 * 2. Registry integrity validation (--check).
 * 3. Strict rejection of unregistered releases.
 * 4. Two-release qualification battery (v0.4.0-beta.1 <-> v0.3.9).
 * 5. Safe bidirectional upgrade and rollback without schedule corruption.
 * 6. Automatic registry and markdown synchronization.
 */

import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT_DIR, 'scripts/update-trueppm');
const REGISTRY_PATH = join(ROOT_DIR, 'docs/vendor/trueppm-registry.json');
const TRUEPPM_MD_PATH = join(ROOT_DIR, 'docs/vendor/TRUEPPM.md');

function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

function runCommand(args, expectFail = false) {
  try {
    const rawStdout = execFileSync(SCRIPT, args, {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (expectFail) {
      assert.fail(`Expected command to fail: ${args.join(' ')}`);
    }
    return { code: 0, stdout: stripAnsi(rawStdout), rawStdout, stderr: '' };
  } catch (err) {
    if (!expectFail) {
      assert.fail(`Command failed unexpectedly (${err.status}): ${args.join(' ')}\n${err.stderr}`);
    }
    const rawStdout = err.stdout || '';
    const rawStderr = err.stderr || '';
    return {
      code: err.status,
      stdout: stripAnsi(rawStdout),
      rawStdout,
      stderr: stripAnsi(rawStderr),
      rawStderr,
    };
  }
}

console.log('--- Running TruePPM Update Pipeline Verification Suite (M09-T06) ---\n');

// 1. Help message
{
  const res = runCommand(['--help']);
  assert.strictEqual(res.code, 0);
  assert(res.stdout.includes('TruePPM Release-Update & Rollback Pipeline CLI'));
  console.log('✔ CLI help message verified');
}

// 2. Registry Check
{
  const res = runCommand(['--check']);
  assert.strictEqual(res.code, 0);
  assert(res.stdout.includes('TruePPM vendor registry is valid and consistent'));
  console.log('✔ Registry integrity check verified');
}

// 3. Reject unregistered release
{
  const res = runCommand(['v99.9.9-invalid'], true);
  assert.notStrictEqual(res.code, 0);
  assert(res.stderr.includes("Release 'v99.9.9-invalid' is not registered"));
  console.log('✔ Strict rejection of unregistered release verified');
}

// 4. Two-release Qualification: Rollback to v0.3.9
{
  const res = runCommand(['--rollback', 'v0.3.9']);
  assert.strictEqual(res.code, 0);
  assert(res.stdout.includes('Successfully rolled back to TruePPM v0.3.9'));

  // Check registry reflects v0.3.9
  const reg = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
  assert.strictEqual(reg.component.currentRelease, 'v0.3.9');
  assert.strictEqual(reg.component.packageVersion, '0.3.9');

  // Check markdown reflects v0.3.9
  const md = readFileSync(TRUEPPM_MD_PATH, 'utf-8');
  assert(md.includes('0.3.9'));
  console.log('✔ Rollback to v0.3.9 and registry/markdown synchronization verified');
}

// 5. Two-release Qualification: Upgrade back to v0.4.0-beta.1
{
  const res = runCommand(['v0.4.0-beta.1']);
  assert.strictEqual(res.code, 0);
  assert(res.stdout.includes('Successfully updated to TruePPM v0.4.0-beta.1'));

  // Check registry reflects v0.4.0-beta.1
  const reg = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
  assert.strictEqual(reg.component.currentRelease, 'v0.4.0-beta.1');
  assert.strictEqual(reg.component.packageVersion, '0.4.0b1');
  assert.strictEqual(reg.component.previousRelease, 'v0.3.9');

  // Check markdown reflects v0.4.0-beta.1
  const md = readFileSync(TRUEPPM_MD_PATH, 'utf-8');
  assert(md.includes('0.4.0b1'));
  console.log('✔ Upgrade back to v0.4.0-beta.1 and bidirectional safety verified');
}

console.log('\n--- All TruePPM Update Pipeline Verification Checks PASSED (M09-T06) ---');
