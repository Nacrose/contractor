/**
 * Date-Only Semantics & Timezone Drift Protection (M09-T02).
 *
 * Construction schedules operate strictly on calendar dates (YYYY-MM-DD),
 * not timestamps with timezone offsets. Converting a construction start date
 * using browser/ambient timezones causes off-by-one errors (e.g. 2026-10-12
 * in UTC shifting to 2026-10-11 in US PST or 2026-10-12 05:45 in Nepal).
 *
 * This module guarantees zero timezone drift across all environments.
 */

export type DateOnlyString = string; // Format: YYYY-MM-DD

export class DateOnly {
  private static readonly DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

  /**
   * Validates that a string is a well-formed ISO calendar date (YYYY-MM-DD).
   */
  static isValid(dateStr: string): boolean {
    if (typeof dateStr !== 'string') return false;
    const match = this.DATE_REGEX.exec(dateStr);
    if (!match) return false;

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);

    if (year < 1900 || year > 2200) return false;
    if (month < 1 || month > 12) return false;

    const daysInMonth = this.getDaysInMonth(year, month);
    return day >= 1 && day <= daysInMonth;
  }

  static assertValid(dateStr: string): DateOnlyString {
    if (!this.isValid(dateStr)) {
      throw new Error(`Invalid DateOnly string: "${dateStr}". Expected ISO format YYYY-MM-DD.`);
    }
    return dateStr;
  }

  static getDaysInMonth(year: number, month: number): number {
    const leap = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return days[month - 1];
  }

  /**
   * Converts a date string to a continuous epoch day number (pure integer arithmetic).
   * Completely independent of Date object or local timezone.
   */
  static toEpochDays(dateStr: DateOnlyString): number {
    this.assertValid(dateStr);
    const [y, m, d] = dateStr.split('-').map(Number);
    // Formula from Fliegel & Van Flandern (1968) for Gregorian day number
    const a = Math.floor((14 - m) / 12);
    const yPrime = y + 4800 - a;
    const mPrime = m + 12 * a - 3;
    const jdn = d + Math.floor((153 * mPrime + 2) / 5) + 365 * yPrime +
      Math.floor(yPrime / 4) - Math.floor(yPrime / 100) + Math.floor(yPrime / 400) - 32045;
    return jdn;
  }

  /**
   * Converts an epoch day number back to YYYY-MM-DD string.
   */
  static fromEpochDays(jdn: number): DateOnlyString {
    const a = jdn + 32044;
    const b = Math.floor((4 * a + 3) / 146097);
    const c = a - Math.floor((146097 * b) / 4);
    const d = Math.floor((4 * c + 3) / 1461);
    const e = c - Math.floor((1461 * d) / 4);
    const m = Math.floor((5 * e + 2) / 153);
    const day = e - Math.floor((153 * m + 2) / 5) + 1;
    const month = m + 3 - 12 * Math.floor(m / 10);
    const year = 100 * b + d - 4800 + Math.floor(m / 10);

    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  }

  static addDays(dateStr: DateOnlyString, days: number): DateOnlyString {
    const jdn = this.toEpochDays(dateStr);
    return this.fromEpochDays(jdn + days);
  }

  static diffDays(dateA: DateOnlyString, dateB: DateOnlyString): number {
    return this.toEpochDays(dateA) - this.toEpochDays(dateB);
  }

  /**
   * Compares two dates: -1 if a < b, 0 if a == b, 1 if a > b.
   */
  static compare(a: DateOnlyString, b: DateOnlyString): number {
    this.assertValid(a);
    this.assertValid(b);
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  /**
   * Day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday).
   */
  static getDayOfWeek(dateStr: DateOnlyString): number {
    const jdn = this.toEpochDays(dateStr);
    return (jdn + 1) % 7;
  }
}
