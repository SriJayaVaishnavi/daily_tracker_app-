import { describe, it, expect } from 'vitest';
import { coerceParsedGoal } from '@/lib/goal-parse';

describe('coerceParsedGoal', () => {
  it('passes a well-formed object through', () => {
    const r = coerceParsedGoal(
      {
        goal_type: 'habit',
        title: 'Meditate',
        recurrence_type: 'daily',
        target_value: 10,
        unit: 'min',
        scheduled_time: '08:00',
      },
      'meditate 10 min every morning',
    );
    expect(r).toMatchObject({
      goal_type: 'habit',
      title: 'Meditate',
      recurrence_type: 'daily',
      target_value: 10,
      unit: 'min',
      scheduled_time: '08:00',
    });
  });

  it('defaults an unknown goal_type to habit', () => {
    const r = coerceParsedGoal({ goal_type: 'banana', title: 'x' }, 'x');
    expect(r.goal_type).toBe('habit');
  });

  it('drops an invalid recurrence_type', () => {
    const r = coerceParsedGoal({ goal_type: 'habit', title: 'x', recurrence_type: 'hourly' }, 'x');
    expect(r.recurrence_type).toBeUndefined();
  });

  it('filters weekdays to unique integers 0..6', () => {
    const r = coerceParsedGoal(
      { goal_type: 'habit', title: 'x', weekdays: [1, 1, 7, -2, 3, 'foo'] },
      'x',
    );
    expect(r.weekdays).toEqual([1, 3]);
  });

  it('drops negative or non-numeric target_value', () => {
    expect(coerceParsedGoal({ goal_type: 'habit', title: 'x', target_value: -5 }, 'x').target_value).toBeUndefined();
    expect(coerceParsedGoal({ goal_type: 'habit', title: 'x', target_value: 'lots' }, 'x').target_value).toBeUndefined();
  });

  it('drops a malformed scheduled_time', () => {
    expect(coerceParsedGoal({ goal_type: 'habit', title: 'x', scheduled_time: '8am' }, 'x').scheduled_time).toBeUndefined();
    expect(coerceParsedGoal({ goal_type: 'habit', title: 'x', scheduled_time: '08:00' }, 'x').scheduled_time).toBe('08:00');
  });

  it('drops a malformed due_date', () => {
    expect(coerceParsedGoal({ goal_type: 'project', title: 'x', due_date: 'Dec 31' }, 'x').due_date).toBeUndefined();
    expect(coerceParsedGoal({ goal_type: 'project', title: 'x', due_date: '2026-12-31' }, 'x').due_date).toBe('2026-12-31');
  });

  it('falls back to raw text when title is empty or missing', () => {
    expect(coerceParsedGoal({ goal_type: 'habit', title: '   ' }, 'my raw goal').title).toBe('my raw goal');
    expect(coerceParsedGoal({ goal_type: 'habit' }, 'my raw goal').title).toBe('my raw goal');
  });

  it('returns a safe default for non-object input', () => {
    const r = coerceParsedGoal(null, 'just do it');
    expect(r).toMatchObject({ goal_type: 'habit', title: 'just do it' });
  });
});
