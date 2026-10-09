/// Display-only Nepali rupee formatter (MONEY-01).
///
/// A decimal string avoids binary floating-point conversion for large contract
/// amounts. This function formats text only; services remain responsible for
/// calculating and validating authoritative financial values.
String formatNpr(String decimal, {String prefix = 'Rs.', int decimals = 2}) {
  if (decimals < 0 || decimals > 12) {
    throw ArgumentError.value(
      decimals,
      'decimals',
      'Must be between 0 and 12.',
    );
  }
  final match = RegExp(r'^([+-]?)(\d+)(?:\.(\d+))?$')
      .firstMatch(decimal.trim());
  if (match == null) return '—';

  final integer = match.group(2)!.replaceFirst(RegExp(r'^0+(?=\d)'), '');
  final fraction = match.group(3) ?? '';
  final roundedFraction = _roundFraction(fraction, decimals);
  final groupedInteger = roundedFraction.$1
      ? _groupSouthAsian(_increment(integer))
      : _groupSouthAsian(integer);
  final value = decimals == 0
      ? groupedInteger
      : '$groupedInteger.${roundedFraction.$2}';
  final displaysZero =
      integer == '0' &&
      !roundedFraction.$1 &&
      (decimals == 0 || RegExp(r'^0+$').hasMatch(roundedFraction.$2));
  final sign = match.group(1) == '-' && !displaysZero ? '-' : '';
  final prefixText = prefix == 'none' || prefix.isEmpty ? '' : '$prefix ';
  return '$sign$prefixText$value';
}

String _groupSouthAsian(String digits) {
  if (digits.length <= 3) return digits;
  final tail = digits.substring(digits.length - 3);
  var leading = digits.substring(0, digits.length - 3);
  final groups = <String>[];
  while (leading.length > 2) {
    groups.insert(0, leading.substring(leading.length - 2));
    leading = leading.substring(0, leading.length - 2);
  }
  groups.insert(0, leading);
  return '${groups.join(',')},$tail';
}

(bool, String) _roundFraction(String fraction, int decimals) {
  if (decimals == 0) {
    return (fraction.isNotEmpty && fraction[0].compareTo('5') >= 0, '');
  }
  final padded = fraction.padRight(decimals + 1, '0');
  final kept = padded.substring(0, decimals);
  if (padded[decimals].compareTo('5') < 0) return (false, kept);

  final bytes = kept.codeUnits.toList();
  for (var index = bytes.length - 1; index >= 0; index--) {
    if (bytes[index] < 57) {
      bytes[index]++;
      return (false, String.fromCharCodes(bytes));
    }
    bytes[index] = 48;
  }
  return (true, String.fromCharCodes(bytes));
}

String _increment(String digits) {
  final bytes = digits.codeUnits.toList();
  for (var index = bytes.length - 1; index >= 0; index--) {
    if (bytes[index] < 57) {
      bytes[index]++;
      return String.fromCharCodes(bytes);
    }
    bytes[index] = 48;
  }
  return '1${String.fromCharCodes(bytes)}';
}
