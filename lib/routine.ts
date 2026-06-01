import { createClient } from '@/lib/supabase/server';
import {
  isHabitDueToday,
  expectedSoFar,
  daysBetween,
  localDateIso,
  weekdayOf,
} from '@/lib/recurrence';
import { pickStoicForDate } from '@/lib/stoic';
import type { Goal, MoodLog, StoicQuote, DailyBrief, RecurrenceType } from '@/lib/database.types';

export interface HabitItem {
  task_id: string;
  goal_id: string;
  title: string;
  recurrence_type: RecurrenceType;
  unit: string | null;
  target_value: number | null;
  status: 'done' | 'skipped' | 'partial' | null;
  weekly_progress?: string;
}

export interface ProjectItem {
  goal_id: string;
  title: string;
  unit: string | null;
  current_value: number;
  target_value: number;
  weekly_target: number;
  on_track: boolean;
  progress: string;
}

export interface Routine {
  tz: string;
  todayIso: string;
  habit: HabitItem[];
  project: ProjectItem[];
  mood: MoodLog | null;
  stoic: StoicQuote | null;
  brief: DailyBrief | null;
}

/** The Sunday-start week's first calendar date, as `YYYY-MM-DD`, in the user's tz. */
function weekStartIso(today: Date, tz: string): string {
  const wd = weekdayOf(today, tz);
  const d = new Date(localDateIso(today, tz) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - wd);
  return d.toISOString().slice(0, 10);
}

/**
 * Deterministically compute today's routine for the current user.
 * Recomputed on every render — there is no stored daily plan.
 */
export async function todayRoutine(today: Date): Promise<Routine> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  const tz = profile?.timezone ?? 'Asia/Kolkata';
  const todayIso = localDateIso(today, tz);

  // Active habit tasks (joined to active goals).
  const { data: tasks } = await supabase
    .from('tasks')
    .select(
      'id, goal_id, title, recurrence_type, weekdays, target_count, target_value, unit, goals!inner(status)',
    )
    .eq('is_active', true)
    .eq('goals.status', 'active');

  const { data: todayLogs } = await supabase
    .from('task_logs')
    .select('*')
    .eq('log_date', todayIso);
  const logByTask = new Map((todayLogs ?? []).map((l) => [l.task_id, l.status]));

  const weekStart = weekStartIso(today, tz);

  const habit: HabitItem[] = [];
  for (const row of tasks ?? []) {
    const t = row as unknown as {
      id: string;
      goal_id: string;
      title: string;
      recurrence_type: RecurrenceType;
      weekdays: number[] | null;
      target_count: number | null;
      target_value: number | null;
      unit: string | null;
    };

    let due = isHabitDueToday(t, today, tz);
    let weekly_progress: string | undefined;

    if (t.recurrence_type === 'weekly_count') {
      const { count } = await supabase
        .from('task_logs')
        .select('id', { count: 'exact', head: true })
        .eq('task_id', t.id)
        .eq('status', 'done')
        .gte('log_date', weekStart);
      const done = count ?? 0;
      due = done < (t.target_count ?? 0);
      weekly_progress = `${done}/${t.target_count ?? 0}`;
    }

    if (!due) continue;

    habit.push({
      task_id: t.id,
      goal_id: t.goal_id,
      title: t.title,
      recurrence_type: t.recurrence_type,
      unit: t.unit,
      target_value: t.target_value,
      status: (logByTask.get(t.id) as HabitItem['status']) ?? null,
      weekly_progress,
    });
  }

  // Active project pace tiles.
  const { data: projects } = await supabase
    .from('goals')
    .select('*')
    .eq('goal_type', 'project')
    .eq('status', 'active');

  const project: ProjectItem[] = (projects ?? []).map((g: Goal) => {
    const target = g.target_value ?? 0;
    const current = g.current_value ?? 0;
    const remaining = Math.max(0, target - current);
    const daysLeft = Math.max(1, daysBetween(todayIso, g.due_date ?? todayIso));
    const weeksLeft = Math.max(1, daysLeft / 7);
    return {
      goal_id: g.id,
      title: g.title,
      unit: g.unit,
      current_value: current,
      target_value: target,
      weekly_target: remaining / weeksLeft,
      on_track: current >= expectedSoFar(g, today, tz),
      progress: `${current} / ${target} ${g.unit ?? ''}`.trim(),
    };
  });

  const { data: mood } = await supabase
    .from('mood_logs')
    .select('*')
    .eq('log_date', todayIso)
    .maybeSingle();

  const { data: quotes } = await supabase.from('stoic_quotes').select('*').order('id');
  const stoic = pickStoicForDate(quotes ?? [], today, tz);

  const { data: brief } = await supabase
    .from('daily_briefs')
    .select('*')
    .eq('brief_date', todayIso)
    .maybeSingle();

  return { tz, todayIso, habit, project, mood: mood ?? null, stoic, brief: brief ?? null };
}
