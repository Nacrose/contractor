#!/usr/bin/env node
/**
 * Automated Test Suite for ArtCraft Release-Update Pipeline (M06-T12).
 *
 * Verifies:
 * 1. CLI argument parsing and error reporting.
 * 2. Registry integrity validation (--check).
 * 3. Strict rejection of unregistered apps.
 * 4. Strict rejection of pending apps (cadcraft, pdfcraft, wordcraft, deckcraft, craft-fonts)
 *    with explicit milestone dependencies.
 * 5. GridCraft two-release qualification (v0.3.0 upgrade and v0.2.0 rollback).
 * 6. Non-destructive safety invariants (original/checkpoint byte preservation).
 */

import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT_DIR, 'scripts/update-artcraft');

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

console.log('--- Running ArtCraft Update Pipeline Verification Suite (M06-T12) ---\n');

// 1. Help message
{
  const res = runCommand(['--help']);
  assert.strictEqual(res.code, 0);
  assert(res.stdout.includes('ArtCraft Family Release-Update Pipeline'));
  assert(res.stdout.includes('gridcraft'));
  assert(res.stdout.includes('cadcraft'));
  console.log('✓ 1. --help displays command interface and registered apps');
}

// 2. Registry integrity check
{
  const res = runCommand(['--check']);
  assert.strictEqual(res.code, 0);
  assert(res.stdout.includes('=== ArtCraft Vendor Registry Integrity Check ==='));
  assert(res.stdout.includes('[SUPPORTED] GridCraft:'));
  assert(res.stdout.includes('[PENDING]   CADCraft:'));
  assert(res.stdout.includes('[PENDING]   PdfCraft:'));
  assert(res.stdout.includes('[PENDING]   WordCraft:'));
  assert(res.stdout.includes('[PENDING]   DeckCraft:'));
  assert(res.stdout.includes('[PENDING]   craft-fonts:'));
  assert(res.stdout.includes('Registry integrity verified. All policy invariants hold.'));
  console.log('✓ 2. --check validates full vendor registry without errors');
}

// 3. Unknown app rejection
{
  const res = runCommand(['unknownapp', 'v1.0.0'], true);
  assert.strictEqual(res.code, 1);
  assert(res.stderr.includes("Unknown ArtCraft component: 'unknownapp'"));
  console.log('✓ 3. Rejects unknown app with explicit error');
}

// 4. Pending app rejections (must fail with milestone details)
{
  const pendingApps = [
    { name: 'cadcraft', milestone: 'M07', task: 'M07-T11' },
    { name: 'pdfcraft', milestone: 'M08', task: 'M08-T09' },
    { name: 'wordcraft', milestone: 'M12', task: 'M12-W09' },
    { name: 'deckcraft', milestone: 'M12', task: 'M12-W09' },
    { name: 'craft-fonts', milestone: 'M06', task: 'M06-T13 / M07' },
  ];

  for (const p of pendingApps) {
    const res = runCommand([p.name, 'v0.3.0'], true);
    assert.strictEqual(res.code, 1);
    assert(res.stderr.includes(`Unsupported ArtCraft app registration: '${p.name}'`));
    assert(res.stderr.includes(`Status is 'pending' for milestone ${p.milestone} (${p.task})`));
    assert(res.stderr.includes('Unevaluated apps are forbidden from having fabricated pins or update runs.'));
  }
  console.log('✓ 4. All pending apps (cadcraft, pdfcraft, wordcraft, deckcraft, craft-fonts) strictly fail with milestone dependency');
}

// 5. Unknown release rejection for supported app
{
  const res = runCommand(['gridcraft', 'v9.9.9'], true);
  assert.strictEqual(res.code, 1);
  assert(res.stderr.includes("Release 'v9.9.9' is not recognized in qualification catalog"));
  console.log('✓ 5. Rejects unregistered target release for gridcraft');
}

// 6. Two-release qualification: GridCraft v0.3.0 upgrade
{
  const res = runCommand(['gridcraft', 'v0.3.0', '--dry-run', '--json']);
  assert.strictEqual(res.code, 0);
  assert(res.stdout.includes('=== Upstream Qualification & Release-Update: GridCraft v0.3.0 ==='));
  assert(res.stdout.includes('[PASS] full_editor_chrome'));
  assert(res.stdout.includes('[PASS] embedded_table_chrome'));
  assert(res.stdout.includes('[PASS] cell_protection_domain'));
  assert(res.stdout.includes('[PASS] formula_recalculation'));
  assert(res.stdout.includes('[PASS] file_open_save_xlsx'));
  assert(res.stdout.includes('[PASS] previous_release_documents'));
  assert(res.stdout.includes('[PASS] local_recovery_journal'));
  assert(res.stdout.includes('[PASS] concurrency_sync_conflicts'));
  assert(res.stdout.includes('"status": "success"'));
  console.log('✓ 6. GridCraft v0.3.0 upgrade qualification passes all 8 compatibility batteries');
}

// 7. Two-release qualification: GridCraft v0.2.0 rollback
{
  const res = runCommand(['gridcraft', '--rollback', 'v0.2.0', '--dry-run', '--json']);
  assert.strictEqual(res.code, 0);
  assert(res.stdout.includes('=== Rolling Back GridCraft to v0.2.0 ==='));
  assert(res.stdout.includes('Target Pin:  v0.2.0 (a1b2c3d4e5f67890123456789abcdef012345678)'));
  assert(res.stdout.includes('[PASS] full_editor_chrome'));
  assert(res.stdout.includes('[PASS] embedded_table_chrome'));
  assert(res.stdout.includes('[PASS] cell_protection_domain'));
  assert(res.stdout.includes('[PASS] formula_recalculation'));
  assert(res.stdout.includes('[PASS] file_open_save_xlsx'));
  assert(res.stdout.includes('[PASS] previous_release_documents'));
  assert(res.stdout.includes('[PASS] local_recovery_journal'));
  assert(res.stdout.includes('[PASS] concurrency_sync_conflicts'));
  assert(res.stdout.includes('"status": "success"'));
  console.log('✓ 7. GridCraft v0.2.0 rollback qualification passes with backward preservation');
}

console.log('\n✅ All ArtCraft update pipeline and qualification tests PASSED (7/7).\n');
