import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PackagingVerificationEngine,
  PlatformTarget,
} from '../src/index.js';

test('PackagingVerificationEngine: verifies artifact metadata across all 5 distribution platforms', () => {
  const platforms = PackagingVerificationEngine.getAllPlatformTargets();
  assert.equal(platforms.length, 5);

  const expectedPlatforms: PlatformTarget[] = [
    'MACOS_UNIVERSAL',
    'WINDOWS_X64',
    'LINUX_X64',
    'ANDROID_AAB',
    'IOS_IPA',
  ];

  for (const plat of expectedPlatforms) {
    assert.ok(platforms.includes(plat));
    const meta = PackagingVerificationEngine.getArtifactMetadata(plat);
    assert.equal(meta.platform, plat);
    assert.equal(meta.version, '1.0.0');
    assert.ok(meta.fileName.includes('Contractor'));

    const verification = PackagingVerificationEngine.verifyArtifactIntegrity(meta);
    assert.equal(verification.isValid, true);
    assert.equal(verification.hasSignature, true);
    assert.equal(verification.meetsSizeThreshold, true);
  }
});

test('PackagingVerificationEngine: validates macOS notarization and Windows Authenticode timestamping', () => {
  const macMeta = PackagingVerificationEngine.getArtifactMetadata('MACOS_UNIVERSAL');
  assert.equal(macMeta.signatureType, 'APPLE_DEVELOPER_ID_NOTARIZED');
  assert.equal(macMeta.isNotarized, true);
  assert.equal(macMeta.timestampedByRfc3161, true);

  const winMeta = PackagingVerificationEngine.getArtifactMetadata('WINDOWS_X64');
  assert.equal(winMeta.signatureType, 'WINDOWS_AUTHENTICODE');
  assert.equal(winMeta.isNotarized, true);
  assert.equal(winMeta.timestampedByRfc3161, true);
});

test('PackagingVerificationEngine: simulates complete install, launch, upgrade, uninstall lifecycle', () => {
  const lifecycle = PackagingVerificationEngine.simulateLifecycle('MACOS_UNIVERSAL');
  assert.equal(lifecycle.length, 4);

  const phases = lifecycle.map((l) => l.phase);
  assert.deepEqual(phases, ['INSTALL', 'LAUNCH', 'UPGRADE', 'UNINSTALL']);

  for (const step of lifecycle) {
    assert.equal(step.success, true);
    assert.equal(step.exitCode, 0);
    assert.ok(step.durationMs > 0);
  }
});
