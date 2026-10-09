import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:construction_client/cad/geometry/cad_geometry_interface.dart';
import 'package:construction_client/cpm/cpm_kernel_interface.dart';
import 'package:construction_client/semantics/decimal_semantics.dart';

Map<String, dynamic> loadFixture() {
  final file = File('../../fixtures/platform-parity/semantics/cross-language.json');
  if (!file.existsSync()) throw StateError('Shared semantic fixture missing: ${file.path}');
  return jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
}

DateTime parseDateOnly(String input) {
  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(input);
  if (match == null) throw FormatException('Expected YYYY-MM-DD date-only value', input);
  final year = int.parse(match.group(1)!);
  final month = int.parse(match.group(2)!);
  final day = int.parse(match.group(3)!);
  final parsed = DateTime.utc(year, month, day);
  if (parsed.year != year || parsed.month != month || parsed.day != day) {
    throw FormatException('Invalid calendar date', input);
  }
  return parsed;
}

String utcInstantToDateOnly(String input, int offsetMinutes) {
  if (!input.endsWith('Z')) throw FormatException('Expected an explicit UTC instant', input);
  final local = DateTime.parse(input).toUtc().add(Duration(minutes: offsetMinutes));
  return '${local.year.toString().padLeft(4, '0')}-'
      '${local.month.toString().padLeft(2, '0')}-'
      '${local.day.toString().padLeft(2, '0')}';
}

void main() {
  final fixture = loadFixture();
  final contracts = fixture['contracts'] as Map<String, dynamic>;
  final money = contracts['money'] as Map<String, dynamic>;
  final geometry = contracts['geometry'] as Map<String, dynamic>;
  final calendarContract = contracts['calendar'] as Map<String, dynamic>;

  group('M01-T14 shared exact decimal fixtures', () {
    for (final raw in fixture['decimalCases'] as List) {
      final item = raw as Map<String, dynamic>;
      test(item['id'] as String, () {
        if (item['reject'] == true) {
          expect(
            () => parseDecimalToScaledInteger(
              item['input'] as String,
              scale: money['scale'] as int,
            ),
            throwsFormatException,
          );
        } else {
          expect(
            parseDecimalToScaledInteger(
              item['input'] as String,
              scale: money['scale'] as int,
            ).toString(),
            item['expectedScaled'],
          );
        }
      });
    }
  });

  group('M01-T14 geometry tolerance fixtures', () {
    final policy = TolerancePolicy(epsilon: (geometry['epsilon'] as num).toDouble());
    for (final raw in fixture['geometryCases'] as List) {
      final item = raw as Map<String, dynamic>;
      test(item['id'] as String, () {
        final a = item['a'] as List;
        final b = item['b'] as List;
        expect(
          policy.isCoincident(
            CadPoint2D((a[0] as num).toDouble(), (a[1] as num).toDouble()),
            CadPoint2D((b[0] as num).toDouble(), (b[1] as num).toDouble()),
          ),
          item['expectedCoincident'],
        );
      });
    }
  });

  group('M01-T14 date-only, UTC-instant and Nepal calendar fixtures', () {
    for (final raw in fixture['dateCases'] as List) {
      final item = raw as Map<String, dynamic>;
      test(item['id'] as String, () {
        final result = item['kind'] == 'date-only'
            ? parseDateOnly(item['input'] as String)
                .toIso8601String()
                .substring(0, 10)
            : utcInstantToDateOnly(
                item['input'] as String,
                calendarContract['utcOffsetMinutes'] as int,
              );
        expect(result, item['expectedDate']);
      });
    }

    for (final raw in fixture['calendarCases'] as List) {
      final item = raw as Map<String, dynamic>;
      test(item['id'] as String, () {
        final workingDays = (calendarContract['workingDaysOfWeek'] as List)
            .cast<int>()
            .toSet();
        final calendar = CpmCalendar(workingDaysOfWeek: workingDays);
        final from = parseDateOnly(item['from'] as String);
        final to = parseDateOnly(item['to'] as String);
        final between = calendar.workingDaysBetween(from, to);
        final inclusiveDuration = between + (calendar.isWorkDay(from) ? 1 : 0);
        expect(between, item['expectedWorkingDaysBetween']);
        expect(inclusiveDuration, item['expectedInclusiveTaskDuration']);
      });
    }
  });
}
