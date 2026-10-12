import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SignedUpdateVerificationEngine,
  StagedRolloutRingController,
  UpdateRollbackRecoveryEngine,
  UpdateManifest,
  TamperedUpdatePayloadError,
  InvalidUpdateSignatureError,
  IncompatibleUpdateSchemaError,
} from '../src/index.js';

test('SignedUpdateVerificationEngine: verifies valid signed update package and validates schema', () => {
  const trustedRootKey = 'PUB-KEY-CONTRACTOR-RELEASE-2026';
  const payload = 'Contractor Binary v1.1.0 Universal Package Content';
  const sha256Digest = SignedUpdateVerificationEngine.computeSha256(payload);
  const publisherSignature = SignedUpdateVerificationEngine.computeSha256(`${trustedRootKey}:${sha256Digest}`);

  const manifest: UpdateManifest = {
    version: '1.1.0',
    minimumSupportedVersion: '1.0.0',
    targetSchemaVersion: 6,
    downloadUrl: 'https://releases.contractor.com/v1.1.0/Contractor-universal.dmg',
    sha256Digest,
    publisherSignature,
    rolloutRing: 'GA_100',
  };

  const currentLocalSchemaVersion = 5;
  const result = SignedUpdateVerificationEngine.verifyUpdatePackage(
    manifest,
    payload,
    trustedRootKey,
    currentLocalSchemaVersion
  );

  assert.equal(result.isVerified, true);
  assert.equal(result.signatureValid, true);
  assert.equal(result.schemaCompatible, true);
});

test('SignedUpdateVerificationEngine: detects tampered update payload fail-closed', () => {
  const trustedRootKey = 'PUB-KEY-CONTRACTOR-RELEASE-2026';
  const payload = 'Original Legitimate Package Bytes';
  const tamperedPayload = 'MALICIOUS INJECTED BYTES';
  const sha256Digest = SignedUpdateVerificationEngine.computeSha256(payload);
  const publisherSignature = SignedUpdateVerificationEngine.computeSha256(`${trustedRootKey}:${sha256Digest}`);

  const manifest: UpdateManifest = {
    version: '1.1.0',
    minimumSupportedVersion: '1.0.0',
    targetSchemaVersion: 6,
    downloadUrl: 'https://releases.contractor.com/v1.1.0/pkg',
    sha256Digest,
    publisherSignature,
    rolloutRing: 'GA_100',
  };

  assert.throws(
    () => {
      SignedUpdateVerificationEngine.verifyUpdatePackage(manifest, tamperedPayload, trustedRootKey, 5);
    },
    TamperedUpdatePayloadError
  );
});

test('SignedUpdateVerificationEngine: detects invalid signature and blocks schema downgrade', () => {
  const trustedRootKey = 'PUB-KEY-CONTRACTOR-RELEASE-2026';
  const payload = 'Package Bytes';
  const sha256Digest = SignedUpdateVerificationEngine.computeSha256(payload);

  // 1. Invalid signature
  const manifestBadSig: UpdateManifest = {
    version: '1.1.0',
    minimumSupportedVersion: '1.0.0',
    targetSchemaVersion: 6,
    downloadUrl: 'https://releases.contractor.com/v1.1.0/pkg',
    sha256Digest,
    publisherSignature: 'FORGED_INVALID_SIGNATURE',
    rolloutRing: 'GA_100',
  };

  assert.throws(
    () => {
      SignedUpdateVerificationEngine.verifyUpdatePackage(manifestBadSig, payload, trustedRootKey, 5);
    },
    InvalidUpdateSignatureError
  );

  // 2. Schema downgrade attempt (target schema 4 < current local schema 5)
  const validSig = SignedUpdateVerificationEngine.computeSha256(`${trustedRootKey}:${sha256Digest}`);
  const manifestDowngrade: UpdateManifest = {
    version: '1.0.5',
    minimumSupportedVersion: '1.0.0',
    targetSchemaVersion: 4,
    downloadUrl: 'https://releases.contractor.com/v1.0.5/pkg',
    sha256Digest,
    publisherSignature: validSig,
    rolloutRing: 'GA_100',
  };

  assert.throws(
    () => {
      SignedUpdateVerificationEngine.verifyUpdatePackage(manifestDowngrade, payload, trustedRootKey, 5);
    },
    IncompatibleUpdateSchemaError
  );
});

test('StagedRolloutRingController: enforces deterministic ring eligibility thresholds', () => {
  const version = '1.1.0';

  // GA 100% ring: all devices must be eligible
  for (let i = 0; i < 20; i++) {
    const isEligible = StagedRolloutRingController.isDeviceEligible(`dev-${i}`, version, 'GA_100');
    assert.equal(isEligible, true);
  }

  // Canary 5% ring: across 100 devices, approximately ~5 should be eligible
  let canaryCount = 0;
  for (let i = 0; i < 100; i++) {
    if (StagedRolloutRingController.isDeviceEligible(`dev-${i}`, version, 'INTERNAL_CANARY_5')) {
      canaryCount++;
    }
  }
  assert.ok(canaryCount > 0 && canaryCount < 20);
});

test('UpdateRollbackRecoveryEngine: preserves local un-synced outbox mutations upon failed update', () => {
  const pendingOutbox = [
    { id: 'mut-01', action: 'CREATE_DAILY_LOG' },
    { id: 'mut-02', action: 'SUBMIT_TAKEOFF_MEASUREMENT' },
    { id: 'mut-03', action: 'APPROVE_MUSTER_ROLL' },
  ];

  const result = UpdateRollbackRecoveryEngine.executeFailedUpdateRollback(
    pendingOutbox,
    5, // pre-update schema v5
    6  // failed target schema v6
  );

  assert.equal(result.originalBinaryRestored, true);
  assert.equal(result.localSchemaIntact, true);
  assert.equal(result.outboxMutationsPreserved, 3);
  assert.equal(result.safeToResumeOfflineOperations, true);
});
