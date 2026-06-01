import { describe, it, expect } from 'vitest';
import {
  weekdayOf,
  daysBetween,
  expectedSoFar,
  isHabitDueToday,
  localDateIso,
} from '@/lib/recurrence';

describe('weekdayOf', () => {
  it('returns 0..6 with Sunday=0 in the given tz', () => {
    // 2026-06-07 is a Sunday, 2026-06-08 a Monday
    expect(weekdayOf(new Date('2026-06-07T12:00:00Z'), 'Asia/Kolkata')).toBe(0);
    expect(weekdayOf(new Date('2026-06-08T12:00:00Z'), 'Asia/Kolkata')).toBe(1);
  });
});

describe('localDateIso', () => {
  it('rolls to the next day for late-UTC instants in +05:30', () => {
    // 2026-06-08T20:00:00Z is 2026-06-09 01:30 IST
    expect(localDateIso(new Date('2026-06-08T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-06-09');
  });
});

describe('daysBetween', () => {
  it('counts whole days between two ISO dates', () => {
    expect(daysBetween('2026-06-01', '2026-06-30')).toBe(29);
    expect(daysBetween('2026-06-01', '2026-06-01')).toBe(0);
  });
});

describe('expectedSoFar', () => {
  it('linearly prorates target across the period', () => {
    const goal = { period_month: '2026-06-01', due_date: '2026-06-30', target_value: 300 };
    const v = expectedSoFar(goal, new Date('2026-06-16T12:00:00+05:30'), 'Asia/Kolkata');
    expect(v).toBeGreaterThan(140);
    expect(v).toBeLessThan(170);
  });

  it('returns 0 when target or due date is missing', () => {
    expect(expectedSoFar({ period_month: '2026-06-01', due_date: null, target_value: 100 }, new Date(), 'Asia/Kolkata')).toBe(0);
    expect(expectedSoFar({ period_month: '2026-06-01', due_date: '2026-06-30', target_value: null }, new Date(), 'Asia/Kolkata')).toBe(0);
  });
});

describe('isHabitDueToday', () => {
  it('daily is always due', () => {
    expect(
      isHabitDueToday({ recurrence_type: 'daily', weekdays: null }, new Date('2026-06-08T12:00:00Z'), 'Asia/Kolkata'),
    ).toBe(true);
  });

  it('weekly_days is due only on listed weekdays', () => {
    const t = { recurrence_type: 'weekly_days' as const, weekdays: [1, 3, 5] }; // Mon/Wed/Fri
    expect(isHabitDueToday(t, new Date('2026-06-08T12:00:00Z'), 'Asia/Kolkata')).toBe(true); // Mon
    expect(isHabitDueToday(t, new Date('2026-06-07T12:00:00Z'), 'Asia/Kolkata')).toBe(false); // Sun
  });

  it('weekly_count defers to caller (always due here)', () => {
    expect(
      isHabitDueToday({ recurrence_type: 'weekly_count', weekdays: null }, new Date('2026-06-08T12:00:00Z'), 'Asia/Kolkata'),
    ).toBe(true);
  });
});
