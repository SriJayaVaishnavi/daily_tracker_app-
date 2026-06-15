import type { ParsedGoal } from '@/lib/goal-parse';
import type { RecurrenceType } from '@/lib/database.types';
import { fallbackSchedules, type SchedulePlan, type ScheduleAssignment } from '@/lib/schedule';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const RECURRENCES: RecurrenceType[] = ['daily', 'weekly_days', 'weekly_count'];

const SYSTEM = `You are a gentle daily-routine planner. Given a list of goals (0-indexed), propose 2-3 whole-day schedules.
Return ONLY JSON: { "plans": [ { "id": string, "name": string, "emoji": string, "assignments": [ { "goalIndex": number, "scheduled_time": "HH:MM", "recurrence_type": "daily"|"weekly_days"|"weekly_count", "weekdays": [0-6]? } ] } ] }.
Only assign times to habit goals. Use realistic, humane times. Each plan should cover every habit goal once.`;

function coercePlans(raw: unknown, goals: ParsedGoal[]): SchedulePlan[] {
  const arr = Array.isArray((raw as { plans?: unknown[] })?.plans)
    ? (raw as { plans: unknown[] }).plans
    : [];
  const plans: SchedulePlan[] = [];
  for (const p of arr) {
    const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
    const rawAssigns = Array.isArray(o.assignments) ? o.assignments : [];
    const assignments: ScheduleAssignment[] = [];
    for (const a of rawAssigns) {
      const ao = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
      const gi = ao.goalIndex;
      const t = ao.scheduled_time;
      if (typeof gi !== 'number' || gi < 0 || gi >= goals.length) continue;
      if (typeof t !== 'string' || !/^\d{2}:\d{2}$/.test(t)) continue;
      const rt = RECURRENCES.includes(ao.recurrence_type as RecurrenceType)
        ? (ao.recurrence_type as RecurrenceType)
        : 'daily';
      const wd = Array.isArray(ao.weekdays)
        ? (ao.weekdays.filter((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6) as number[])
        : undefined;
      assignments.push({ goalIndex: gi, scheduled_time: t, recurrence_type: rt, weekdays: wd });
    }
    if (assignments.length === 0) continue;
    plans.push({
      id: typeof o.id === 'string' && o.id ? o.id : `plan-${plans.length}`,
      name: typeof o.name === 'string' && o.name ? o.name : 'Plan',
      emoji: typeof o.emoji === 'string' && o.emoji ? o.emoji : '🗓️',
      assignments,
    });
  }
  return plans;
}

/** Recommend whole-day schedules. Groq when keyed; deterministic fallback otherwise. */
export async function recommendSchedules(
  goals: ParsedGoal[],
): Promise<{ plans: SchedulePlan[]; source: 'llm' | 'fallback' }> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { plans: fallbackSchedules(goals), source: 'fallback' };

  try {
    const userMsg = JSON.stringify(
      goals.map((g, i) => ({ index: i, goal_type: g.goal_type, title: g.title })),
    );
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userMsg },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { plans: fallbackSchedules(goals), source: 'fallback' };
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return { plans: fallbackSchedules(goals), source: 'fallback' };
    const plans = coercePlans(JSON.parse(content), goals);
    if (plans.length === 0) return { plans: fallbackSchedules(goals), source: 'fallback' };
    return { plans, source: 'llm' };
  } catch {
    return { plans: fallbackSchedules(goals), source: 'fallback' };
  }
}
