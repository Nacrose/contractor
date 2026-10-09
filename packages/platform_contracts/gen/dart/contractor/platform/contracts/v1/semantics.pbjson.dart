// This is a generated file - do not edit.
//
// Generated from contractor/platform/contracts/v1/semantics.proto.

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

@$core.Deprecated('Use exactDecimalDescriptor instead')
const ExactDecimal$json = {
  '1': 'ExactDecimal',
  '2': [
    {'1': 'value', '3': 1, '4': 1, '5': 9, '10': 'value'},
  ],
};

/// Descriptor for `ExactDecimal`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List exactDecimalDescriptor =
    $convert.base64Decode('CgxFeGFjdERlY2ltYWwSFAoFdmFsdWUYASABKAlSBXZhbHVl');

@$core.Deprecated('Use dateOnlyDescriptor instead')
const DateOnly$json = {
  '1': 'DateOnly',
  '2': [
    {'1': 'iso_date', '3': 1, '4': 1, '5': 9, '10': 'isoDate'},
  ],
};

/// Descriptor for `DateOnly`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List dateOnlyDescriptor = $convert
    .base64Decode('CghEYXRlT25seRIZCghpc29fZGF0ZRgBIAEoCVIHaXNvRGF0ZQ==');

@$core.Deprecated('Use utcInstantDescriptor instead')
const UtcInstant$json = {
  '1': 'UtcInstant',
  '2': [
    {'1': 'rfc3339_utc', '3': 1, '4': 1, '5': 9, '10': 'rfc3339Utc'},
  ],
};

/// Descriptor for `UtcInstant`. Decode as a `google.protobuf.DescriptorProto`.
final $typed_data.Uint8List utcInstantDescriptor = $convert.base64Decode(
    'CgpVdGNJbnN0YW50Eh8KC3JmYzMzMzlfdXRjGAEgASgJUgpyZmMzMzM5VXRj');
