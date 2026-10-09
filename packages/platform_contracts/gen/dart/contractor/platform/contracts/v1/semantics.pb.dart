// This is a generated file - do not edit.
//
// Generated from contractor/platform/contracts/v1/semantics.proto.

// @dart = 3.3

// ignore_for_file: annotate_overrides, camel_case_types, comment_references
// ignore_for_file: constant_identifier_names
// ignore_for_file: curly_braces_in_flow_control_structures
// ignore_for_file: deprecated_member_use_from_same_package, library_prefixes
// ignore_for_file: non_constant_identifier_names, prefer_relative_imports

import 'dart:core' as $core;

import 'package:protobuf/protobuf.dart' as $pb;

export 'package:protobuf/protobuf.dart' show GeneratedMessageGenericExtensions;

/// ExactDecimal carries a decimal value as text so consumers never parse it
/// through binary floating point.
class ExactDecimal extends $pb.GeneratedMessage {
  factory ExactDecimal({
    $core.String? value,
  }) {
    final result = ExactDecimal._();
    if (value != null) result.value = value;
    return result;
  }

  ExactDecimal._();

  factory ExactDecimal.fromBuffer($core.List<$core.int> data,
          [$pb.ExtensionRegistry registry = $pb.ExtensionRegistry.EMPTY]) =>
      ExactDecimal()..mergeFromBuffer(data, registry);
  factory ExactDecimal.fromJson($core.String json,
          [$pb.ExtensionRegistry registry = $pb.ExtensionRegistry.EMPTY]) =>
      ExactDecimal()..mergeFromJson(json, registry);

  static final $pb.BuilderInfo _i = $pb.BuilderInfo(
      _omitMessageNames ? '' : 'ExactDecimal',
      package: const $pb.PackageName(
          _omitMessageNames ? '' : 'contractor.platform.contracts.v1'),
      createEmptyInstance: ExactDecimal.$_createMessage)
    ..aOS(1, _omitFieldNames ? '' : 'value')
    ..hasRequiredFields = false;

  @$core.Deprecated('See https://github.com/google/protobuf.dart/issues/998.')
  ExactDecimal clone() => deepCopy();
  @$core.Deprecated('See https://github.com/google/protobuf.dart/issues/998.')
  ExactDecimal copyWith(void Function(ExactDecimal) updates) =>
      super.copyWith((message) => updates(message as ExactDecimal))
          as ExactDecimal;

  @$core.override
  $pb.BuilderInfo get info_ => _i;

  @$core.pragma('dart2js:noInline')
  @$core.Deprecated('Use ExactDecimal() / ExactDecimal.new instead')
  static ExactDecimal create() => ExactDecimal._();
  static $pb.GeneratedMessage $_createMessage() => ExactDecimal._();
  @$core.override
  ExactDecimal createEmptyInstance() => ExactDecimal._();
  @$core.pragma('dart2js:noInline')
  static ExactDecimal getDefault() =>
      _defaultInstance ??= $pb.GeneratedMessage.$_defaultFor<ExactDecimal>(
          ExactDecimal.$_createMessage);
  static ExactDecimal? _defaultInstance;

  @$pb.TagNumber(1)
  $core.String get value => $_getSZ(0);
  @$pb.TagNumber(1)
  set value($core.String value) => $_setString(0, value);
  @$pb.TagNumber(1)
  $core.bool hasValue() => $_has(0);
  @$pb.TagNumber(1)
  void clearValue() => $_clearField(1);
}

/// DateOnly carries a calendar date without a timezone or time-of-day.
class DateOnly extends $pb.GeneratedMessage {
  factory DateOnly({
    $core.String? isoDate,
  }) {
    final result = DateOnly._();
    if (isoDate != null) result.isoDate = isoDate;
    return result;
  }

  DateOnly._();

  factory DateOnly.fromBuffer($core.List<$core.int> data,
          [$pb.ExtensionRegistry registry = $pb.ExtensionRegistry.EMPTY]) =>
      DateOnly()..mergeFromBuffer(data, registry);
  factory DateOnly.fromJson($core.String json,
          [$pb.ExtensionRegistry registry = $pb.ExtensionRegistry.EMPTY]) =>
      DateOnly()..mergeFromJson(json, registry);

  static final $pb.BuilderInfo _i = $pb.BuilderInfo(
      _omitMessageNames ? '' : 'DateOnly',
      package: const $pb.PackageName(
          _omitMessageNames ? '' : 'contractor.platform.contracts.v1'),
      createEmptyInstance: DateOnly.$_createMessage)
    ..aOS(1, _omitFieldNames ? '' : 'isoDate')
    ..hasRequiredFields = false;

  @$core.Deprecated('See https://github.com/google/protobuf.dart/issues/998.')
  DateOnly clone() => deepCopy();
  @$core.Deprecated('See https://github.com/google/protobuf.dart/issues/998.')
  DateOnly copyWith(void Function(DateOnly) updates) =>
      super.copyWith((message) => updates(message as DateOnly)) as DateOnly;

  @$core.override
  $pb.BuilderInfo get info_ => _i;

  @$core.pragma('dart2js:noInline')
  @$core.Deprecated('Use DateOnly() / DateOnly.new instead')
  static DateOnly create() => DateOnly._();
  static $pb.GeneratedMessage $_createMessage() => DateOnly._();
  @$core.override
  DateOnly createEmptyInstance() => DateOnly._();
  @$core.pragma('dart2js:noInline')
  static DateOnly getDefault() => _defaultInstance ??=
      $pb.GeneratedMessage.$_defaultFor<DateOnly>(DateOnly.$_createMessage);
  static DateOnly? _defaultInstance;

  @$pb.TagNumber(1)
  $core.String get isoDate => $_getSZ(0);
  @$pb.TagNumber(1)
  set isoDate($core.String value) => $_setString(0, value);
  @$pb.TagNumber(1)
  $core.bool hasIsoDate() => $_has(0);
  @$pb.TagNumber(1)
  void clearIsoDate() => $_clearField(1);
}

/// UtcInstant carries an explicit UTC RFC 3339 instant, distinct from DateOnly.
class UtcInstant extends $pb.GeneratedMessage {
  factory UtcInstant({
    $core.String? rfc3339Utc,
  }) {
    final result = UtcInstant._();
    if (rfc3339Utc != null) result.rfc3339Utc = rfc3339Utc;
    return result;
  }

  UtcInstant._();

  factory UtcInstant.fromBuffer($core.List<$core.int> data,
          [$pb.ExtensionRegistry registry = $pb.ExtensionRegistry.EMPTY]) =>
      UtcInstant()..mergeFromBuffer(data, registry);
  factory UtcInstant.fromJson($core.String json,
          [$pb.ExtensionRegistry registry = $pb.ExtensionRegistry.EMPTY]) =>
      UtcInstant()..mergeFromJson(json, registry);

  static final $pb.BuilderInfo _i = $pb.BuilderInfo(
      _omitMessageNames ? '' : 'UtcInstant',
      package: const $pb.PackageName(
          _omitMessageNames ? '' : 'contractor.platform.contracts.v1'),
      createEmptyInstance: UtcInstant.$_createMessage)
    ..aOS(1, _omitFieldNames ? '' : 'rfc3339Utc')
    ..hasRequiredFields = false;

  @$core.Deprecated('See https://github.com/google/protobuf.dart/issues/998.')
  UtcInstant clone() => deepCopy();
  @$core.Deprecated('See https://github.com/google/protobuf.dart/issues/998.')
  UtcInstant copyWith(void Function(UtcInstant) updates) =>
      super.copyWith((message) => updates(message as UtcInstant)) as UtcInstant;

  @$core.override
  $pb.BuilderInfo get info_ => _i;

  @$core.pragma('dart2js:noInline')
  @$core.Deprecated('Use UtcInstant() / UtcInstant.new instead')
  static UtcInstant create() => UtcInstant._();
  static $pb.GeneratedMessage $_createMessage() => UtcInstant._();
  @$core.override
  UtcInstant createEmptyInstance() => UtcInstant._();
  @$core.pragma('dart2js:noInline')
  static UtcInstant getDefault() => _defaultInstance ??=
      $pb.GeneratedMessage.$_defaultFor<UtcInstant>(UtcInstant.$_createMessage);
  static UtcInstant? _defaultInstance;

  @$pb.TagNumber(1)
  $core.String get rfc3339Utc => $_getSZ(0);
  @$pb.TagNumber(1)
  set rfc3339Utc($core.String value) => $_setString(0, value);
  @$pb.TagNumber(1)
  $core.bool hasRfc3339Utc() => $_has(0);
  @$pb.TagNumber(1)
  void clearRfc3339Utc() => $_clearField(1);
}

const $core.bool _omitFieldNames =
    $core.bool.fromEnvironment('protobuf.omit_field_names');
const $core.bool _omitMessageNames =
    $core.bool.fromEnvironment('protobuf.omit_message_names');
