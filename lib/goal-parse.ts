import type { GoalType, RecurrenceType } from '@/lib/database.types';

const GOAL_TYPES: readonly GoalType[] = ['habit', 'project'];
const RECURRENCE_TYPES: readonly RecurrenceType[] = ['daily', 'weekly_days', 'weekly_count'];

/**
 * The structured shape extracted from a natural-language goal description.
 * A partial view of a goal: `period_month` is intentionally absent (it defaults
 * to the current month via its own chip). Every field except `goal_type` and
 * `title` is optional — missing fields surface as empty chips for the user.
 */
export interface ParsedGoal {
  goal_type: GoalType;
  title: string;
  category?: string;
  description?: string;
  // habit scheduling
  recurrence_type?: RecurrenceType;
  weekdays?: number[]; // 0=Sun .. 6=Sat
  target_count?: number; // for weekly_count
  scheduled_time?: string; // 'HH:MM'
  // measurable target (optional for habit, required for project)
  target_value?: number;
  unit?: string;
  // project
  due_date?: string; // 'YYYY-MM-DD'
}

/**
 * Validate and clamp an untrusted object (e.g. raw LLM JSON) into a `ParsedGoal`.
 * Unknown enum values and malformed fields are dropped rather than trusted, so a
 * bad model response can never produce an invalid goal write. `rawText` is the
 * user's original input, used as the title fallback.
 */
export function coerceParsedGoal(input: unknown, rawText: string): ParsedGoal {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const fallbackTitle = rawText.trim();

  const goal_type = GOAL_TYPES.includes(o.goal_type as GoalType)
    ? (o.goal_type as GoalType)
    : 'habit';

  const titleRaw = typeof o.title === 'string' ? o.title.trim() : '';
  const title = titleRaw || fallbackTitle;

  const result: ParsedGoal = { goal_type, title };

  if (typeof o.category === 'string' && o.category.trim()) result.category = o.category.trim();
  if (typeof o.description === 'string' && o.description.trim())
    result.description = o.description.trim();

  if (RECURRENCE_TYPES.includes(o.recurrence_type as RecurrenceType)) {
    result.recurrence_type = o.recurrence_type as RecurrenceType;
  }

  if (Array.isArray(o.weekdays)) {
    const valid = o.weekdays.filter(
      (d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6,
    ) as number[];
    const days = Array.from(new Set(valid)).sort((a, b) => a - b);
    if (days.length > 0) result.weekdays = days;
  }

  const count = toPositiveNumber(o.target_count);
  if (count !== undefined) result.target_count = count;

  const value = toPositiveNumber(o.target_value);
  if (value !== undefined) result.target_value = value;

  if (typeof o.unit === 'string' && o.unit.trim()) result.unit = o.unit.trim();

  if (typeof o.scheduled_time === 'string' && /^\d{2}:\d{2}$/.test(o.scheduled_time)) {
    result.scheduled_time = o.scheduled_time;
  }

  if (typeof o.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.due_date)) {
    result.due_date = o.due_date;
  }

  return result;
}

function toPositiveNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined;
}
