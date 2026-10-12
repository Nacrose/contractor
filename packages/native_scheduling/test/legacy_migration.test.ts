import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LegacyCpmMigrationAdapter,
  UnsupportedCapabilityError,
} from '../src/legacy_migration.js';
import { TruePpmHostAdapter, ScheduleCycleDetectedError } from '../src/trueppm_host_adapter.js';

const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT_DIR = resolve(PKG_DIR, '../..');
const FIXTURES_DIR = join(ROOT_DIR, 'fixtures/platform-parity/cpm');

test('unsupported upstream operations fail visibly with UnsupportedCapabilityError (never silent miscalculation)', () => {
  // 1. Resource leveling
  assert.throws(
    () => LegacyCpmMigrationAdapter.assertSupportedCapability('RESOURCE_LEVELING'),
    (err: any) => {
      assert.ok(err instanceof UnsupportedCapabilityError);
      assert.equal(err.capability, 'RESOURCE_LEVELING');
      assert.match(err.message, /does not implement automated resource leveling/);
      return true;
    }
  );

  // 2. Heuristic smoothing
  assert.throws(
    () => LegacyCpmMigrationAdapter.assertSupportedCapability('HEURISTIC_SMOOTHING'),
    (err: any) => {
      assert.ok(err instanceof UnsupportedCapabilityError);
      assert.equal(err.capability, 'HEURISTIC_SMOOTHING');
      assert.match(err.message, /Heuristic schedule smoothing is unverified/);
      return true;
    }
  );

  // 3. P6 XML Exchange
  assert.throws(
    () => LegacyCpmMigrationAdapter.assertSupportedCapability('P6_XML_EXCHANGE'),
    (err: any) => {
      assert.ok(err instanceof UnsupportedCapabilityError);
      assert.equal(err.capability, 'P6_XML_EXCHANGE');
      assert.match(err.message, /P6 XML exchange is planned/);
      return true;
    }
  );

  // 4. Supported operation passes without error
  LegacyCpmMigrationAdapter.assertSupportedCapability('FORWARD_PASS');
  LegacyCpmMigrationAdapter.assertSupportedCapability('CRITICAL_PATH_CALCULATION');
});

test('migrates synthetic legacy CPM network with ID and logic fidelity', () => {
  const legacyGraph = {
    version: 1,
    description: 'Bridge Substructure Work Package',
    dataDate: '2026-11-01',
    tasks: [
      { id: 't-excavation', name: 'Pier Excavation', duration: 12, progressPercent: 50 },
      { id: 't-rebar', name: 'Rebar Tying', duration: 8, progressPercent: 0 },
      { id: 't-concrete', name: 'Concrete Pour', duration: 4, progressPercent: 0 },
    ],
    dependencies: [
      { predecessorId: 't-excavation', successorId: 't-rebar', type: 'FS', lagHours: 0 },
      { predecessorId: 't-rebar', successorId: 't-concrete', type: 'FS', lagHours: 16 }, // 2 days @ 8h/day
    ],
  };

  const result = LegacyCpmMigrationAdapter.migrateLegacyCpmGraph(legacyGraph);

  assert.equal(result.migratedTasksCount, 3);
  assert.equal(result.migratedDependenciesCount, 2);
  assert.equal(result.warnings.length, 0);

  const proj = result.project;
  assert.equal(proj.name, 'Bridge Substructure Work Package');
  assert.equal(proj.dataDate, '2026-11-01');

  // Verify task mapping
  const t1 = proj.tasks.find(t => t.taskId === 't-excavation');
  assert.ok(t1);
  assert.equal(t1.durationDays, 12);
  assert.equal(t1.progressPercent, 50);

  // Verify dependency mapping and lag conversion
  const dep2 = proj.dependencies.find(d => d.predTaskId === 't-rebar' && d.succTaskId === 't-concrete');
  assert.ok(dep2);
  assert.equal(dep2.type, 'FS');
  assert.equal(dep2.lagDays, 2); // 16h / 8h = 2 days

  // Verify host adapter accepts migrated network
  const host = new TruePpmHostAdapter(proj);
  host.validateScheduleGraph();
});

test('migrates M00 degenerate scenarios and detects cyclic loops fail-closed', () => {
  const degeneratePath = join(FIXTURES_DIR, 'cpm_degenerate_cases.json');
  if (!existsSync(degeneratePath)) {
    return; // Skip if fixture missing in test environment
  }

  const degenerateFixture = JSON.parse(readFileSync(degeneratePath, 'utf-8'));
  const cyclicScenario = degenerateFixture.scenarios.find((s: any) => s.id === 'scenario-cyclic-loop');
  assert.ok(cyclicScenario);

  const migratedResult = LegacyCpmMigrationAdapter.migrateLegacyCpmGraph(cyclicScenario);
  assert.equal(migratedResult.migratedTasksCount, 3);
  assert.equal(migratedResult.migratedDependenciesCount, 3);

  // Cyclic loop must be caught fail-closed by host adapter
  const host = new TruePpmHostAdapter(migratedResult.project);
  assert.throws(
    () => host.validateScheduleGraph(),
    (err: any) => {
      assert.ok(err instanceof ScheduleCycleDetectedError);
      assert.deepEqual(err.cyclePath, ['t1', 't2', 't3', 't1']);
      return true;
    }
  );
});

test('migrates canonical M00 scale fixture (sample_cpm_1k.json) with 1,000 tasks and 5,000 dependencies', () => {
  const fixture1kPath = join(FIXTURES_DIR, 'sample_cpm_1k.json');
  if (!existsSync(fixture1kPath)) {
    return; // Skip if large fixture missing in lightweight run
  }

  const fixture1k = JSON.parse(readFileSync(fixture1kPath, 'utf-8'));
  const startTime = Date.now();
  const migrationResult = LegacyCpmMigrationAdapter.migrateLegacyCpmGraph(fixture1k, {
    projectId: 'proj-scale-1k',
    projectName: 'High-Scale 1k CPM Network',
  });
  const elapsedMs = Date.now() - startTime;

  assert.equal(migrationResult.migratedTasksCount, 1000);
  assert.equal(migrationResult.migratedDependenciesCount, 5000);
  assert.ok(elapsedMs < 500, `Migration took ${elapsedMs}ms, expected < 500ms`);

  // Verify graph passes TruePPM pre-dispatch validation
  const host = new TruePpmHostAdapter(migrationResult.project);
  host.validateScheduleGraph();
});

test('handles broken dependencies, duplicate IDs, and invalid entries gracefully with warnings', () => {
  const malformedGraph = {
    tasks: [
      { id: 'valid-task-1', name: 'T1', duration: 5 },
      { id: 'valid-task-1', name: 'Duplicate T1', duration: 10 }, // Duplicate ID
      { id: '', name: 'Missing ID', duration: 3 }, // Empty ID
    ],
    dependencies: [
      { predecessorId: 'valid-task-1', successorId: 'non-existent-task-99', type: 'FS' }, // Unknown succ
      { predecessorId: '', successorId: 'valid-task-1', type: 'FS' }, // Empty pred
      { predecessorId: 'valid-task-1', successorId: 'valid-task-1', type: 'FS' }, // Self-loop
    ],
  };

  const result = LegacyCpmMigrationAdapter.migrateLegacyCpmGraph(malformedGraph as any);
  assert.equal(result.migratedTasksCount, 1);
  assert.equal(result.warnings.length, 4);
});
