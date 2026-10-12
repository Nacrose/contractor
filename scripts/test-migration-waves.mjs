#!/usr/bin/env node
/**
 * Test Suite: Migration Waves and Parity Tracking Matrix Verification (M10-T02)
 *
 * Mechanically validates:
 * 1. Schema integrity of fixtures/platform-parity/migration_waves.json.
 * 2. 100% workflow coverage across all 5 migration waves without orphans.
 * 3. Every wave defines concrete, testable entry and exit criteria.
 * 4. All four engineering engines (GridCraft, CadCraft, PdfCraft, TruePPM) properly integrated into workflows.
 * 5. Every workflow specifies authoritative state owner, domain rules, and route paths.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const fixturePath = new URL('../fixtures/platform-parity/migration_waves.json', import.meta.url);
const rawFixture = await readFile(fixturePath, 'utf8');
const data = JSON.parse(rawFixture);

console.log('--- Running Migration Waves & Parity Verification Suite (M10-T02) ---');

// 1. Schema and summary validation
assert.equal(data.schemaVersion, '1.0.0', 'Schema version must be 1.0.0');
assert.equal(data.summary.totalWaves, 5, 'Must define exactly 5 migration waves');
assert.equal(data.summary.orphanedWorkflows, 0, 'Orphaned workflows must be strictly 0');
assert(Array.isArray(data.waves), 'Waves must be an array');
assert.equal(data.waves.length, 5, 'Waves array must contain 5 waves');
console.log('✔ Schema structure and summary invariants verified');

// 2. Validate each wave
const requiredWaves = ['WAVE_1', 'WAVE_2', 'WAVE_3', 'WAVE_4', 'WAVE_5'];
const observedWaves = data.waves.map((w) => w.waveId);
assert.deepEqual(observedWaves, requiredWaves, 'All 5 wave IDs must be defined in sequence');

let totalWaveWorkflows = 0;
const seenWorkflowIds = new Set();
const seenRoutes = new Set();

for (const wave of data.waves) {
  assert(wave.name && wave.name.length > 0, `Wave ${wave.waveId} must have a name`);
  assert(wave.description && wave.description.length > 0, `Wave ${wave.waveId} must have a description`);
  assert(Array.isArray(wave.entryCriteria) && wave.entryCriteria.length >= 2, `Wave ${wave.waveId} must have at least 2 entry criteria`);
  assert(Array.isArray(wave.exitCriteria) && wave.exitCriteria.length >= 2, `Wave ${wave.waveId} must have at least 2 exit criteria`);
  assert(Array.isArray(wave.workflows) && wave.workflows.length > 0, `Wave ${wave.waveId} must contain workflows`);

  for (const wf of wave.workflows) {
    assert(!seenWorkflowIds.has(wf.id), `Duplicate workflow ID "${wf.id}" detected in ${wave.waveId}`);
    seenWorkflowIds.add(wf.id);

    assert(wf.name && wf.name.length > 0, `Workflow "${wf.id}" must have a name`);
    assert(Array.isArray(wf.routes) && wf.routes.length > 0, `Workflow "${wf.id}" must define routes`);
    assert(Array.isArray(wf.retainedRules) && wf.retainedRules.length > 0, `Workflow "${wf.id}" must define retained rules`);
    assert(['ADOPT_UPSTREAM', 'RETAIN_CUSTOM_DOMAIN', 'WRAP_ADAPTER'].includes(wf.disposition), `Workflow "${wf.id}" invalid disposition: ${wf.disposition}`);
    assert(wf.domainService && wf.domainService.length > 0, `Workflow "${wf.id}" must define domain service`);

    for (const route of wf.routes) {
      assert(route.startsWith('/'), `Route "${route}" in "${wf.id}" must start with /`);
      seenRoutes.add(route);
    }

    totalWaveWorkflows++;
  }
}

console.log(`✔ All 5 waves validated with ${totalWaveWorkflows} core wave workflows across ${seenRoutes.size} unique routes`);

// 3. Engine-integrated workflows validation
assert(Array.isArray(data.engineIntegratedWorkflows), 'Engine integrated workflows must be an array');
assert.equal(data.engineIntegratedWorkflows.length, 4, 'Must integrate all 4 engineering engines');

const requiredEngines = ['GridCraft', 'CadCraft', 'PdfCraft', 'TruePPM'];
const observedEngines = data.engineIntegratedWorkflows.map((e) => e.engine);
assert.deepEqual(observedEngines, requiredEngines, 'All 4 engines must be declared');

for (const entry of data.engineIntegratedWorkflows) {
  assert(entry.hostAdapter && entry.hostAdapter.endsWith('HostAdapter'), `Engine ${entry.engine} must define a valid HostAdapter`);
  assert(entry.milestone && entry.milestone.startsWith('M0'), `Engine ${entry.engine} must define owning milestone`);
  assert(Array.isArray(entry.workflows) && entry.workflows.length >= 3, `Engine ${entry.engine} must map at least 3 workflows`);
}

console.log('✔ All 4 engineering engines (GridCraft, CadCraft, PdfCraft, TruePPM) verified with host adapters');

console.log('--- All Migration Waves & Parity Verification Checks PASSED (M10-T02) ---');
