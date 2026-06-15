import { describe, it, expect } from 'vitest';
import { fallbackParse } from '@/lib/parse-goal-fallback';

describe('fallbackParse — recurrence', () => {
  it('detects a daily habit and extracts a measurable target', () => {
    const r = fallbackParse('meditate 10 minutes every day');
    expect(r.goal_type).toBe('habit');
    expect(r.recurrence_type).toBe('daily');
    expect(r.target_value).toBe(10);
    expect(r.unit).toBe('min');
    expect(r.title).toBe('meditate');
  });

  it('detects weekly_days from weekday names', () => {
    const r = fallbackParse('gym on mon, wed and fri');
    expect(r.recurrence_type).toBe('weekly_days');
    expect(r.weekdays).toEqual([1, 3, 5]);
    expect(r.title).toBe('gym');
  });

  it('detects weekly_count from "Nx per week"', () => {
    const r = fallbackParse('run 3x per week');
    expect(r.recurrence_type).toBe('weekly_count');
    expect(r.target_count).toBe(3);
    expect(r.title).toBe('run');
  });
});

describe('fallbackParse — time of day', () => {
  it('maps "morning" to 08:00 and stays daily', () => {
    const r = fallbackParse('journal every morning');
    expect(r.recurrence_type).toBe('daily');
    expect(r.scheduled_time).toBe('08:00');
    expect(r.title).toBe('journal');
  });

  it('parses an explicit am time to HH:MM', () => {
    const r = fallbackParse('stretch daily at 7am');
    expect(r.scheduled_time).toBe('07:00');
  });

  it('parses an explicit pm time with minutes to 24h', () => {
    const r = fallbackParse('read at 9:30pm');
    expect(r.scheduled_time).toBe('21:30');
  });
});

describe('fallbackParse — projects & units', () => {
  it('treats an explicit due date as a project and extracts unit', () => {
    const r = fallbackParse('read 12 books by 2026-12-31');
    expect(r.goal_type).toBe('project');
    expect(r.target_value).toBe(12);
    expect(r.unit).toBe('books');
    expect(r.due_date).toBe('2026-12-31');
    expect(r.title).toBe('read');
  });
});

describe('fallbackParse — defaults', () => {
  it('falls back to a habit with the raw text as title when nothing matches', () => {
    const r = fallbackParse('get healthy');
    expect(r.goal_type).toBe('habit');
    expect(r.title).toBe('get healthy');
    expect(r.recurrence_type).toBeUndefined();
  });
});
