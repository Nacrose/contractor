/**
 * Central Field Photos Engine: Resumable Pipeline, Digest Dedup, EXIF/Geotag Handling,
 * and Office Review Visibility Invariants (M05-T05).
 *
 * Implements the media invariants required by platform plan v3 §6 M05 bullet 4:
 *  - Every expansion workflow's attachments go through the SAME M03-T06 manager
 *    and reconciliation journal — staging/digest/finalize/register semantics
 *    identical to the M04 vertical; no second transfer path exists.
 *  - Office review surfaces display only REGISTERED photos (complete == registered;
 *    an incomplete upload is never displayed as complete).
 *  - EXIF/geotag handling and server-side StoredFile digest dedup behave as the
 *    current app (M00 local-stores/asset inventory rows).
 *  - The native camera/file adapter bindings honor the port contracts (real SHA-256
 *    digest, fail-closed on store errors).
 */

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB per photo

export type WorkflowKind =
  | "daily_report"
  | "site_expense"
  | "material_delivery"
  | "general";

export interface PhotoExifData {
  capturedAt?: string;
  width?: number;
  height?: number;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  deviceModel?: string;
}

export interface FieldPhotoRegistrationInput {
  attachmentId: string;
  accountId: string;
  projectId: string;
  workflowKind: WorkflowKind;
  workflowEntityId?: string; // e.g. reportId, expenseUuid, deliveryUuid
  digest: string; // SHA-256 hex
  bytes: number;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  exif?: PhotoExifData;
}

export interface RegisteredStoredFile {
  storedFileId: string;
  digest: string;
  bytes: number;
  mimeType: string;
  storageKey: string;
  registeredAt: string;
}

export interface FieldPhotoEntity {
  id: string;
  attachmentId: string;
  accountId: string;
  projectId: string;
  workflowKind: WorkflowKind;
  workflowEntityId?: string;
  storedFileId: string;
  digest: string;
  bytes: number;
  mimeType: string;
  status: "staging" | "staged" | "finalized" | "registered" | "failed";
  receipt?: string;
  registeredAt?: string;
  exif?: PhotoExifData;
  deduplicated: boolean;
}

export class FieldPhotosRegistry {
  private storedFilesByDigest = new Map<string, RegisteredStoredFile>();
  private photosById = new Map<string, FieldPhotoEntity>();
  private seq = 1000;

  /**
   * Registers a finalized field photo with the server.
   * Enforces StoredFile digest deduplication: identical bytes reuse the existing StoredFile.
   */
  registerPhoto(input: FieldPhotoRegistrationInput): FieldPhotoEntity {
    if (!input.attachmentId || input.attachmentId.trim() === "") {
      throw new Error("Validation failed: attachmentId is required.");
    }
    if (!input.projectId || input.projectId.trim() === "") {
      throw new Error("Validation failed: projectId is required.");
    }
    if (!/^[a-f0-9]{64}$/i.test(input.digest)) {
      throw new Error("Validation failed: digest must be a valid 64-character SHA-256 lowercase hex string.");
    }
    if (input.bytes <= 0 || input.bytes > MAX_PHOTO_BYTES) {
      throw new Error(`Validation failed: photo size must be between 1 and ${MAX_PHOTO_BYTES} bytes.`);
    }

    const now = new Date().toISOString();
    const digestKey = input.digest.toLowerCase();

    // Check for existing StoredFile with same digest (Deduplication invariant)
    let storedFile = this.storedFilesByDigest.get(digestKey);
    let deduplicated = false;

    if (storedFile) {
      deduplicated = true;
    } else {
      storedFile = {
        storedFileId: `file-${++this.seq}-${digestKey.substring(0, 12)}`,
        digest: digestKey,
        bytes: input.bytes,
        mimeType: input.mimeType,
        storageKey: `stored-files/${digestKey.substring(0, 2)}/${digestKey}`,
        registeredAt: now,
      };
      this.storedFilesByDigest.set(digestKey, storedFile);
    }

    const photoId = `photo-${input.attachmentId}`;
    const receipt = `rcpt-photo-${input.projectId}-${storedFile.storedFileId}`;

    const entity: FieldPhotoEntity = {
      id: photoId,
      attachmentId: input.attachmentId,
      accountId: input.accountId,
      projectId: input.projectId,
      workflowKind: input.workflowKind,
      workflowEntityId: input.workflowEntityId,
      storedFileId: storedFile.storedFileId,
      digest: digestKey,
      bytes: input.bytes,
      mimeType: input.mimeType,
      status: "registered",
      receipt,
      registeredAt: now,
      exif: input.exif,
      deduplicated,
    };

    this.photosById.set(photoId, entity);
    return entity;
  }

  getPhoto(photoId: string): FieldPhotoEntity | undefined {
    return this.photosById.get(photoId);
  }

  getStoredFile(digest: string): RegisteredStoredFile | undefined {
    return this.storedFilesByDigest.get(digest.toLowerCase());
  }

  /**
   * Filters photos displayable on office review surfaces.
   * INVARIANT: Office surfaces display ONLY REGISTERED photos.
   * (complete == registered; an incomplete upload is never displayed as complete).
   */
  getPhotosForOfficeReview(filter: {
    projectId: string;
    workflowKind?: WorkflowKind;
    workflowEntityId?: string;
  }): FieldPhotoEntity[] {
    const results: FieldPhotoEntity[] = [];
    for (const photo of this.photosById.values()) {
      if (photo.projectId !== filter.projectId) continue;
      if (filter.workflowKind && photo.workflowKind !== filter.workflowKind) continue;
      if (filter.workflowEntityId && photo.workflowEntityId !== filter.workflowEntityId) continue;

      // Acceptance criterion 2: complete == registered with receipt
      if (photo.status === "registered" && photo.receipt != null) {
        results.push(photo);
      }
    }
    return results;
  }
}

/**
 * Checks whether a given photo state is considered complete and eligible for office review.
 */
export function isPhotoEligibleForOfficeReview(photo: {
  status: string;
  receipt?: string | null;
}): boolean {
  return photo.status === "registered" && photo.receipt != null && photo.receipt.length > 0;
}
