import test from "node:test";
import assert from "node:assert/strict";
import {
  FieldPhotosRegistry,
  isPhotoEligibleForOfficeReview,
  MAX_PHOTO_BYTES,
  type FieldPhotoRegistrationInput,
} from "../src/field_photos.js";

const sampleDigest = "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0";

const samplePhotoInput: FieldPhotoRegistrationInput = {
  attachmentId: "att-rec-001",
  accountId: "acct-1",
  projectId: "proj-alpha",
  workflowKind: "material_delivery",
  workflowEntityId: "del-client-1234",
  digest: sampleDigest,
  bytes: 1024 * 512, // 512 KB
  mimeType: "image/jpeg",
  exif: {
    capturedAt: "2026-10-12T08:15:00.000Z",
    width: 1920,
    height: 1080,
    latitude: 27.7172,
    longitude: 85.3240,
    altitude: 1400.5,
    deviceModel: "iPhone 15 Pro",
  },
};

test("field photo registration: registers photo with durable receipt and preserves EXIF geotag metadata", () => {
  const registry = new FieldPhotosRegistry();
  const photo = registry.registerPhoto(samplePhotoInput);

  assert.equal(photo.status, "registered");
  assert.equal(photo.deduplicated, false);
  assert.ok(photo.receipt?.startsWith("rcpt-photo-proj-alpha-"));
  assert.ok(photo.storedFileId.startsWith("file-"));
  assert.equal(photo.exif?.latitude, 27.7172);
  assert.equal(photo.exif?.longitude, 85.3240);
  assert.equal(photo.exif?.deviceModel, "iPhone 15 Pro");
});

test("server-side StoredFile digest dedup: duplicate byte digests reuse the existing storedFileId", () => {
  const registry = new FieldPhotosRegistry();

  // First photo upload
  const photo1 = registry.registerPhoto(samplePhotoInput);

  // Second photo upload from another device or workflow with identical content
  const photo2 = registry.registerPhoto({
    ...samplePhotoInput,
    attachmentId: "att-rec-002",
    workflowKind: "site_expense",
    workflowEntityId: "exp-client-5678",
  });

  assert.equal(photo1.storedFileId, photo2.storedFileId);
  assert.equal(photo1.deduplicated, false);
  assert.equal(photo2.deduplicated, true);
  assert.ok(photo1.id !== photo2.id);
});

test("office review visibility gate: incomplete or failed uploads are never displayed on office surfaces", () => {
  const registry = new FieldPhotosRegistry();
  registry.registerPhoto(samplePhotoInput);

  // In-progress or staging states cannot be displayed
  assert.equal(isPhotoEligibleForOfficeReview({ status: "staging", receipt: null }), false);
  assert.equal(isPhotoEligibleForOfficeReview({ status: "staged", receipt: null }), false);
  assert.equal(isPhotoEligibleForOfficeReview({ status: "finalized", receipt: null }), false);
  assert.equal(isPhotoEligibleForOfficeReview({ status: "failed", receipt: null }), false);
  assert.equal(isPhotoEligibleForOfficeReview({ status: "registered", receipt: null }), false);
  assert.equal(isPhotoEligibleForOfficeReview({ status: "registered", receipt: "rcpt-1" }), true);

  // Filter returns only the registered photo
  const officePhotos = registry.getPhotosForOfficeReview({
    projectId: "proj-alpha",
    workflowKind: "material_delivery",
  });
  assert.equal(officePhotos.length, 1);
  assert.equal(officePhotos[0].attachmentId, "att-rec-001");
});

test("validation: invalid SHA-256 digest or exceeding byte quota (>10MB) rejects fail-closed", () => {
  const registry = new FieldPhotosRegistry();

  assert.throws(
    () => {
      registry.registerPhoto({
        ...samplePhotoInput,
        digest: "invalid-short-digest",
      });
    },
    /digest must be a valid 64-character SHA-256/,
  );

  assert.throws(
    () => {
      registry.registerPhoto({
        ...samplePhotoInput,
        bytes: MAX_PHOTO_BYTES + 1,
      });
    },
    /photo size must be between 1 and/,
  );
});
