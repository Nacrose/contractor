// This is a generated file - do not edit.
//
// Generated from contractor/platform/contracts/v1/save_sync.proto.

// @dart = 3.3

// ignore_for_file: annotate_overrides, camel_case_types, comment_references
// ignore_for_file: constant_identifier_names
// ignore_for_file: curly_braces_in_flow_control_structures
// ignore_for_file: deprecated_member_use_from_same_package, library_prefixes
// ignore_for_file: non_constant_identifier_names, prefer_relative_imports

import 'dart:core' as $core;

import 'package:protobuf/protobuf.dart' as $pb;

class LocalPersistenceState extends $pb.ProtobufEnum {
  static const LocalPersistenceState LOCAL_PERSISTENCE_STATE_UNSPECIFIED =
      LocalPersistenceState._(
          0, _omitEnumNames ? '' : 'LOCAL_PERSISTENCE_STATE_UNSPECIFIED');
  static const LocalPersistenceState LOCAL_PERSISTENCE_STATE_NOT_STARTED =
      LocalPersistenceState._(
          1, _omitEnumNames ? '' : 'LOCAL_PERSISTENCE_STATE_NOT_STARTED');
  static const LocalPersistenceState LOCAL_PERSISTENCE_STATE_SAVING =
      LocalPersistenceState._(
          2, _omitEnumNames ? '' : 'LOCAL_PERSISTENCE_STATE_SAVING');
  static const LocalPersistenceState LOCAL_PERSISTENCE_STATE_SAVED =
      LocalPersistenceState._(
          3, _omitEnumNames ? '' : 'LOCAL_PERSISTENCE_STATE_SAVED');
  static const LocalPersistenceState LOCAL_PERSISTENCE_STATE_FAILED =
      LocalPersistenceState._(
          4, _omitEnumNames ? '' : 'LOCAL_PERSISTENCE_STATE_FAILED');

  static const $core.List<LocalPersistenceState> values =
      <LocalPersistenceState>[
    LOCAL_PERSISTENCE_STATE_UNSPECIFIED,
    LOCAL_PERSISTENCE_STATE_NOT_STARTED,
    LOCAL_PERSISTENCE_STATE_SAVING,
    LOCAL_PERSISTENCE_STATE_SAVED,
    LOCAL_PERSISTENCE_STATE_FAILED,
  ];

  static final $core.List<LocalPersistenceState?> _byValue =
      $pb.ProtobufEnum.$_initByValueList(values, 4);
  static LocalPersistenceState? valueOf($core.int value) =>
      value < 0 || value >= _byValue.length ? null : _byValue[value];

  const LocalPersistenceState._(super.value, super.name);
}

class ServerAcceptanceState extends $pb.ProtobufEnum {
  static const ServerAcceptanceState SERVER_ACCEPTANCE_STATE_UNSPECIFIED =
      ServerAcceptanceState._(
          0, _omitEnumNames ? '' : 'SERVER_ACCEPTANCE_STATE_UNSPECIFIED');
  static const ServerAcceptanceState SERVER_ACCEPTANCE_STATE_NOT_QUEUED =
      ServerAcceptanceState._(
          1, _omitEnumNames ? '' : 'SERVER_ACCEPTANCE_STATE_NOT_QUEUED');
  static const ServerAcceptanceState SERVER_ACCEPTANCE_STATE_QUEUED =
      ServerAcceptanceState._(
          2, _omitEnumNames ? '' : 'SERVER_ACCEPTANCE_STATE_QUEUED');
  static const ServerAcceptanceState SERVER_ACCEPTANCE_STATE_SENDING =
      ServerAcceptanceState._(
          3, _omitEnumNames ? '' : 'SERVER_ACCEPTANCE_STATE_SENDING');
  static const ServerAcceptanceState SERVER_ACCEPTANCE_STATE_ACCEPTED =
      ServerAcceptanceState._(
          4, _omitEnumNames ? '' : 'SERVER_ACCEPTANCE_STATE_ACCEPTED');
  static const ServerAcceptanceState SERVER_ACCEPTANCE_STATE_RETRYABLE_FAILURE =
      ServerAcceptanceState._(
          5, _omitEnumNames ? '' : 'SERVER_ACCEPTANCE_STATE_RETRYABLE_FAILURE');
  static const ServerAcceptanceState SERVER_ACCEPTANCE_STATE_REJECTED =
      ServerAcceptanceState._(
          6, _omitEnumNames ? '' : 'SERVER_ACCEPTANCE_STATE_REJECTED');

  static const $core.List<ServerAcceptanceState> values =
      <ServerAcceptanceState>[
    SERVER_ACCEPTANCE_STATE_UNSPECIFIED,
    SERVER_ACCEPTANCE_STATE_NOT_QUEUED,
    SERVER_ACCEPTANCE_STATE_QUEUED,
    SERVER_ACCEPTANCE_STATE_SENDING,
    SERVER_ACCEPTANCE_STATE_ACCEPTED,
    SERVER_ACCEPTANCE_STATE_RETRYABLE_FAILURE,
    SERVER_ACCEPTANCE_STATE_REJECTED,
  ];

  static final $core.List<ServerAcceptanceState?> _byValue =
      $pb.ProtobufEnum.$_initByValueList(values, 6);
  static ServerAcceptanceState? valueOf($core.int value) =>
      value < 0 || value >= _byValue.length ? null : _byValue[value];

  const ServerAcceptanceState._(super.value, super.name);
}

class AttachmentCompletionState extends $pb.ProtobufEnum {
  static const AttachmentCompletionState
      ATTACHMENT_COMPLETION_STATE_UNSPECIFIED = AttachmentCompletionState._(
          0, _omitEnumNames ? '' : 'ATTACHMENT_COMPLETION_STATE_UNSPECIFIED');
  static const AttachmentCompletionState
      ATTACHMENT_COMPLETION_STATE_NOT_REQUIRED = AttachmentCompletionState._(
          1, _omitEnumNames ? '' : 'ATTACHMENT_COMPLETION_STATE_NOT_REQUIRED');
  static const AttachmentCompletionState ATTACHMENT_COMPLETION_STATE_QUEUED =
      AttachmentCompletionState._(
          2, _omitEnumNames ? '' : 'ATTACHMENT_COMPLETION_STATE_QUEUED');
  static const AttachmentCompletionState ATTACHMENT_COMPLETION_STATE_UPLOADING =
      AttachmentCompletionState._(
          3, _omitEnumNames ? '' : 'ATTACHMENT_COMPLETION_STATE_UPLOADING');
  static const AttachmentCompletionState ATTACHMENT_COMPLETION_STATE_COMPLETE =
      AttachmentCompletionState._(
          4, _omitEnumNames ? '' : 'ATTACHMENT_COMPLETION_STATE_COMPLETE');
  static const AttachmentCompletionState
      ATTACHMENT_COMPLETION_STATE_RETRYABLE_FAILURE =
      AttachmentCompletionState._(
          5,
          _omitEnumNames
              ? ''
              : 'ATTACHMENT_COMPLETION_STATE_RETRYABLE_FAILURE');
  static const AttachmentCompletionState ATTACHMENT_COMPLETION_STATE_REJECTED =
      AttachmentCompletionState._(
          6, _omitEnumNames ? '' : 'ATTACHMENT_COMPLETION_STATE_REJECTED');

  static const $core.List<AttachmentCompletionState> values =
      <AttachmentCompletionState>[
    ATTACHMENT_COMPLETION_STATE_UNSPECIFIED,
    ATTACHMENT_COMPLETION_STATE_NOT_REQUIRED,
    ATTACHMENT_COMPLETION_STATE_QUEUED,
    ATTACHMENT_COMPLETION_STATE_UPLOADING,
    ATTACHMENT_COMPLETION_STATE_COMPLETE,
    ATTACHMENT_COMPLETION_STATE_RETRYABLE_FAILURE,
    ATTACHMENT_COMPLETION_STATE_REJECTED,
  ];

  static final $core.List<AttachmentCompletionState?> _byValue =
      $pb.ProtobufEnum.$_initByValueList(values, 6);
  static AttachmentCompletionState? valueOf($core.int value) =>
      value < 0 || value >= _byValue.length ? null : _byValue[value];

  const AttachmentCompletionState._(super.value, super.name);
}

class BackupState extends $pb.ProtobufEnum {
  static const BackupState BACKUP_STATE_UNSPECIFIED =
      BackupState._(0, _omitEnumNames ? '' : 'BACKUP_STATE_UNSPECIFIED');
  static const BackupState BACKUP_STATE_NOT_CONFIGURED =
      BackupState._(1, _omitEnumNames ? '' : 'BACKUP_STATE_NOT_CONFIGURED');
  static const BackupState BACKUP_STATE_PENDING =
      BackupState._(2, _omitEnumNames ? '' : 'BACKUP_STATE_PENDING');
  static const BackupState BACKUP_STATE_CURRENT =
      BackupState._(3, _omitEnumNames ? '' : 'BACKUP_STATE_CURRENT');
  static const BackupState BACKUP_STATE_STALE =
      BackupState._(4, _omitEnumNames ? '' : 'BACKUP_STATE_STALE');
  static const BackupState BACKUP_STATE_FAILED =
      BackupState._(5, _omitEnumNames ? '' : 'BACKUP_STATE_FAILED');

  static const $core.List<BackupState> values = <BackupState>[
    BACKUP_STATE_UNSPECIFIED,
    BACKUP_STATE_NOT_CONFIGURED,
    BACKUP_STATE_PENDING,
    BACKUP_STATE_CURRENT,
    BACKUP_STATE_STALE,
    BACKUP_STATE_FAILED,
  ];

  static final $core.List<BackupState?> _byValue =
      $pb.ProtobufEnum.$_initByValueList(values, 5);
  static BackupState? valueOf($core.int value) =>
      value < 0 || value >= _byValue.length ? null : _byValue[value];

  const BackupState._(super.value, super.name);
}

class NextUserAction extends $pb.ProtobufEnum {
  static const NextUserAction NEXT_USER_ACTION_UNSPECIFIED =
      NextUserAction._(0, _omitEnumNames ? '' : 'NEXT_USER_ACTION_UNSPECIFIED');
  static const NextUserAction NEXT_USER_ACTION_NONE =
      NextUserAction._(1, _omitEnumNames ? '' : 'NEXT_USER_ACTION_NONE');
  static const NextUserAction NEXT_USER_ACTION_RETRY_SYNC =
      NextUserAction._(2, _omitEnumNames ? '' : 'NEXT_USER_ACTION_RETRY_SYNC');
  static const NextUserAction NEXT_USER_ACTION_REVIEW_SERVER_REJECTION =
      NextUserAction._(
          3, _omitEnumNames ? '' : 'NEXT_USER_ACTION_REVIEW_SERVER_REJECTION');
  static const NextUserAction NEXT_USER_ACTION_RETRY_ATTACHMENTS =
      NextUserAction._(
          4, _omitEnumNames ? '' : 'NEXT_USER_ACTION_RETRY_ATTACHMENTS');
  static const NextUserAction NEXT_USER_ACTION_CHECK_BACKUP = NextUserAction._(
      5, _omitEnumNames ? '' : 'NEXT_USER_ACTION_CHECK_BACKUP');
  static const NextUserAction NEXT_USER_ACTION_RETRY_LOCAL_SAVE =
      NextUserAction._(
          6, _omitEnumNames ? '' : 'NEXT_USER_ACTION_RETRY_LOCAL_SAVE');

  static const $core.List<NextUserAction> values = <NextUserAction>[
    NEXT_USER_ACTION_UNSPECIFIED,
    NEXT_USER_ACTION_NONE,
    NEXT_USER_ACTION_RETRY_SYNC,
    NEXT_USER_ACTION_REVIEW_SERVER_REJECTION,
    NEXT_USER_ACTION_RETRY_ATTACHMENTS,
    NEXT_USER_ACTION_CHECK_BACKUP,
    NEXT_USER_ACTION_RETRY_LOCAL_SAVE,
  ];

  static final $core.List<NextUserAction?> _byValue =
      $pb.ProtobufEnum.$_initByValueList(values, 6);
  static NextUserAction? valueOf($core.int value) =>
      value < 0 || value >= _byValue.length ? null : _byValue[value];

  const NextUserAction._(super.value, super.name);
}

const $core.bool _omitEnumNames =
    $core.bool.fromEnvironment('protobuf.omit_enum_names');
