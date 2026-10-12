/**
 * M02 Save/Sync Status State Model for Workbooks (M06-T02).
 * Mirrors the platform-contracts v1 save_sync semantics without direct
 * protobuf coupling, ensuring durable persistence state and offline recovery.
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
    serverAcceptance: 'not_queued',
    attachmentCompletion: 'not_required',
    backup: 'not_configured',
    pendingWorkRetained: false,
    nextUserAction: 'none',
  };
}

export function markLocalEdit(current: SaveSyncState): SaveSyncState {
  return {
    ...current,
    localPersistence: 'saving',
    serverAcceptance: 'queued',
    pendingWorkRetained: true,
    nextUserAction: 'none',
  };
}

export function markLocalSaved(current: SaveSyncState): SaveSyncState {
  return {
    ...current,
    localPersistence: 'saved',
    pendingWorkRetained: current.serverAcceptance !== 'accepted',
  };
}

export function markServerAccepted(current: SaveSyncState): SaveSyncState {
  return {
    ...current,
    serverAcceptance: 'accepted',
    pendingWorkRetained: current.localPersistence !== 'saved',
    nextUserAction: 'none',
  };
}

export function markServerRejected(current: SaveSyncState): SaveSyncState {
  return {
    ...current,
    serverAcceptance: 'rejected',
    pendingWorkRetained: true,
    nextUserAction: 'review_server_rejection',
  };
}

export function markSyncFailure(current: SaveSyncState): SaveSyncState {
  return {
    ...current,
    serverAcceptance: 'retryable_failure',
    pendingWorkRetained: true,
    nextUserAction: 'retry_sync',
  };
}

export class WorkbookSaveSyncCoordinator {
  private state: SaveSyncState;

  constructor(initialState?: SaveSyncState) {
    this.state = initialState ?? createInitialSaveSyncState();
  }

  public getState(): SaveSyncState {
    return this.state;
  }

  public markEdit(): void {
    this.state = markLocalEdit(this.state);
  }

  public markSaved(): void {
    this.state = markLocalSaved(this.state);
  }

  public markServerAccepted(): void {
    this.state = markServerAccepted(this.state);
  }

  public markServerRejected(): void {
    this.state = markServerRejected(this.state);
  }

  public markSyncFailure(): void {
    this.state = markSyncFailure(this.state);
  }
}

