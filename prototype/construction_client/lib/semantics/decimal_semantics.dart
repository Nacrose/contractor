/// Exact fixed-scale decimal parsing for values crossing calculation boundaries.
///
/// This parser never routes through `double`. Extra fractional digits are
/// accepted only when they are zero; values that need rounding are rejected.
BigInt parseDecimalToScaledInteger(String input, {required int scale}) {
  if (scale < 0) throw ArgumentError.value(scale, 'scale', 'must be non-negative');
  final match = RegExp(r'^([+-]?)(\d+)(?:\.(\d+))?$').firstMatch(input);
  if (match == null) throw FormatException('Invalid decimal string', input);

  final sign = match.group(1) == '-' ? -1 : 1;
  final whole = match.group(2)!;
  var fraction = match.group(3) ?? '';
  if (fraction.length > scale) {
    final excess = fraction.substring(scale);
    if (excess.split('').any((digit) => digit != '0')) {
      throw FormatException('Decimal cannot be represented exactly at scale $scale', input);
    }
    fraction = fraction.substring(0, scale);
  }

  final scaledDigits = '$whole${fraction.padRight(scale, '0')}';
  final magnitude = BigInt.parse(scaledDigits);
  return sign < 0 ? -magnitude : magnitude;
}
