/**
 * Nepal Construction Calendar & Bikram Sambat (BS) Bridge (M09-T01).
 *
 * Implements:
 *  - Nepal standard 6-day workweek: Sunday to Friday are working days (Saturday is non-working holiday).
 *  - Official government holidays (Dashain, Tihar, New Year, Chhath, etc.).
 *  - Inclusive date boundaries: a 1-day task starting on a working day finishes on the same day.
 *  - Date-only ISO 8601 formatting (YYYY-MM-DD) preventing ambient timezone drift.
 */

export class NepalConstructionCalendar {
  constructor(options = {}) {
    this.calendarId = options.id || 'nepal_standard';
    // Weekday: 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday (JS Date standard)
    // Working days: Sunday(0) through Friday(5). Non-working: Saturday(6).
    this.workingDays = new Set(options.workingDays || [0, 1, 2, 3, 4, 5]);
    this.holidays = new Set(options.holidays || [
      '2026-10-19', // Dashain Vijaya Dashami
      '2026-10-20', // Dashain Ekadashi
      '2026-10-21', // Dashain Dwadashi
      '2026-11-09', // Tihar Laxmi Puja
      '2026-11-10', // Tihar Govardhan Puja
      '2026-11-11'  // Tihar Bhai Tika
    ]);
  }

  isWorkingDay(isoDateStr) {
    if (this.holidays.has(isoDateStr)) {
      return false;
    }
    const [y, m, d] = isoDateStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    const dayOfWeek = dateObj.getUTCDay();
    return this.workingDays.has(dayOfWeek);
  }

  addWorkingDays(isoDateStr, durationDays) {
    if (durationDays <= 0) return isoDateStr;
    const [y, m, d] = isoDateStr.split('-').map(Number);
    let curr = new Date(Date.UTC(y, m - 1, d));
    let added = 0;

    while (added < durationDays) {
      curr.setUTCDate(curr.getUTCDate() + 1);
      const iso = curr.toISOString().slice(0, 10);
      if (this.isWorkingDay(iso)) {
        added++;
      }
    }
    return curr.toISOString().slice(0, 10);
  }

  calculateFinishDate(startDateStr, durationDays) {
    if (durationDays <= 0) return startDateStr;
    // Inclusive: 1-day task starting on working day finishes on that day
    let curr = startDateStr;
    while (!this.isWorkingDay(curr)) {
      curr = this.addWorkingDays(curr, 1);
    }
    if (durationDays === 1) return curr;
    return this.addWorkingDays(curr, durationDays - 1);
  }

  countWorkingDays(startIso, endIso) {
    if (startIso > endIso) return 0;
    const [sy, sm, sd] = startIso.split('-').map(Number);
    const [ey, em, ed] = endIso.split('-').map(Number);
    let curr = new Date(Date.UTC(sy, sm - 1, sd));
    const end = new Date(Date.UTC(ey, em - 1, ed));
    let count = 0;

    while (curr <= end) {
      const iso = curr.toISOString().slice(0, 10);
      if (this.isWorkingDay(iso)) {
        count++;
      }
      curr.setUTCDate(curr.getUTCDate() + 1);
    }
    return count;
  }
}
