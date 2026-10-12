/**
 * CAD Import Fidelity & Entity Identity Preservation Tests (M07-T05).
 *
 * Verifies:
 *  - 100% entity handle/ID preservation across import-edit-export cycles
 *  - Non-colliding handle seeds for newly created entities
 *  - Explicit reporting of unsupported 3D/proxy objects (no silent drops)
 *  - M00 DXF fixtures (standard_site_plan, degenerate_micro_geom, degenerate_extreme_coords, degenerate_malformed_syntax)
 *  - DWG capability inspection bridge across M00 fixtures (sample_r13, sample_r14, sample_2000)
 *  - Documented product limitation statements per Platform Plan v3 §6 M07 and ADR-0015 §7
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DxfImportPipeline,
  DwgCapabilityBridge,
  SUPPORTED_2D_ENTITY_TYPES,
  KNOWN_UNSUPPORTED_CAD_TYPES,
} from '../src/import_pipeline.js';
import { CadDocument } from '../src/cad_document.js';
import type { LineEntity } from '../src/types.js';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
let currDir = THIS_DIR;
while (!existsSync(resolve(currDir, 'fixtures')) && dirname(currDir) !== currDir) {
  currDir = dirname(currDir);
}
const ROOT_DIR = currDir;
const DXF_FIXTURES_DIR = resolve(ROOT_DIR, 'fixtures/platform-parity/cad/dxf');
const DWG_FIXTURES_DIR = resolve(ROOT_DIR, 'fixtures/platform-parity/cad/dwg');

test('import fidelity: preserves entity handles exactly across import-edit-export cycles', () => {
  const sampleDxf = [
    '0', 'SECTION',
    '2', 'HEADER',
    '9', '$ACADVER',
    '1', 'AC1015',
    '9', '$HANDSEED',
    '5', '100',
    '0', 'ENDSEC',
    '0', 'SECTION',
    '2', 'ENTITIES',
    // Entity 1: Handle 1A
    '0', 'LINE',
    '5', '1A',
    '8', 'WALLS',
    '10', '0.0', '20', '0.0', '30', '0.0',
    '11', '100.0', '21', '0.0', '31', '0.0',
    // Entity 2: Handle 1B
    '0', 'CIRCLE',
    '5', '1B',
    '8', 'COLUMNS',
    '10', '50.0', '20', '50.0', '30', '0.0',
    '40', '10.0',
    // Entity 3: Handle 1C
    '0', 'TEXT',
    '5', '1C',
    '8', 'NOTES',
    '10', '20.0', '20', '20.0',
    '40', '2.5',
    '1', 'ORIGINAL NOTE',
    '0', 'ENDSEC',
    '0', 'EOF',
  ].join('\r\n') + '\r\n';

  // 1. Initial Import
  const { doc, report } = DxfImportPipeline.importDxf(sampleDxf);
  assert.equal(report.importedEntityCount, 3);
  assert.equal(report.unsupportedEntityCount, 0);

  const line = doc.getEntity('1A');
  const circle = doc.getEntity('1B');
  const text = doc.getEntity('1C');

  assert.ok(line, 'Handle 1A must exist');
  assert.ok(circle, 'Handle 1B must exist');
  assert.ok(text, 'Handle 1C must exist');
  assert.equal(line.handle, '1A');
  assert.equal(circle.handle, '1B');
  assert.equal(text.handle, '1C');

  // 2. Edit existing entity: modify coordinates and color
  (line as LineEntity).start.y = 5.0;
  line.color = 1; // Red
  doc._updateEntity(line);

  // Original handle must remain identical after edit
  assert.equal(doc.getEntity('1A')?.handle, '1A');

  // 3. Insert newly drafted entity via document nextHandle
  const newHandle = doc.nextHandle();
  // Ensure seed prevents collision with 1A, 1B, 1C
  assert.notEqual(newHandle, '1A');
  assert.notEqual(newHandle, '1B');
  assert.notEqual(newHandle, '1C');

  doc._insertEntity({
    handle: newHandle,
    type: 'LINE',
    layer: 'NEW_LAYER',
    start: { x: 200, y: 200 },
    end: { x: 300, y: 300 },
  });

  assert.equal(doc.getAllEntities().length, 4);

  // 4. Export to DXF
  const exportedDxf = DxfImportPipeline.exportDxf(doc);

  // 5. Verify round-trip fidelity
  const fidelity = DxfImportPipeline.verifyRoundTripFidelity(sampleDxf, exportedDxf);
  assert.equal(fidelity.idPreservationRate, 1.0, '100% of original handles must be preserved');
  assert.equal(fidelity.preservedHandlesCount, 3);

  // Check exported document contents
  const reimported = DxfImportPipeline.importDxf(exportedDxf);
  assert.equal(reimported.doc.getEntity('1A')?.handle, '1A');
  assert.equal(reimported.doc.getEntity('1B')?.handle, '1B');
  assert.equal(reimported.doc.getEntity('1C')?.handle, '1C');
  assert.ok(reimported.doc.getEntity(newHandle));
});

test('unsupported objects: explicitly detects, reports, and preserves unknown 3D/proxy objects without silent drops', () => {
  const dxfWithUnsupported = [
    '0', 'SECTION',
    '2', 'HEADER',
    '9', '$ACADVER',
    '1', 'AC1015',
    '0', 'ENDSEC',
    '0', 'SECTION',
    '2', 'ENTITIES',
    // Supported 2D Line
    '0', 'LINE',
    '5', 'A1',
    '8', 'WALLS',
    '10', '0.0', '20', '0.0',
    '11', '50.0', '21', '0.0',
    // Unsupported 3DFACE
    '0', '3DFACE',
    '5', 'U1',
    '8', 'SURFACE_3D',
    '10', '0', '20', '0', '30', '10',
    '11', '10', '21', '0', '31', '10',
    '12', '10', '22', '10', '32', '10',
    '13', '0', '23', '10', '33', '10',
    // Unsupported ACAD_PROXY_ENTITY
    '0', 'ACAD_PROXY_ENTITY',
    '5', 'U2',
    '8', 'PROXY_LAYER',
    '90', '499',
    '310', 'DEADBEEF',
    // Supported 2D Circle
    '0', 'CIRCLE',
    '5', 'A2',
    '8', 'COLUMNS',
    '10', '25.0', '20', '25.0',
    '40', '5.0',
    // Unsupported 3DSOLID
    '0', '3DSOLID',
    '5', 'U3',
    '8', 'SOLIDS',
    '1', 'ACIS Binary SAT blob',
    '0', 'ENDSEC',
    '0', 'EOF',
  ].join('\r\n') + '\r\n';

  const { doc, report } = DxfImportPipeline.importDxf(dxfWithUnsupported);

  // Supported entities must parse cleanly
  assert.equal(report.importedEntityCount, 2);
  assert.ok(doc.getEntity('A1'));
  assert.ok(doc.getEntity('A2'));

  // Unsupported objects must NOT be silently dropped!
  assert.equal(report.unsupportedEntityCount, 3);
  assert.equal(report.unsupportedObjects.length, 3);
  assert.equal(doc.unsupportedObjects.length, 3);

  const uTypes = report.unsupportedObjects.map((u) => u.type);
  assert.deepEqual(uTypes, ['3DFACE', 'ACAD_PROXY_ENTITY', '3DSOLID']);

  const uHandles = report.unsupportedObjects.map((u) => u.handle);
  assert.deepEqual(uHandles, ['U1', 'U2', 'U3']);

  for (const u of report.unsupportedObjects) {
    assert.ok(u.reason.includes('Unsupported entity type'));
    assert.ok(u.lineNumber && u.lineNumber > 0);
  }
});

test('M00 DXF fixtures: parses standard site plan and degenerate fixtures with 100% handle fidelity', () => {
  // 1. Standard Site Plan
  const standardPath = resolve(DXF_FIXTURES_DIR, 'standard_site_plan.dxf');
  const standardContent = readFileSync(standardPath, 'utf8');

  const { doc: stdDoc, report: stdReport } = DxfImportPipeline.importDxf(standardContent);
  assert.ok(stdReport.importedEntityCount > 0, 'Standard site plan entities must be imported');
  assert.equal(stdReport.unsupportedEntityCount, 0);
  assert.equal(stdDoc.getLayers().length >= 4, true);

  // Round-trip export
  const exportedStd = DxfImportPipeline.exportDxf(stdDoc);
  const stdFidelity = DxfImportPipeline.verifyRoundTripFidelity(standardContent, exportedStd);
  assert.equal(stdFidelity.idPreservationRate, 1.0, 'All entity handles in standard plan must be preserved');
  assert.equal(stdFidelity.isFidelityPreserved, true);

  // 2. Degenerate Micro Geometry
  const microPath = resolve(DXF_FIXTURES_DIR, 'degenerate_micro_geom.dxf');
  const microContent = readFileSync(microPath, 'utf8');
  const { doc: microDoc, report: microReport } = DxfImportPipeline.importDxf(microContent);
  assert.ok(microReport.importedEntityCount >= 4);

  // 3. Degenerate Extreme UTM Coordinates (>85,000,000m)
  const extremePath = resolve(DXF_FIXTURES_DIR, 'degenerate_extreme_coords.dxf');
  const extremeContent = readFileSync(extremePath, 'utf8');
  const { doc: extDoc, report: extReport } = DxfImportPipeline.importDxf(extremeContent);
  assert.ok(extReport.importedEntityCount >= 2);
  const extLine = extDoc.getAllEntities().find((e) => e.type === 'LINE') as LineEntity;
  assert.ok(extLine);
  assert.ok(extLine.start.x > 85000000);

  // 4. Degenerate Malformed Syntax (recovers clean entities while capturing unsupported proxy)
  const malformedPath = resolve(DXF_FIXTURES_DIR, 'degenerate_malformed_syntax.dxf');
  const malformedContent = readFileSync(malformedPath, 'utf8');
  const { doc: malDoc, report: malReport } = DxfImportPipeline.importDxf(malformedContent);
  assert.equal(malReport.importedEntityCount, 2); // Recovered LINE and CIRCLE
  assert.equal(malReport.unsupportedEntityCount, 1); // Captured UNSUPPORTED_CUSTOM_PROXY
  assert.equal(malReport.unsupportedObjects[0].type, 'UNSUPPORTED_CUSTOM_PROXY');
});

test('DWG capability statement & header inspection: distinguishes in-process acadrust from LibreDWG fallback', () => {
  // 1. Sample R13 DWG
  const r13Path = resolve(DWG_FIXTURES_DIR, 'sample_r13.dwg');
  const r13Buf = new Uint8Array(readFileSync(r13Path));
  const r13Info = DwgCapabilityBridge.inspectDwgHeader(r13Buf);

  assert.equal(r13Info.versionCode, 'AC1012');
  assert.equal(r13Info.tier, 'TIER_2_SUBPROCESS_FALLBACK');
  assert.equal(r13Info.supportedRead, true);
  assert.equal(r13Info.supportedWrite, false, 'R13 writing is prohibited in-process');
  assert.equal(r13Info.engine, 'libredwg_subprocess');
  assert.equal(r13Info.license, 'GPL-3.0-or-later');
  assert.ok(r13Info.productLimitation?.includes('Legacy uncompressed R13 format'));

  // 2. Sample R14 DWG
  const r14Path = resolve(DWG_FIXTURES_DIR, 'sample_r14.dwg');
  const r14Buf = new Uint8Array(readFileSync(r14Path));
  const r14Info = DwgCapabilityBridge.inspectDwgHeader(r14Buf);

  assert.equal(r14Info.versionCode, 'AC1014');
  assert.equal(r14Info.tier, 'TIER_2_SUBPROCESS_FALLBACK');
  assert.equal(r14Info.supportedRead, true);
  assert.equal(r14Info.supportedWrite, false);
  assert.equal(r14Info.engine, 'libredwg_subprocess');

  // 3. Sample 2000 DWG (AC1015)
  const r2000Path = resolve(DWG_FIXTURES_DIR, 'sample_2000.dwg');
  const r2000Buf = new Uint8Array(readFileSync(r2000Path));
  const r2000Info = DwgCapabilityBridge.inspectDwgHeader(r2000Buf);

  assert.equal(r2000Info.versionCode, 'AC1015');
  assert.equal(r2000Info.tier, 'TIER_1_IN_PROCESS');
  assert.equal(r2000Info.supportedRead, true);
  assert.equal(r2000Info.supportedWrite, true, 'AC1015 supports in-process write');
  assert.equal(r2000Info.engine, 'acadrust');
  assert.equal(r2000Info.license, 'MPL-2.0');

  // 4. Modern DWG versions check (AC1018 to AC1032)
  for (const v of ['AC1018', 'AC1021', 'AC1024', 'AC1027', 'AC1032']) {
    const fakeBuf = new TextEncoder().encode(v);
    const info = DwgCapabilityBridge.inspectDwgHeader(fakeBuf);
    assert.equal(info.tier, 'TIER_1_IN_PROCESS');
    assert.equal(info.supportedRead, true);
    assert.equal(info.supportedWrite, true);
    assert.equal(info.engine, 'acadrust');
    assert.equal(info.license, 'MPL-2.0');
  }

  // 5. Corrupt / invalid magic
  const corruptBuf = new TextEncoder().encode('BADMAGIC');
  const corruptInfo = DwgCapabilityBridge.inspectDwgHeader(corruptBuf);
  assert.equal(corruptInfo.tier, 'UNSUPPORTED');
  assert.equal(corruptInfo.supportedRead, false);

  // 6. Capability Statement Document
  const statement = DwgCapabilityBridge.getDwgProductLimitationStatement();
  assert.ok(statement.includes('DXF-first architecture remains the primary in-process interchange format'));
  assert.ok(statement.includes('acadrust (MPL-2.0)'));
  assert.ok(statement.includes('LibreDWG subprocess (GPL-3.0)'));
  assert.ok(statement.includes('Complex 3D Solids'));
  assert.ok(statement.includes('Identity Preservation: Entity handles (group code 5) are 100% preserved'));
  assert.ok(statement.includes('Command Neutrality: Standard drafting aliases (L, C, PL, E, U)'));
});
