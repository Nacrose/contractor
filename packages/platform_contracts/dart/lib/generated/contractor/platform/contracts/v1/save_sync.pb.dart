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

import 'save_sync.pbenum.dart';

export 'package:protobuf/protobuf.dart' show GeneratedMessageGenericExtensions;

export 'save_sync.pbenum.dart';

/// A presentation-safe snapshot of local persistence and independent network
/// work. It never represents business approval or permission to mutate data.
class SaveSyncStatus extends $pb.GeneratedMessage {
  factory SaveSyncStatus({
    LocalPersistenceState? localPersistence,
    ServerAcceptanceState? serverAcceptance,
    AttachmentCompletionState? attachmentCompletion,
    BackupState? backup,
    $core.bool? pendingWorkRetained,
    NextUserAction? nextUserAction,
  }) {
    final result = SaveSyncStatus._();
    if (localPersistence != null) result.localPersistence = localPersistence;
    if (serverAcceptance != null) result.serverAcceptance = serverAcceptance;
    if (attachmentCompletion != null)
      result.attachmentCompletion = attachmentCompletion;
    if (backup != null) result.backup = backup;
    if (pendingWorkRetained != null)
      result.pendingWorkRetained = pendingWorkRetained;
    if (nextUserAction != null) result.nextUserAction = nextUserAction;
    return result;
  }

  SaveSyncStatus._();

  factory SaveSyncStatus.fromBuffer($core.List<$core.int> data,
          [$pb.ExtensionRegistry registry = $pb.ExtensionRegistry.EMPTY]) =>
      SaveSyncStatus()..mergeFromBuffer(data, registry);
  factory SaveSyncStatus.fromJson($core.String json,
          [$pb.ExtensionRegistry registry = $pb.ExtensionRegistry.EMPTY]) =>
      SaveSyncStatus()..mergeFromJson(json, registry);

  static final $pb.BuilderInfo _i = $pb.BuilderInfo(
      _omitMessageNames ? '' : 'SaveSyncStatus',
      package: const $pb.PackageName(
          _omitMessageNames ? '' : 'contractor.platform.contracts.v1'),
      createEmptyInstance: SaveSyncStatus.$_createMessage)
    ..aE<LocalPersistenceState>(1, _omitFieldNames ? '' : 'localPersistence',
        enumValues: LocalPersistenceState.values)
    ..aE<ServerAcceptanceState>(2, _omitFieldNames ? '' : 'serverAcceptance',
        enumValues: ServerAcceptanceState.values)
    ..aE<AttachmentCompletionState>(
        3, _omitFieldNames ? '' : 'attachmentCompletion',
        enumValues: AttachmentCompletionState.values)
    ..aE<BackupState>(4, _omitFieldNames ? '' : 'backup',
        enumValues: BackupState.values)
    ..aOB(5, _omitFieldNames ? '' : 'pendingWorkRetained')
    ..aE<NextUserAction>(6, _omitFieldNames ? '' : 'nextUserAction',
        enumValues: NextUserAction.values)
    ..hasRequiredFields = false;

  @$core.Deprecated('See https://github.com/google/protobuf.dart/issues/998.')
  SaveSyncStatus clone() => deepCopy();
  @$core.Deprecated('See https://github.com/google/protobuf.dart/issues/998.')
  SaveSyncStatus copyWith(void Function(SaveSyncStatus) updates) =>
      super.copyWith((message) => updates(message as SaveSyncStatus))
          as SaveSyncStatus;

  @$core.override
  $pb.BuilderInfo get info_ => _i;

  @$core.pragma('dart2js:noInline')
  @$core.Deprecated('Use SaveSyncStatus() / SaveSyncStatus.new instead')
  static SaveSyncStatus create() => SaveSyncStatus._();
  static $pb.GeneratedMessage $_createMessage() => SaveSyncStatus._();
  @$core.override
  SaveSyncStatus createEmptyInstance() => SaveSyncStatus._();
  @$core.pragma('dart2js:noInline')
  static SaveSyncStatus getDefault() =>
      _defaultInstance ??= $pb.GeneratedMessage.$_defaultFor<SaveSyncStatus>(
          SaveSyncStatus.$_createMessage);
  static SaveSyncStatus? _defaultInstance;

  @$pb.TagNumber(1)
  LocalPersistenceState get localPersistence => $_getN(0);
  @$pb.TagNumber(1)
  set localPersistence(LocalPersistenceState value) => $_setField(1, value);
  @$pb.TagNumber(1)
  $core.bool hasLocalPersistence() => $_has(0);
  @$pb.TagNumber(1)
  void clearLocalPersistence() => $_clearField(1);

  @$pb.TagNumber(2)
  ServerAcceptanceState get serverAcceptance => $_getN(1);
  @$pb.TagNumber(2)
  set serverAcceptance(ServerAcceptanceState value) => $_setField(2, value);
  @$pb.TagNumber(2)
  $core.bool hasServerAcceptance() => $_has(1);
  @$pb.TagNumber(2)
  void clearServerAcceptance() => $_clearField(2);

  @$pb.TagNumber(3)
  AttachmentCompletionState get attachmentCompletion => $_getN(2);
  @$pb.TagNumber(3)
  set attachmentCompletion(AttachmentCompletionState value) =>
      $_setField(3, value);
  @$pb.TagNumber(3)
  $core.bool hasAttachmentCompletion() => $_has(2);
  @$pb.TagNumber(3)
  void clearAttachmentCompletion() => $_clearField(3);

  @$pb.TagNumber(4)
  BackupState get backup => $_getN(3);
  @$pb.TagNumber(4)
  set backup(BackupState value) => $_setField(4, value);
  @$pb.TagNumber(4)
  $core.bool hasBackup() => $_has(3);
  @$pb.TagNumber(4)
  void clearBackup() => $_clearField(4);

  /// True while any unsent record or attachment remains in durable local
  /// storage. Retryable failures and server rejections must retain that work.
  @$pb.TagNumber(5)
  $core.bool get pendingWorkRetained => $_getBF(4);
  @$pb.TagNumber(5)
  set pendingWorkRetained($core.bool value) => $_setBool(4, value);
  @$pb.TagNumber(5)
  $core.bool hasPendingWorkRetained() => $_has(4);
  @$pb.TagNumber(5)
  void clearPendingWorkRetained() => $_clearField(5);

  @$pb.TagNumber(6)
  NextUserAction get nextUserAction => $_getN(5);
  @$pb.TagNumber(6)
  set nextUserAction(NextUserAction value) => $_setField(6, value);
  @$pb.TagNumber(6)
  $core.bool hasNextUserAction() => $_has(5);
  @$pb.TagNumber(6)
  void clearNextUserAction() => $_clearField(6);
}

const $core.bool _omitFieldNames =
    $core.bool.fromEnvironment('protobuf.omit_field_names');
const $core.bool _omitMessageNames =
    $core.bool.fromEnvironment('protobuf.omit_message_names');
