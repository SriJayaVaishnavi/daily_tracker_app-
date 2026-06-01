import { toZonedTime, formatInTimeZone } from 'date-fns-tz';

/** The user-local calendar date of an instant, as `YYYY-MM-DD`. */
export function localDateIso(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, 'yyyy-MM-dd');
}

/** Sunday=0 .. Saturday=6, in the user's timezone. */
export function weekdayOf(date: Date, tz: string): number {
  return toZonedTime(date, tz).getDay();
}

/** Whole days from ISO date `a` to ISO date `b` (b - a). */
export function daysBetween(a: string, b: string): number {
  const ms =
    new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime();
  return Math.round(ms / 86_400_000);
}

/** Linearly prorated expected progress for a project goal at `today`. */
export function expectedSoFar(
  goal: { period_month: string; due_date: string | null; target_value: number | null },
  today: Date,
  tz: string,
): number {
  if (!goal.target_value || !goal.due_date) return 0;
  const todayIso = localDateIso(today, tz);
  const total = Math.max(1, daysBetween(goal.period_month, goal.due_date));
  const elapsed = Math.min(total, Math.max(0, daysBetween(goal.period_month, todayIso)));
  return goal.target_value * (elapsed / total);
}

/**
 * Whether a habit task is due on `today`.
 * For `weekly_count` this returns true (quota check is the caller's job).
 */
export function isHabitDueToday(
  t: { recurrence_type: 'daily' | 'weekly_days' | 'weekly_count'; weekdays: number[] | null },
  today: Date,
  tz: string,
): boolean {
  if (t.recurrence_type === 'daily') return true;
  if (t.recurrence_type === 'weekly_days') return !!t.weekdays?.includes(weekdayOf(today, tz));
  return true;
}
