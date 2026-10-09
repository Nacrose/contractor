// This is a generated file - do not edit.
//
// Generated from contractor/platform/contracts/v1/save_sync.proto.

// @dart = 3.3

// ignore_for_file: annotate_overrides, camel_case_types, comment_references
// ignore_for_file: constant_identifier_names
// ignore_for_file: curly_braces_in_flow_control_structures
// ignore_for_file: deprecated_member_use_from_same_package, library_prefixes
// ignore_for_file: non_constant_identifier_names, prefer_relative_imports
// ignore_for_file: unused_import

import 'dart:convert' as $convert;
import 'dart:core' as $core;
import 'dart:typed_data' as $typed_data;

@$core.Deprecated('Use localPersistenceStateDescriptor instead')
const LocalPersistenceState$json = {
  '1': 'LocalPersistenceState',
  '2': [
    {'1': 'LOCAL_PERSISTENCE_STATE_UNSPECIFIED', '2': 0},
    {'1': 'LOCAL_PERSISTENCE_STATE_NOT_STARTED', '2': 1},
    {'1': 'LOCAL_PERSISTENCE_STATE_SAVING', '2': 2},
    {'1': 'LOCAL_PERSISTENCE_STATE_SAVED', '2': 3},
    {'1': 'LOCAL_PERSISTENCE_STATE_FAILED', '2': 4},
  ],
};

/// Descriptor for `LocalPersistenceState`. Decode as a `google.protobuf.EnumDescriptorProto`.
final $typed_data.Uint8List localPersistenceStateDescriptor = $convert.base64Decode(
    'ChVMb2NhbFBlcnNpc3RlbmNlU3RhdGUSJwojTE9DQUxfUEVSU0lTVEVOQ0VfU1RBVEVfVU5TUE'
    'VDSUZJRUQQABInCiNMT0NBTF9QRVJTSVNURU5DRV9TVEFURV9OT1RfU1RBUlRFRBABEiIKHkxP'
    'Q0FMX1BFUlNJU1RFTkNFX1NUQVRFX1NBVklORxACEiEKHUxPQ0FMX1BFUlNJU1RFTkNFX1NUQV'
    'RFX1NBVkVEEAMSIgoeTE9DQUxfUEVSU0lTVEVOQ0VfU1RBVEVfRkFJTEVEEAQ=');

@$core.Deprecated('Use serverAcceptanceStateDescriptor instead')
const ServerAcceptanceState$json = {
  '1': 'ServerAcceptanceState',
  '2': [
    {'1': 'SERVER_ACCEPTANCE_STATE_UNSPECIFIED', '2': 0},
    {'1': 'SERVER_ACCEPTANCE_STATE_NOT_QUEUED', '2': 1},
    {'1': 'SERVER_ACCEPTANCE_STATE_QUEUED', '2': 2},
    {'1': 'SERVER_ACCEPTANCE_STATE_SENDING', '2': 3},
    {'1': 'SERVER_ACCEPTANCE_STATE_ACCEPTED', '2': 4},
    {'1': 'SERVER_ACCEPTANCE_STATE_RETRYABLE_FAILURE', '2': 5},
    {'1': 'SERVER_ACCEPTANCE_STATE_REJECTED', '2': 6},
  ],
};

/// Descriptor for `ServerAcceptanceState`. Decode as a `google.protobuf.EnumDescriptorProto`.
final $typed_data.Uint8List serverAcceptanceStateDescriptor = $convert.base64Decode(
    'ChVTZXJ2ZXJBY2NlcHRhbmNlU3RhdGUSJwojU0VSVkVSX0FDQ0VQVEFOQ0VfU1RBVEVfVU5TUE'
    'VDSUZJRUQQABImCiJTRVJWRVJfQUNDRVBUQU5DRV9TVEFURV9OT1RfUVVFVUVEEAESIgoeU0VS'
    'VkVSX0FDQ0VQVEFOQ0VfU1RBVEVfUVVFVUVEEAISIwofU0VSVkVSX0FDQ0VQVEFOQ0VfU1RBVE'
    'VfU0VORElORxADEiQKIFNFUlZFUl9BQ0NFUFRBTkNFX1NUQVRFX0FDQ0VQVEVEEAQSLQopU0VS'
    'VkVSX0FDQ0VQVEFOQ0VfU1RBVEVfUkVUUllBQkxFX0ZBSUxVUkUQBRIkCiBTRVJWRVJfQUNDRV'
    'BUQU5DRV9TVEFURV9SRUpFQ1RFRBAG');

@$core.Deprecated('Use attachmentCompletionStateDescriptor instead')
const AttachmentCompletionState$json = {
  '1': 'AttachmentCompletionState',
  '2': [
    {'1': 'ATTACHMENT_COMPLETION_STATE_UNSPECIFIED', '2': 0},
    {'1': 'ATTACHMENT_COMPLETION_STATE_NOT_REQUIRED', '2': 1},
    {'1': 'ATTACHMENT_COMPLETION_STATE_QUEUED', '2': 2},
    {'1': 'ATTACHMENT_COMPLETION_STATE_UPLOADING', '2': 3},
    {'1': 'ATTACHMENT_COMPLETION_STATE_COMPLETE', '2': 4},
    {'1': 'ATTACHMENT_COMPLETION_STATE_RETRYABLE_FAILURE', '2': 5},
    {'1': 'ATTACHMENT_COMPLETION_STATE_REJECTED', '2': 6},
  ],
};

/// Descriptor for `AttachmentCompletionState`. Decode as a `google.protobuf.EnumDescriptorProto`.
final $typed_data.Uint8List attachmentCompletionStateDescriptor = $convert.base64Decode(
    'ChlBdHRhY2htZW50Q29tcGxldGlvblN0YXRlEisKJ0FUVEFDSE1FTlRfQ09NUExFVElPTl9TVE'
    'FURV9VTlNQRUNJRklFRBAAEiwKKEFUVEFDSE1FTlRfQ09NUExFVElPTl9TVEFURV9OT1RfUkVR'
    'VUlSRUQQARImCiJBVFRBQ0hNRU5UX0NPTVBMRVRJT05fU1RBVEVfUVVFVUVEEAISKQolQVRUQU'
    'NITUVOVF9DT01QTEVUSU9OX1NUQVRFX1VQTE9BRElORxADEigKJEFUVEFDSE1FTlRfQ09NUExF'
    'VElPTl9TVEFURV9DT01QTEVURRAEEjEKLUFUVEFDSE1FTlRfQ09NUExFVElPTl9TVEFURV9SRV'
    'RSWUFCTEVfRkFJTFVSRRAFEigKJEFUVEFDSE1FTlRfQ09NUExFVElPTl9TVEFURV9SRUpFQ1RF'
    'RBAG');

@$core.Deprecated('Use backupStateDescriptor instead')
const BackupState$json = {
  '1': 'BackupState',
  '2': [
    {'1': 'BACKUP_STATE_UNSPECIFIED', '2': 0},
    {'1': 'BACKUP_STATE_NOT_CONFIGURED', '2': 1},
    {'1': 'BACKUP_STATE_PENDING', '2': 2},
    {'1': 'BACKUP_STATE_CURRENT', '2': 3},
    {'1': 'BACKUP_STATE_STALE', '2': 4},
    {'1': 'BACKUP_STATE_FAILED', '2': 5},
  ],
};

/// Descriptor for `BackupState`. Decode as a `google.protobuf.EnumDescriptorProto`.
final $typed_data.Uint8List backupStateDescriptor = $convert.base64Decode(
    'CgtCYWNrdXBTdGF0ZRIcChhCQUNLVVBfU1RBVEVfVU5TUEVDSUZJRUQQABIfChtCQUNLVVBfU1'
    'RBVEVfTk9UX0NPTkZJR1VSRUQQARIYChRCQUNLVVBfU1RBVEVfUEVORElORxACEhgKFEJBQ0tV'
    'UF9TVEFURV9DVVJSRU5UEAMSFgoSQkFDS1VQX1NUQVRFX1NUQUxFEAQSFwoTQkFDS1VQX1NUQV'
    'RFX0ZBSUxFRBAF');

@$core.Deprecated('Use nextUserActionDescriptor instead')
const NextUserAction$json = {
  '1': 'NextUserAction',
  '2': [
    {'1': 'NEXT_USER_ACTION_UNSPECIFIED', '2': 0},
    {'1': 'NEXT_USER_ACTION_NONE', '2': 1},
    {'1': 'NEXT_USER_ACTION_RETRY_SYNC', '2': 2},
    {'1': 'NEXT_USER_ACTION_REVIEW_SERVER_REJECTION', '2': 3},
    {'1': 'NEXT_USER_ACTION_RETRY_ATTACHMENTS', '2': 4},
    {'1': 'NEXT_USER_ACTION_CHECK_BACKUP', '2': 5},
    {'1': 'NEXT_USER_ACTION_RETRY_LOCAL_SAVE', '2': 6},
  ],
};

/// Descriptor for `NextUserAction`. Decode as a `google.protobuf.EnumDescriptorProto`.
final $typed_data.Uint8List nextUserActionDescriptor = $convert.base64Decode(
    'Cg5OZXh0VXNlckFjdGlvbhIgChxORVhUX1VTRVJfQUNUSU9OX1VOU1BFQ0lGSUVEEAASGQoVTk'
    'VYVF9VU0VSX0FDVElPTl9OT05FEAESHwobTkVYVF9VU0VSX0FDVElPTl9SRVRSWV9TWU5DEAIS'
    'LAooTkVYVF9VU0VSX0FDVElPTl9SRVZJRVdfU0VSVkVSX1JFSkVDVElPThADEiYKIk5FWFRfVV'
    'NFUl9BQ1RJT05fUkVUUllfQVRUQUNITUVOVFMQBBIhCh1ORVhUX1VTRVJfQUNUSU9OX0NIRUNL'
    'X0JBQ0tVUBAFEiUKIU5FWFRfVVNFUl9BQ1RJT05fUkVUUllfTE9DQUxfU0FWRRAG');

@$core.Deprecated('Use saveSyncStatusDescriptor instead')
const SaveSyncStatus$json = {
  '1': 'SaveSyncStatus',
  '2': [
    {
      '1': 'local_persistence',
      '3': 1,
      '4': 1,
      '5': 14,
      '6': '.contractor.platform.contracts.v1.LocalPersistenceState',
      '10': 'localPersistence'
    },
    {
      '1': 'server_acceptance',
      '3': 2,
      '4': 1,
      '5': 14,
      '6': '.contractor.platform.contracts.v1.ServerAcceptanceState',
      '10': 'serverAcceptance'
    },
    {
      '1': 'attachment_completion',
      '3': 3,
      '4': 1,
      '5': 14,
      '6': '.contractor.platform.contracts.v1.AttachmentCompletionState',
      '10': 'attachmentCompletion'
    },
    {
      '1': 'backup',
      '3': 4,
      '4': 1,
      '5': 14,
      '6': '.contractor.platform.contracts.v1.BackupState',
      '10': 'backup'
    },
    {
      '1': 'pending_work_retained',
      '3': 5,
      '4': 1,
      '5': 8,
      '10': 'pendingWorkRetained'
    },
    {
      '1': 'next_user_action',
      '3': 6,
      '4': 1,
      '5': 14,
      '6': '.contractor.platform.contracts.v1.NextUserAction',
      '10': 'nextUserAction'
    },
  ],
};

/// Descriptor for `SaveSyncStatus`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List saveSyncStatusDescriptor = $convert.base64Decode(
    'Cg5TYXZlU3luY1N0YXR1cxJkChFsb2NhbF9wZXJzaXN0ZW5jZRgBIAEoDjI3LmNvbnRyYWN0b3'
    'IucGxhdGZvcm0uY29udHJhY3RzLnYxLkxvY2FsUGVyc2lzdGVuY2VTdGF0ZVIQbG9jYWxQZXJz'
    'aXN0ZW5jZRJkChFzZXJ2ZXJfYWNjZXB0YW5jZRgCIAEoDjI3LmNvbnRyYWN0b3IucGxhdGZvcm'
    '0uY29udHJhY3RzLnYxLlNlcnZlckFjY2VwdGFuY2VTdGF0ZVIQc2VydmVyQWNjZXB0YW5jZRJw'
    'ChVhdHRhY2htZW50X2NvbXBsZXRpb24YAyABKA4yOy5jb250cmFjdG9yLnBsYXRmb3JtLmNvbn'
    'RyYWN0cy52MS5BdHRhY2htZW50Q29tcGxldGlvblN0YXRlUhRhdHRhY2htZW50Q29tcGxldGlv'
    'bhJFCgZiYWNrdXAYBCABKA4yLS5jb250cmFjdG9yLnBsYXRmb3JtLmNvbnRyYWN0cy52MS5CYW'
    'NrdXBTdGF0ZVIGYmFja3VwEjIKFXBlbmRpbmdfd29ya19yZXRhaW5lZBgFIAEoCFITcGVuZGlu'
    'Z1dvcmtSZXRhaW5lZBJaChBuZXh0X3VzZXJfYWN0aW9uGAYgASgOMjAuY29udHJhY3Rvci5wbG'
    'F0Zm9ybS5jb250cmFjdHMudjEuTmV4dFVzZXJBY3Rpb25SDm5leHRVc2VyQWN0aW9u');
