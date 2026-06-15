import type { RecurrenceType } from '@/lib/database.types';
import type { ParsedGoal } from '@/lib/goal-parse';

export interface ScheduleAssignment {
  goalIndex: number;
  scheduled_time: string; // 'HH:MM'
  recurrence_type: RecurrenceType;
  weekdays?: number[];
}

export interface SchedulePlan {
  id: string;
  name: string;
  emoji: string;
  assignments: ScheduleAssignment[];
}

const MORNING = ['07:00', '08:00', '09:00', '10:00'];
const MIDDAY = ['12:00', '13:00', '14:00'];
const EVENING = ['19:00', '20:00', '21:00'];

function planFor(
  id: string,
  name: string,
  emoji: string,
  times: string[],
  goals: ParsedGoal[],
  habitIdx: number[],
): SchedulePlan {
  const assignments = habitIdx.map((gi, k) => ({
    goalIndex: gi,
    scheduled_time: goals[gi].scheduled_time ?? times[k % times.length],
    recurrence_type: goals[gi].recurrence_type ?? ('daily' as RecurrenceType),
    weekdays: goals[gi].weekdays,
  }));
  return { id, name, emoji, assignments };
}

/**
 * Deterministic schedule suggestions: spread habit goals across morning,
 * evening, or mixed time slots. Projects are excluded (they keep due dates).
 * Goals that already have a scheduled_time keep it. Returns [] when no habits.
 */
export function fallbackSchedules(goals: ParsedGoal[]): SchedulePlan[] {
  const habitIdx = goals
    .map((g, i) => (g.goal_type === 'habit' ? i : -1))
    .filter((i) => i >= 0);
  if (habitIdx.length === 0) return [];

  return [
    planFor('morning', 'Morning focus', '🌅', MORNING, goals, habitIdx),
    planFor('evening', 'Evening wind-down', '🌙', EVENING, goals, habitIdx),
    planFor(
      'spread',
      'Spread out',
      '⚖️',
      [MORNING[1], MIDDAY[0], EVENING[1], MORNING[2], MIDDAY[1], EVENING[2]],
      goals,
      habitIdx,
    ),
  ];
}
