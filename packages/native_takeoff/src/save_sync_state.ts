/**
 * Shared Save/Sync Status Model for Takeoff Engine (M08-T06).
 *
 * Implements the shared M02-T05 save/sync state contract, making review states
 * (from recalibration or revision invalidation) first-class and visible.
 *
 * Acceptance invariant:
 * "Review state is visible in the shared save/sync model (M02-T05) and clears only through the domain path."
 */

export type LocalPersistenceState =
  | 'not_started'
  | 'saving'
  | 'saved'
  | 'failed';

export type ServerAcceptanceState =
  | 'not_queued'
  | 'queued'
  | 'sending'
  | 'accepted'
  | 'retryable_failure'
  | 'rejected';

export type AttachmentCompletionState =
  | 'not_required'
  | 'queued'
  | 'uploading'
  | 'complete'
  | 'retryable_failure'
  | 'rejected';

export type BackupState =
  | 'not_configured'
  | 'pending'
  | 'current'
  | 'stale'
  | 'failed';

export type NextUserAction =
  | 'none'
  | 'retry_sync'
  | 'review_server_rejection'
  | 'retry_attachments'
  | 'check_backup'
  | 'retry_local_save';

export interface SaveSyncState {
  localPersistence: LocalPersistenceState;
  serverAcceptance: ServerAcceptanceState;
  attachmentCompletion: AttachmentCompletionState;
  backup: BackupState;
  pendingWorkRetained: boolean;
  nextUserAction: NextUserAction;
}

export function createInitialSaveSyncState(): SaveSyncState {
  return {
    localPersistence: 'saved',
    serverAcceptance: 'accepted',
    attachmentCompletion: 'not_required',
    backup: 'current',
    pendingWorkRetained: false,
    nextUserAction: 'none'
  };
}

export class TakeoffSaveSyncTracker {
  private state: SaveSyncState;
  private pendingReviewCount = 0;

  constructor(initialState?: SaveSyncState) {
    this.state = initialState ?? createInitialSaveSyncState();
  }

  getState(): Readonly<SaveSyncState> {
    return { ...this.state };
  }

  getPendingReviewCount(): number {
    return this.pendingReviewCount;
  }

  /**
   * Called when measurements or downstream quantities require review.
   * Flips save/sync status into a review-blocking state per M02-T05.
   */
  notifyReviewRequired(count: number): void {
    this.pendingReviewCount = Math.max(0, count);
    if (this.pendingReviewCount > 0) {
      this.state.pendingWorkRetained = true;
      this.state.serverAcceptance = 'rejected';
      this.state.nextUserAction = 'review_server_rejection';
    } else {
      this.state.pendingWorkRetained = false;
      this.state.serverAcceptance = 'accepted';
      this.state.nextUserAction = 'none';
    }
  }

  /**
   * Called exclusively by the domain review path when review items are resolved.
   */
  resolveReview(resolvedCount = 1): void {
    this.pendingReviewCount = Math.max(0, this.pendingReviewCount - resolvedCount);
    if (this.pendingReviewCount === 0) {
      this.state.pendingWorkRetained = false;
      this.state.serverAcceptance = 'accepted';
      this.state.nextUserAction = 'none';
    }
  }

  /**
   * ARCHITECTURAL ENFORCEMENT:
   * Direct UI clearing of review state without going through domain path is rejected.
   */
  directClearReviewState(): never {
    throw new Error(
      'Review state cannot be cleared directly by UI; it clears only through the domain review resolution path (M08-T06).'
    );
  }
}
