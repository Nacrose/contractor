import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VaultBackupEngine,
  UnverifiedVaultBackupError,
  BackupIntegrityCorruptionError,
  TenantIsolationViolationError,
  ReferentialIntegrityViolationError,
} from '../src/index.js';

test('VaultBackupEngine: creates backup bundle and restores cleanly into isolated environment', () => {
  const tenantId = 'org-himalayan-hydropower';

  const entities = [
    {
      id: 'proj-tamu-dam',
      table: 'projects',
      payload: { name: 'Tamu Dam 45MW', district: 'Lamjung', code: 'PRJ-TAMU-01' },
    },
    {
      id: 'boq-headrace-tunnel',
      table: 'boq_items',
      payload: { projectId: 'proj-tamu-dam', itemCode: '1.01', description: 'Underground Tunnel Excavation', qty: 15400 },
    },
    {
      id: 'doc-takeoff-dwg-01',
      table: 'takeoff_sheets',
      payload: { projectId: 'proj-tamu-dam', attachmentId: 'att-blueprint-pdf', scale: '1:100' },
    },
  ];

  const attachments = [
    {
      attachmentId: 'att-blueprint-pdf',
      fileName: 'headrace_tunnel_cross_section.pdf',
      mimeType: 'application/pdf',
      contentBase64: Buffer.from('%PDF-1.4 Mock Blueprint Content for Tamu Dam Headrace Tunnel').toString('base64'),
    },
    {
      attachmentId: 'att-site-photo-01',
      fileName: 'intake_portal_geology.jpg',
      mimeType: 'image/jpeg',
      contentBase64: Buffer.from('Mock JPEG geological photo bytes').toString('base64'),
    },
  ];

  const bundle = VaultBackupEngine.createBackup(
    tenantId,
    entities,
    attachments,
    's3-vault-isolated-eu-central-1',
    true // Offsite vault verified
  );

  assert.equal(bundle.tenantId, tenantId);
  assert.equal(bundle.databaseEntities.length, 3);
  assert.equal(bundle.objectAttachments.length, 2);
  assert.ok(bundle.bundleDigest.length === 64);
  assert.equal(bundle.independentVaultProof.verifiedByVault, true);

  // Execute isolated restore drill
  const restoreResult = VaultBackupEngine.restoreIntoIsolatedEnvironment(
    bundle,
    'env-isolated-staging-drill-01',
    tenantId
  );

  assert.equal(restoreResult.targetEnvironment, 'env-isolated-staging-drill-01');
  assert.equal(restoreResult.tenantId, tenantId);
  assert.equal(restoreResult.entitiesRestored, 3);
  assert.equal(restoreResult.attachmentsRestored, 2);
  assert.ok(restoreResult.totalBytesRestored > 0);
  assert.equal(restoreResult.referentialIntegrityVerified, true);
  assert.equal(restoreResult.tenantIsolationVerified, true);
});

test('VaultBackupEngine: rejects unverified cloud-only record fail-closed', () => {
  const tenantId = 'org-ktm-infra';

  const bundle = VaultBackupEngine.createBackup(
    tenantId,
    [{ id: 'p1', table: 'projects', payload: { name: 'Ring Road Exp' } }],
    [],
    's3-local-bucket',
    false // NOT verified offsite (cloud-accepted record != independent backup)
  );

  assert.throws(
    () => {
      VaultBackupEngine.restoreIntoIsolatedEnvironment(bundle, 'env-isolated-test', tenantId);
    },
    UnverifiedVaultBackupError
  );
});

test('VaultBackupEngine: enforces strict tenant isolation against cross-tenant data leakage', () => {
  const primaryTenant = 'org-ktm-infra';
  const rogueTenant = 'org-foreign-adversary';

  // Attempt 1: Target tenant mismatch
  const bundle = VaultBackupEngine.createBackup(
    rogueTenant,
    [{ id: 'p-foreign', table: 'projects', payload: { name: 'Foreign Project' } }],
    [],
    'vault-loc',
    true
  );

  assert.throws(
    () => {
      VaultBackupEngine.restoreIntoIsolatedEnvironment(bundle, 'env-isolated-test', primaryTenant);
    },
    TenantIsolationViolationError
  );
});

test('VaultBackupEngine: detects and rejects missing attachments with referential integrity violation', () => {
  const tenantId = 'org-nepal-rail';

  // Entity references 'att-missing-blob', which is NOT in attachments
  const entities = [
    {
      id: 'sheet-01',
      table: 'takeoff_sheets',
      payload: { projectId: 'p-rail', attachmentId: 'att-missing-blob' },
    },
  ];

  const bundle = VaultBackupEngine.createBackup(tenantId, entities, [], 'vault-loc', true);

  assert.throws(
    () => {
      VaultBackupEngine.restoreIntoIsolatedEnvironment(bundle, 'env-isolated-test', tenantId);
    },
    ReferentialIntegrityViolationError
  );
});

test('VaultBackupEngine: detects tamper-evident corruption fail-closed', () => {
  const tenantId = 'org-hydro';

  const entities = [{ id: 'p1', table: 'projects', payload: { name: 'Original Name' } }];
  const bundle = VaultBackupEngine.createBackup(tenantId, entities, [], 'vault-loc', true);

  // Tamper with entity payload
  const tamperedBundle = {
    ...bundle,
    databaseEntities: [
      {
        ...bundle.databaseEntities[0],
        payload: { name: 'TAMPERED NAME' }, // checksum will no longer match
      },
    ],
  };

  assert.throws(
    () => {
      VaultBackupEngine.restoreIntoIsolatedEnvironment(tamperedBundle, 'env-isolated-test', tenantId);
    },
    BackupIntegrityCorruptionError
  );
});
