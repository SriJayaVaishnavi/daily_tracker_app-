'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { LogStatus } from '@/lib/database.types';

/** Resolve the current user id and their local "today" (YYYY-MM-DD). */
async function userTzToday(): Promise<{ userId: string; todayIso: string }> {
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
  const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  return { userId: user.id, todayIso };
}

export async function logHabit(taskId: string, status: LogStatus, value?: number) {
  const supabase = await createClient();
  const { userId, todayIso } = await userTzToday();
  const { error } = await supabase.from('task_logs').upsert(
    { user_id: userId, task_id: taskId, log_date: todayIso, status, value: value ?? null, note: null },
    { onConflict: 'task_id,log_date' },
  );
  if (error) throw error;
  revalidatePath('/');
}

export async function clearHabit(taskId: string) {
  const supabase = await createClient();
  const { todayIso } = await userTzToday();
  const { error } = await supabase
    .from('task_logs')
    .delete()
    .eq('task_id', taskId)
    .eq('log_date', todayIso);
  if (error) throw error;
  revalidatePath('/');
}

export async function logProgress(goalId: string, valueAdded: number, note?: string) {
  const supabase = await createClient();
  const { userId, todayIso } = await userTzToday();
  const { error } = await supabase.from('progress_logs').insert({
    user_id: userId,
    goal_id: goalId,
    log_date: todayIso,
    value_added: valueAdded,
    note: note ?? null,
  });
  if (error) throw error;
  revalidatePath('/');
}

export async function logMood(input: {
  mood: number;
  energy?: number;
  gratitude?: string;
  note?: string;
}) {
  const supabase = await createClient();
  const { userId, todayIso } = await userTzToday();
  const { error } = await supabase.from('mood_logs').upsert(
    {
      user_id: userId,
      log_date: todayIso,
      mood: input.mood,
      energy: input.energy ?? null,
      gratitude: input.gratitude ?? null,
      note: input.note ?? null,
    },
    { onConflict: 'user_id,log_date' },
  );
  if (error) throw error;
  revalidatePath('/');
  revalidatePath('/mood');
}
