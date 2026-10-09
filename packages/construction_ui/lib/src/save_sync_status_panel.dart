import 'package:flutter/material.dart';
import 'package:platform_contracts_dart/platform_contracts_dart.dart';

/// Non-blocking presentation of local save, server, attachment, and backup
/// status. It reports state but never changes persistence or transfer work.
class SaveSyncStatusPanel extends StatelessWidget {
  const SaveSyncStatusPanel({
    required this.status,
    this.onNextAction,
    super.key,
  });

  final SaveSyncStatus status;
  final VoidCallback? onNextAction;

  @override
  Widget build(BuildContext context) {
    final nextAction = _nextActionLabel(status.nextUserAction);
    final retentionMessage = _retentionMessage(status);

    return Card(
      child: Semantics(
        liveRegion: true,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Save and sync',
                style: Theme.of(context).textTheme.titleSmall,
              ),
              const SizedBox(height: 8),
              _StatusLine(
                label: 'This device',
                value: _localPersistenceLabel(status.localPersistence),
              ),
              _StatusLine(
                label: 'Server',
                value: _serverAcceptanceLabel(status.serverAcceptance),
              ),
              _StatusLine(
                label: 'Attachments',
                value: _attachmentLabel(status.attachmentCompletion),
              ),
              _StatusLine(label: 'Backup', value: _backupLabel(status.backup)),
              if (retentionMessage != null) ...[
                const SizedBox(height: 8),
                Text(retentionMessage),
              ],
              if (nextAction != null) ...[
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerLeft,
                  child: onNextAction == null
                      ? Text('Next: $nextAction')
                      : TextButton(
                          onPressed: onNextAction,
                          child: Text(nextAction),
                        ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusLine extends StatelessWidget {
  const _StatusLine({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 2),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(width: 96, child: Text(label)),
        Expanded(child: Text(value)),
      ],
    ),
  );
}

String? _retentionMessage(SaveSyncStatus status) {
  if (status.pendingWorkRetained) {
    if (status.serverAcceptance ==
        ServerAcceptanceState.SERVER_ACCEPTANCE_STATE_REJECTED) {
      return 'The server rejected this update. Pending work remains saved on '
          'this device.';
    }
    return 'Pending work remains saved on this device.';
  }
  if (status.localPersistence ==
      LocalPersistenceState.LOCAL_PERSISTENCE_STATE_FAILED) {
    return 'The latest changes were not saved on this device.';
  }
  return null;
}

String _localPersistenceLabel(LocalPersistenceState value) => switch (value) {
  LocalPersistenceState.LOCAL_PERSISTENCE_STATE_NOT_STARTED => 'Not saved',
  LocalPersistenceState.LOCAL_PERSISTENCE_STATE_SAVING => 'Saving locally',
  LocalPersistenceState.LOCAL_PERSISTENCE_STATE_SAVED => 'Saved locally',
  LocalPersistenceState.LOCAL_PERSISTENCE_STATE_FAILED => 'Save failed',
  _ => 'Status unavailable',
};

String _serverAcceptanceLabel(ServerAcceptanceState value) => switch (value) {
  ServerAcceptanceState.SERVER_ACCEPTANCE_STATE_NOT_QUEUED => 'Not queued',
  ServerAcceptanceState.SERVER_ACCEPTANCE_STATE_QUEUED => 'Waiting to sync',
  ServerAcceptanceState.SERVER_ACCEPTANCE_STATE_SENDING => 'Syncing',
  ServerAcceptanceState.SERVER_ACCEPTANCE_STATE_ACCEPTED => 'Accepted',
  ServerAcceptanceState.SERVER_ACCEPTANCE_STATE_RETRYABLE_FAILURE =>
    'Sync delayed',
  ServerAcceptanceState.SERVER_ACCEPTANCE_STATE_REJECTED => 'Rejected',
  _ => 'Status unavailable',
};

String _attachmentLabel(AttachmentCompletionState value) => switch (value) {
  AttachmentCompletionState.ATTACHMENT_COMPLETION_STATE_NOT_REQUIRED =>
    'Not required',
  AttachmentCompletionState.ATTACHMENT_COMPLETION_STATE_QUEUED =>
    'Waiting to upload',
  AttachmentCompletionState.ATTACHMENT_COMPLETION_STATE_UPLOADING =>
    'Uploading in background',
  AttachmentCompletionState.ATTACHMENT_COMPLETION_STATE_COMPLETE => 'Complete',
  AttachmentCompletionState.ATTACHMENT_COMPLETION_STATE_RETRYABLE_FAILURE =>
    'Upload delayed',
  AttachmentCompletionState.ATTACHMENT_COMPLETION_STATE_REJECTED =>
    'Upload rejected',
  _ => 'Status unavailable',
};

String _backupLabel(BackupState value) => switch (value) {
  BackupState.BACKUP_STATE_NOT_CONFIGURED => 'Not configured',
  BackupState.BACKUP_STATE_PENDING => 'Pending',
  BackupState.BACKUP_STATE_CURRENT => 'Current',
  BackupState.BACKUP_STATE_STALE => 'Out of date',
  BackupState.BACKUP_STATE_FAILED => 'Failed',
  _ => 'Status unavailable',
};

String? _nextActionLabel(NextUserAction value) => switch (value) {
  NextUserAction.NEXT_USER_ACTION_RETRY_LOCAL_SAVE => 'Retry local save',
  NextUserAction.NEXT_USER_ACTION_RETRY_SYNC => 'Retry sync',
  NextUserAction.NEXT_USER_ACTION_REVIEW_SERVER_REJECTION =>
    'Review the server message',
  NextUserAction.NEXT_USER_ACTION_RETRY_ATTACHMENTS =>
    'Retry attachment uploads',
  NextUserAction.NEXT_USER_ACTION_CHECK_BACKUP => 'Check backup settings',
  _ => null,
};
