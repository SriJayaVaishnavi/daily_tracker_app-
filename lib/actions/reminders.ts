'use server';

import { createClient } from '@/lib/supabase/server';
import { computeNextFireAt } from '@/lib/reminders';
import type { ReminderKind } from '@/lib/database.types';

async function userTz(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string> {
  const { data } = await supabase.from('profiles').select('timezone').eq('id', userId).single();
  return data?.timezone ?? 'Asia/Kolkata';
}

/**
 * Ensure the `task` reminder for a habit goal's task matches the task's current
 * schedule. Creates, updates, or removes the reminder as appropriate. Called
 * from createGoal/updateGoal. Task deletion is handled by the FK cascade.
 */
export async function syncTaskReminder(goalId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');

  const { data: task } = await supabase
    .from('tasks')
    .select('*')
    .eq('goal_id', goalId)
    .maybeSingle();

  const { data: existing } = task
    ? await supabase
        .from('reminders')
        .select('*')
        .eq('task_id', task.id)
        .eq('kind', 'task')
        .maybeSingle()
    : { data: null };

  const tz = await userTz(supabase, user.id);
  const nextFire =
    task && task.scheduled_time && task.is_active
      ? computeNextFireAt(task.scheduled_time, task.recurrence_type, task.weekdays, tz, new Date())
      : null;

  if (!task || !nextFire) {
    if (existing) await supabase.from('reminders').delete().eq('id', existing.id);
    return;
  }

  const fields = {
    title_template: task.title,
    // Non-null: nextFire is only computed when scheduled_time is truthy.
    scheduled_time: task.scheduled_time!,
    recurrence_type: task.recurrence_type,
    weekdays: task.weekdays,
    next_fire_at: nextFire.toISOString(),
    is_enabled: true,
  };

  if (existing) {
    await supabase.from('reminders').update(fields).eq('id', existing.id);
  } else {
    await supabase
      .from('reminders')
      .insert({ user_id: user.id, task_id: task.id, kind: 'task', ...fields });
  }
}

async function setSingletonReminder(
  kind: Exclude<ReminderKind, 'task'>,
  enabled: boolean,
  time: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');

  const { data: existing } = await supabase
    .from('reminders')
    .select('*')
    .eq('user_id', user.id)
    .eq('kind', kind)
    .maybeSingle();

  if (!enabled) {
    if (existing) {
      await supabase.from('reminders').update({ is_enabled: false }).eq('id', existing.id);
    }
    return;
  }

  const tz = await userTz(supabase, user.id);
  const nextFire = computeNextFireAt(time, 'daily', null, tz, new Date());
  if (!nextFire) return;

  const fields = {
    scheduled_time: time,
    recurrence_type: 'daily' as const,
    weekdays: null,
    next_fire_at: nextFire.toISOString(),
    is_enabled: true,
  };

  if (existing) {
    await supabase.from('reminders').update(fields).eq('id', existing.id);
  } else {
    await supabase
      .from('reminders')
      .insert({ user_id: user.id, task_id: null, kind, title_template: null, ...fields });
  }
}

export async function setDailyBriefReminder(enabled: boolean, time: string): Promise<void> {
  await setSingletonReminder('daily_brief', enabled, time);
}

export async function setMoodReminder(enabled: boolean, time: string): Promise<void> {
  await setSingletonReminder('mood_checkin', enabled, time);
}

export interface ReminderRow {
  enabled: boolean;
  time: string;
}

export async function getReminderSettings(): Promise<{
  dailyBrief: ReminderRow;
  mood: ReminderRow;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');

  const { data: rows } = await supabase
    .from('reminders')
    .select('kind, scheduled_time, is_enabled')
    .eq('user_id', user.id)
    .in('kind', ['daily_brief', 'mood_checkin']);

  const find = (kind: ReminderKind): ReminderRow => {
    const r = (rows ?? []).find((x) => x.kind === kind);
    return {
      enabled: !!r?.is_enabled,
      time: (r?.scheduled_time ?? '07:00:00').slice(0, 5),
    };
  };

  return { dailyBrief: find('daily_brief'), mood: find('mood_checkin') };
}
