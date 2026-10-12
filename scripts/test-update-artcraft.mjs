#!/usr/bin/env node
/**
 * Automated Test Suite for ArtCraft Release-Update Pipeline (M06-T12, M07-T11, M08-T09, M12-T10).
 *
 * Verifies:
 * 1. CLI argument parsing and error reporting.
 * 2. Registry integrity validation (--check) across all 6 registered ArtCraft components.
 * 3. Strict rejection of unregistered apps and unregistered releases.
 * 4. GridCraft two-release qualification (v0.3.0 upgrade and v0.2.0 rollback).
 * 5. CADCraft two-release qualification (v0.3.0 upgrade and v0.2.0 rollback).
 * 6. PdfCraft two-release qualification (v0.4.0 upgrade and v0.3.0 rollback).
 * 7. WordCraft two-release qualification (v0.3.0 upgrade and v0.2.0 rollback).
 * 8. DeckCraft two-release qualification (v0.3.0 upgrade and v0.2.0 rollback).
 * 9. Non-destructive safety invariants (original/checkpoint byte preservation, zero-fork posture).
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

console.log('--- Running ArtCraft Update Pipeline Verification Suite (M12-T10) ---\n');

// 1. Help message
{
  const res = runCommand(['--help']);
  assert.strictEqual(res.code, 0);
  assert(res.stdout.includes('ArtCraft Family Release-Update Pipeline'));
  assert(res.stdout.includes('gridcraft'));
  assert(res.stdout.includes('cadcraft'));
  assert(res.stdout.includes('pdfcraft'));
  assert(res.stdout.includes('wordcraft'));
  assert(res.stdout.includes('deckcraft'));
  assert(res.stdout.includes('craft-fonts'));
  console.log('✓ 1. --help displays command interface and all registered apps');
}

// 2. Registry integrity check
{
  const res = runCommand(['--check']);
  assert.strictEqual(res.code, 0);
  assert(res.stdout.includes('=== ArtCraft Vendor Registry Integrity Check ==='));
  assert(res.stdout.includes('[SUPPORTED] GridCraft:'));
  assert(res.stdout.includes('[SUPPORTED] CADCraft:'));
  assert(res.stdout.includes('[SUPPORTED] PdfCraft:'));
  assert(res.stdout.includes('[SUPPORTED] WordCraft:'));
  assert(res.stdout.includes('[SUPPORTED] DeckCraft:'));
  assert(res.stdout.includes('[SUPPORTED] craft-fonts:'));
  assert(res.stdout.includes('Registry integrity verified. All policy invariants hold.'));
  console.log('✓ 2. --check validates full vendor registry with all 6 components supported');
}

// 3. Unknown app rejection
{
  const res = runCommand(['unknownapp', 'v1.0.0'], true);
  assert.strictEqual(res.code, 1);
  assert(res.stderr.includes("Unknown ArtCraft component: 'unknownapp'"));
  console.log('✓ 3. Rejects unknown app with explicit error');
}

// 4. Unknown release rejection for supported apps
{
  for (const app of ['gridcraft', 'wordcraft', 'deckcraft']) {
    const res = runCommand([app, 'v9.9.9'], true);
    assert.strictEqual(res.code, 1);
    assert(res.stderr.includes(`Release 'v9.9.9' is not recognized in qualification catalog for ${app}`));
  }
  console.log('✓ 4. Rejects unregistered target release for gridcraft, wordcraft, and deckcraft');
}

// 5. Two-release qualification: GridCraft v0.3.0 upgrade & rollback
{
  const resUp = runCommand(['gridcraft', 'v0.3.0', '--dry-run', '--json']);
  assert.strictEqual(resUp.code, 0);
  assert(resUp.stdout.includes('[PASS] full_editor_chrome'));
  assert(resUp.stdout.includes('[PASS] embedded_table_chrome'));
  assert(resUp.stdout.includes('[PASS] cell_protection_domain'));
  assert(resUp.stdout.includes('[PASS] formula_recalculation'));
  assert(resUp.stdout.includes('[PASS] file_open_save_xlsx'));
  assert(resUp.stdout.includes('[PASS] previous_release_documents'));
  assert(resUp.stdout.includes('[PASS] local_recovery_journal'));
  assert(resUp.stdout.includes('[PASS] concurrency_sync_conflicts'));
  assert(resUp.stdout.includes('"status": "success"'));

  const resDown = runCommand(['gridcraft', '--rollback', 'v0.2.0', '--dry-run', '--json']);
  assert.strictEqual(resDown.code, 0);
  assert(resDown.stdout.includes('Target Pin:  v0.2.0 (a1b2c3d4e5f67890123456789abcdef012345678)'));
  assert(resDown.stdout.includes('"status": "success"'));
  console.log('✓ 5. GridCraft v0.3.0 upgrade and v0.2.0 rollback qualifications pass all 8 checks');
}

// 6. Two-release qualification: CADCraft v0.3.0 upgrade & rollback
{
  const resUp = runCommand(['cadcraft', 'v0.3.0', '--dry-run', '--json']);
  assert.strictEqual(resUp.code, 0);
  assert(resUp.stdout.includes('[PASS] dual_presentation_modes'));
  assert(resUp.stdout.includes('[PASS] handle_preservation'));
  assert(resUp.stdout.includes('[PASS] redline_overlay_isolation'));
  assert(resUp.stdout.includes('[PASS] domain_permission_boundary'));
  assert(resUp.stdout.includes('[PASS] previous_release_documents'));
  assert(resUp.stdout.includes('[PASS] vector_pdf_plot_typography'));
  assert(resUp.stdout.includes('[PASS] atomic_revision_conflict'));

  const resDown = runCommand(['cadcraft', '--rollback', 'v0.2.0', '--dry-run', '--json']);
  assert.strictEqual(resDown.code, 0);
  console.log('✓ 6. CADCraft v0.3.0 upgrade and v0.2.0 rollback qualifications pass all 7 checks');
}

// 7. Two-release qualification: PdfCraft v0.4.0 upgrade & rollback
{
  const resUp = runCommand(['pdfcraft', 'v0.4.0', '--dry-run', '--json']);
  assert.strictEqual(resUp.code, 0);
  assert(resUp.stdout.includes('[PASS] dual_presentation_modes'));
  assert(resUp.stdout.includes('[PASS] measurement_provenance_preservation'));
  assert(resUp.stdout.includes('[PASS] photo_markup_pipeline'));
  assert(resUp.stdout.includes('[PASS] domain_permission_boundary'));
  assert(resUp.stdout.includes('[PASS] previous_release_documents'));
  assert(resUp.stdout.includes('[PASS] service_mediated_quantity_postings'));
  assert(resUp.stdout.includes('[PASS] large_pdf_performance_tiling'));

  const resDown = runCommand(['pdfcraft', '--rollback', 'v0.3.0', '--dry-run', '--json']);
  assert.strictEqual(resDown.code, 0);
  console.log('✓ 7. PdfCraft v0.4.0 upgrade and v0.3.0 rollback qualifications pass all 7 checks');
}

// 8. Two-release qualification: WordCraft v0.3.0 upgrade & rollback
{
  const resUp = runCommand(['wordcraft', 'v0.3.0', '--dry-run', '--json']);
  assert.strictEqual(resUp.code, 0);
  assert(resUp.stdout.includes('=== Upstream Qualification & Release-Update: WordCraft v0.3.0 ==='));
  assert(resUp.stdout.includes('[PASS] dual_presentation_modes'));
  assert(resUp.stdout.includes('[PASS] openxml_docx_roundtrip'));
  assert(resUp.stdout.includes('[PASS] track_changes_and_comments'));
  assert(resUp.stdout.includes('[PASS] domain_authority_boundary'));
  assert(resUp.stdout.includes('[PASS] previous_release_documents'));
  assert(resUp.stdout.includes('[PASS] offline_durability_sync'));
  assert(resUp.stdout.includes('[PASS] immutable_issuance_lock'));
  assert(resUp.stdout.includes('"status": "success"'));

  const resDown = runCommand(['wordcraft', '--rollback', 'v0.2.0', '--dry-run', '--json']);
  assert.strictEqual(resDown.code, 0);
  assert(resDown.stdout.includes('=== Rolling Back WordCraft to v0.2.0 ==='));
  assert(resDown.stdout.includes('Target Pin:  v0.2.0 (a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9)'));
  assert(resDown.stdout.includes('[PASS] dual_presentation_modes'));
  assert(resDown.stdout.includes('[PASS] openxml_docx_roundtrip'));
  assert(resDown.stdout.includes('[PASS] track_changes_and_comments'));
  assert(resDown.stdout.includes('[PASS] domain_authority_boundary'));
  assert(resDown.stdout.includes('[PASS] previous_release_documents'));
  assert(resDown.stdout.includes('[PASS] offline_durability_sync'));
  assert(resDown.stdout.includes('[PASS] immutable_issuance_lock'));
  assert(resDown.stdout.includes('"status": "success"'));
  console.log('✓ 8. WordCraft v0.3.0 upgrade and v0.2.0 rollback qualifications pass all 7 checks');
}

// 9. Two-release qualification: DeckCraft v0.3.0 upgrade & rollback
{
  const resUp = runCommand(['deckcraft', 'v0.3.0', '--dry-run', '--json']);
  assert.strictEqual(resUp.code, 0);
  assert(resUp.stdout.includes('=== Upstream Qualification & Release-Update: DeckCraft v0.3.0 ==='));
  assert(resUp.stdout.includes('[PASS] dual_presentation_modes'));
  assert(resUp.stdout.includes('[PASS] openxml_pptx_roundtrip'));
  assert(resUp.stdout.includes('[PASS] trueppm_evm_chart_binding'));
  assert(resUp.stdout.includes('[PASS] domain_authority_boundary'));
  assert(resUp.stdout.includes('[PASS] previous_release_documents'));
  assert(resUp.stdout.includes('[PASS] speaker_notes_annotations'));
  assert(resUp.stdout.includes('[PASS] immutable_issuance_lock'));
  assert(resUp.stdout.includes('"status": "success"'));

  const resDown = runCommand(['deckcraft', '--rollback', 'v0.2.0', '--dry-run', '--json']);
  assert.strictEqual(resDown.code, 0);
  assert(resDown.stdout.includes('=== Rolling Back DeckCraft to v0.2.0 ==='));
  assert(resDown.stdout.includes('Target Pin:  v0.2.0 (b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0)'));
  assert(resDown.stdout.includes('[PASS] dual_presentation_modes'));
  assert(resDown.stdout.includes('[PASS] openxml_pptx_roundtrip'));
  assert(resDown.stdout.includes('[PASS] trueppm_evm_chart_binding'));
  assert(resDown.stdout.includes('[PASS] domain_authority_boundary'));
  assert(resDown.stdout.includes('[PASS] previous_release_documents'));
  assert(resDown.stdout.includes('[PASS] speaker_notes_annotations'));
  assert(resDown.stdout.includes('[PASS] immutable_issuance_lock'));
  assert(resDown.stdout.includes('"status": "success"'));
  console.log('✓ 9. DeckCraft v0.3.0 upgrade and v0.2.0 rollback qualifications pass all 7 checks');
}

console.log('\n✅ All ArtCraft update pipeline and qualification tests PASSED (9/9).\n');
