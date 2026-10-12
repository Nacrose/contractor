import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CAD_VERSION_COMPATIBILITY_MATRIX,
  CadCompatibilityEngine,
  SERVER_CONVERSION_CONTRACT,
  SUPPORTED_ENTITIES_LIST,
  UNSUPPORTED_ENTITIES_LIST,
} from '../src/index.js';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
let currDir = THIS_DIR;
while (!existsSync(resolve(currDir, 'fixtures')) && dirname(currDir) !== currDir) {
  currDir = dirname(currDir);
}
const REPO_ROOT = currDir;

// ---------------------------------------------------------------------------
// 1. Matrix Catalog Completeness Across DXF and DWG Versions
// ---------------------------------------------------------------------------

test('compatibility matrix: catalog covers all AutoCAD versions from R12 to 2024+', () => {
  const dxfVersions = CAD_VERSION_COMPATIBILITY_MATRIX.filter((e) => e.format === 'DXF').map(
    (e) => e.versionCode
  );
  const dwgVersions = CAD_VERSION_COMPATIBILITY_MATRIX.filter((e) => e.format === 'DWG').map(
    (e) => e.versionCode
  );

  const requiredVersions = [
    'AC1009',
    'AC1012',
    'AC1014',
    'AC1015',
    'AC1018',
    'AC1021',
    'AC1024',
    'AC1027',
    'AC1032',
  ];

  for (const v of requiredVersions) {
    assert.ok(dxfVersions.includes(v), `Missing DXF version ${v}`);
    assert.ok(dwgVersions.includes(v), `Missing DWG version ${v}`);
  }

  // All DXF versions are in-process read/write
  for (const entry of CAD_VERSION_COMPATIBILITY_MATRIX.filter((e) => e.format === 'DXF')) {
    assert.equal(entry.tier, 'TIER_1_IN_PROCESS');
    assert.equal(entry.supportedRead, true);
    assert.equal(entry.supportedWrite, true);
  }
});

// ---------------------------------------------------------------------------
// 2. Fixture Links & Entity Coverage
// ---------------------------------------------------------------------------

test('compatibility matrix: fixture links point to committed fixtures and entity coverage is explicit', () => {
  // Test fixture links existence
  const entriesWithFixtures = CAD_VERSION_COMPATIBILITY_MATRIX.filter((e) => e.fixtureLink);
  assert.ok(entriesWithFixtures.length >= 4);

  for (const entry of entriesWithFixtures) {
    const fixturePath = resolve(REPO_ROOT, entry.fixtureLink!);
    assert.ok(existsSync(fixturePath), `Fixture path not found: ${fixturePath}`);
  }

  // Verify entity list completeness
  assert.ok(SUPPORTED_ENTITIES_LIST.includes('LINE'));
  assert.ok(SUPPORTED_ENTITIES_LIST.includes('CIRCLE'));
  assert.ok(SUPPORTED_ENTITIES_LIST.includes('ARC'));
  assert.ok(SUPPORTED_ENTITIES_LIST.includes('LWPOLYLINE'));
  assert.ok(SUPPORTED_ENTITIES_LIST.includes('DIMENSION'));
  assert.ok(SUPPORTED_ENTITIES_LIST.includes('HATCH'));
  assert.ok(SUPPORTED_ENTITIES_LIST.includes('TEXT'));

  assert.ok(UNSUPPORTED_ENTITIES_LIST.includes('3DFACE'));
  assert.ok(UNSUPPORTED_ENTITIES_LIST.includes('3DSOLID'));
  assert.ok(UNSUPPORTED_ENTITIES_LIST.includes('ACAD_PROXY_ENTITY'));
  assert.ok(UNSUPPORTED_ENTITIES_LIST.includes('BODY'));
  assert.ok(UNSUPPORTED_ENTITIES_LIST.includes('REGION'));
});

// ---------------------------------------------------------------------------
// 3. Server Conversion Specification & Isolation
// ---------------------------------------------------------------------------

test('compatibility matrix: server conversion contract defines trigger, budget, and failure behavior', () => {
  assert.equal(SERVER_CONVERSION_CONTRACT.required, true);
  assert.ok(SERVER_CONVERSION_CONTRACT.latencyBudgetMs <= 250);
  assert.ok(SERVER_CONVERSION_CONTRACT.memoryBudgetMb <= 128);
  assert.ok(SERVER_CONVERSION_CONTRACT.license.includes('GPL-3.0'));
  assert.ok(SERVER_CONVERSION_CONTRACT.isolatedBoundary.toLowerCase().includes('standalone'));

  // Legacy DWG R12, R13, R14 mandate server conversion
  const r13 = CadCompatibilityEngine.getEntry('DWG', 'AC1012');
  assert.ok(r13);
  assert.equal(r13.tier, 'TIER_2_SUBPROCESS_FALLBACK');
  assert.equal(r13.supportedRead, true);
  assert.equal(r13.supportedWrite, false); // Direct write prohibited
  assert.ok(r13.conversionRequirement);
});

// ---------------------------------------------------------------------------
// 4. Compatibility Evaluation & Parity Claims Check
// ---------------------------------------------------------------------------

test('compatibility matrix: engine evaluates platforms, detects unsupported entities, and disclaims parity', () => {
  // Desktop reading modern DWG AC1015
  const modernRes = CadCompatibilityEngine.evaluateCompatibility('DWG', 'AC1015', 'desktop', 'read');
  assert.equal(modernRes.isSupported, true);
  assert.equal(modernRes.executionMode, 'in_process');

  // Web reading DWG AC1015 routes to server conversion
  const webRes = CadCompatibilityEngine.evaluateCompatibility('DWG', 'AC1015', 'web', 'read');
  assert.equal(webRes.isSupported, true);
  assert.equal(webRes.executionMode, 'server_conversion');

  // Writing legacy DWG AC1014 is prohibited
  const legacyWriteRes = CadCompatibilityEngine.evaluateCompatibility('DWG', 'AC1014', 'desktop', 'write');
  assert.equal(legacyWriteRes.isSupported, false);
  assert.ok(legacyWriteRes.warnings.length > 0);

  // Payload with proxy entities generates non-destructive warnings
  const proxyCheck = CadCompatibilityEngine.evaluateCompatibility(
    'DXF',
    'AC1015',
    'desktop',
    'read',
    ['LINE', 'ACAD_PROXY_ENTITY', '3DSOLID']
  );
  assert.equal(proxyCheck.isSupported, true);
  assert.deepEqual(proxyCheck.unsupportedEntitiesPresent, ['ACAD_PROXY_ENTITY', '3DSOLID']);
  assert.ok(proxyCheck.warnings.length > 0);

  // Parity statement explicitly rules out unmeasured AutoCAD parity claims
  assert.ok(proxyCheck.parityStatement.includes('No full AutoCAD-parity claims are asserted'));

  // Markdown table generator produces valid table output
  const markdown = CadCompatibilityEngine.generateMarkdownMatrix();
  assert.ok(markdown.includes('| Format | Version |'));
  assert.ok(markdown.includes('AC1032'));
});
