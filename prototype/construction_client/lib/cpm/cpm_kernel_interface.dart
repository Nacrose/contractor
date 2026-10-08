/// Dependency relationship types for Critical Path Method
enum DependencyType {
  fs, // Finish to Start (default)
  ss, // Start to Start
  ff, // Finish to Finish
  sf, // Start to Finish
}

/// Date / milestone constraint types
enum ConstraintType {
  asap, // As Soon As Possible (default)
  alap, // As Late As Possible
  snet, // Start No Earlier Than
  fnlt, // Finish No Later Than
  mso,  // Must Start On
  mfo,  // Must Finish On
}

/// Represents a single activity/task in a CPM schedule network
class CpmTask {
  final String id;
  final String name;
  final int durationDays;
  final bool isMilestone;
  final DateTime? originalStartDate;
  final DateTime? originalEndDate;
  final ConstraintType constraintType;
  final DateTime? constraintDate;

  // Calculation output attributes
  DateTime? earlyStart;
  DateTime? earlyFinish;
  DateTime? lateStart;
  DateTime? lateFinish;
  int totalFloatDays;
  int freeFloatDays;
  bool isCritical;

  CpmTask({
    required this.id,
    required this.name,
    required this.durationDays,
    this.isMilestone = false,
    this.originalStartDate,
    this.originalEndDate,
    this.constraintType = ConstraintType.asap,
    this.constraintDate,
    this.totalFloatDays = 0,
    this.freeFloatDays = 0,
    this.isCritical = false,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'durationDays': durationDays,
        'isMilestone': isMilestone,
        'earlyStart': earlyStart?.toIso8601String().split('T')[0],
        'earlyFinish': earlyFinish?.toIso8601String().split('T')[0],
        'lateStart': lateStart?.toIso8601String().split('T')[0],
        'lateFinish': lateFinish?.toIso8601String().split('T')[0],
        'totalFloatDays': totalFloatDays,
        'freeFloatDays': freeFloatDays,
        'isCritical': isCritical,
      };
}

/// Represents a directed dependency link between two CPM tasks
class CpmDependency {
  final String predecessorId;
  final String successorId;
  final DependencyType type;
  final int lagHours;

  const CpmDependency({
    required this.predecessorId,
    required this.successorId,
    this.type = DependencyType.fs,
    this.lagHours = 0,
  });

  int get lagDays => (lagHours / 24.0).round();
}

/// Construction calendar configuration (handles Nepal working weeks & holidays)
class CpmCalendar {
  final Set<int> workingDaysOfWeek; // 1 = Monday, 7 = Sunday. Nepal: 7 (Sun) to 5 (Fri)
  final Set<String> publicHolidays; // 'YYYY-MM-DD'

  const CpmCalendar({
    this.workingDaysOfWeek = const {7, 1, 2, 3, 4, 5}, // Sunday through Friday
    this.publicHolidays = const {},
  });

  bool isWorkDay(DateTime date) {
    if (!workingDaysOfWeek.contains(date.weekday)) return false;
    final iso = date.toIso8601String().split('T')[0];
    return !publicHolidays.contains(iso);
  }

  DateTime addWorkingDays(DateTime start, int days) {
    if (days == 0) return start;
    DateTime current = start;
    int step = days > 0 ? 1 : -1;
    int remaining = days.abs();

    // With no holidays, jump across whole weeks in constant time. A full
    // week preserves the weekday and consumes exactly the configured number
    // of working days, leaving at most one week's work for the loop below.
    final workingDaysPerWeek = workingDaysOfWeek.length;
    if (publicHolidays.isEmpty && workingDaysPerWeek > 0) {
      final fullWeeks = remaining ~/ workingDaysPerWeek;
      if (fullWeeks > 0) {
        current = current.add(Duration(days: fullWeeks * 7 * step));
        remaining -= fullWeeks * workingDaysPerWeek;
      }
    }

    while (remaining > 0) {
      current = current.add(Duration(days: step));
      if (isWorkDay(current)) {
        remaining--;
      }
    }
    return current;
  }

  int workingDaysBetween(DateTime from, DateTime to) {
    if (from.isAfter(to)) return -workingDaysBetween(to, from);

    // Work in calendar dates so DST cannot turn an interval into 23/25 hours.
    final startDate = DateTime.utc(from.year, from.month, from.day);
    final endDate = DateTime.utc(to.year, to.month, to.day);
    final elapsedDays = endDate.difference(startDate).inDays;
    if (elapsedDays == 0) return 0;

    final fullWeeks = elapsedDays ~/ 7;
    final remainderDays = elapsedDays % 7;
    var count = fullWeeks * workingDaysOfWeek.length;

    // The interval is (from, to]: count weekdays after whole weeks, then
    // subtract public holidays within the range.
    final startWeekday = startDate.weekday;
    for (var offset = 1; offset <= remainderDays; offset++) {
      final weekday = ((startWeekday - 1 + offset) % 7) + 1;
      if (workingDaysOfWeek.contains(weekday)) count++;
    }

    if (publicHolidays.isNotEmpty) {
      final epoch = DateTime.utc(1970, 1, 1);
      final startOrdinal = startDate.difference(epoch).inDays;
      final endOrdinal = endDate.difference(epoch).inDays;
      for (final holiday in publicHolidays) {
        final holidayDate = DateTime.tryParse(holiday);
        if (holidayDate == null ||
            holiday != holidayDate.toIso8601String().split('T')[0]) {
          continue;
        }
        final holidayUtc = DateTime.utc(
          holidayDate.year,
          holidayDate.month,
          holidayDate.day,
        );
        final ordinal = holidayUtc.difference(epoch).inDays;
        if (ordinal > startOrdinal &&
            ordinal <= endOrdinal &&
            workingDaysOfWeek.contains(holidayUtc.weekday)) {
          count--;
        }
      }
    }

    return count;
  }
}

/// CPM Calculation Result packet
class CpmScheduleResult {
  final bool success;
  final String? errorMessage;
  final List<String> cyclicTaskIds;
  final Map<String, CpmTask> computedTasks;
  final List<String> criticalPathTaskIds;
  final DateTime? projectStartDate;
  final DateTime? projectFinishDate;
  final int totalDurationDays;
  final double elapsedMicroseconds;

  const CpmScheduleResult({
    required this.success,
    this.errorMessage,
    this.cyclicTaskIds = const [],
    this.computedTasks = const {},
    this.criticalPathTaskIds = const [],
    this.projectStartDate,
    this.projectFinishDate,
    this.totalDurationDays = 0,
    required this.elapsedMicroseconds,
  });

  double get elapsedMs => elapsedMicroseconds / 1000.0;
}

/// Abstract contract for CPM scheduling engines (M01-T08)
abstract class CpmKernel {
  void loadNetwork({
    required List<CpmTask> tasks,
    required List<CpmDependency> dependencies,
    CpmCalendar calendar = const CpmCalendar(),
  });

  CpmScheduleResult calculateSchedule({DateTime? projectStartDate});
}
