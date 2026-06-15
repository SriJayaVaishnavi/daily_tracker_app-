import { describe, it, expect } from 'vitest';
import { fallbackSchedules } from '@/lib/schedule';
import type { ParsedGoal } from '@/lib/goal-parse';

const habit = (title: string): ParsedGoal => ({ goal_type: 'habit', title });

describe('fallbackSchedules', () => {
  it('returns three named plans for habit goals', () => {
    const plans = fallbackSchedules([habit('pills'), habit('aws'), habit('tea')]);
    expect(plans).toHaveLength(3);
    expect(plans.map((p) => p.id)).toEqual(['morning', 'evening', 'spread']);
    for (const p of plans) expect(p.assignments).toHaveLength(3);
  });
  it('assigns morning-slot times in the morning plan', () => {
    const plans = fallbackSchedules([habit('pills'), habit('aws')]);
    const morning = plans.find((p) => p.id === 'morning')!;
    expect(morning.assignments[0].scheduled_time < '12:00').toBe(true);
  });
  it('is deterministic', () => {
    const goals = [habit('a'), habit('b'), habit('c')];
    expect(fallbackSchedules(goals)).toEqual(fallbackSchedules(goals));
  });
  it('excludes project goals from assignments', () => {
    const goals: ParsedGoal[] = [habit('pills'), { goal_type: 'project', title: 'read book' }];
    const plans = fallbackSchedules(goals);
    for (const p of plans) {
      expect(p.assignments.every((a) => a.goalIndex === 0)).toBe(true);
    }
  });
  it('returns [] when there are no habit goals', () => {
    expect(fallbackSchedules([{ goal_type: 'project', title: 'x' }])).toEqual([]);
  });
  it('keeps a goal’s pre-set scheduled_time', () => {
    const goals: ParsedGoal[] = [{ goal_type: 'habit', title: 'pills', scheduled_time: '06:15' }];
    const plans = fallbackSchedules(goals);
    expect(plans[0].assignments[0].scheduled_time).toBe('06:15');
  });
});
