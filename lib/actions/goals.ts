'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { GoalType, GoalStatus, RecurrenceType } from '@/lib/database.types';

export interface GoalInput {
  title: string;
  description?: string;
  category?: string;
  goal_type: GoalType;
  period_month: string; // YYYY-MM-01
  recurrence_type?: RecurrenceType;
  weekdays?: number[];
  target_count?: number;
  scheduled_time?: string;
  target_value?: number;
  unit?: string;
  due_date?: string;
}

/** Last calendar day of the month that `periodMonth` (YYYY-MM-01) falls in. */
function lastDayOfMonth(periodMonth: string): string {
  const d = new Date(periodMonth + 'T00:00:00Z');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
}

export async function createGoal(input: GoalInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');

  const due_date =
    input.goal_type === 'project'
      ? input.due_date ?? lastDayOfMonth(input.period_month)
      : null;

  const { error } = await supabase.from('goals').insert({
    user_id: user.id,
    title: input.title,
    description: input.description ?? null,
    category: input.category ?? null,
    goal_type: input.goal_type,
    period_month: input.period_month,
    status: 'active',
    recurrence_type: input.recurrence_type ?? null,
    weekdays: input.weekdays ?? null,
    target_count: input.target_count ?? null,
    scheduled_time: input.scheduled_time ?? null,
    target_value: input.target_value ?? null,
    unit: input.unit ?? null,
    due_date,
  });
  if (error) throw error;

  revalidatePath('/');
  revalidatePath('/goals');
  redirect('/goals');
}

export async function updateGoal(id: string, patch: Partial<GoalInput>) {
  const supabase = await createClient();
  const { error } = await supabase.from('goals').update(patch).eq('id', id);
  if (error) throw error;
  revalidatePath('/');
  revalidatePath('/goals');
  revalidatePath(`/goals/${id}`);
}

export async function setGoalStatus(id: string, status: GoalStatus) {
  const supabase = await createClient();
  const { error } = await supabase.from('goals').update({ status }).eq('id', id);
  if (error) throw error;
  revalidatePath('/');
  revalidatePath('/goals');
}

export async function deleteGoal(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('goals').delete().eq('id', id);
  if (error) throw error;
  revalidatePath('/');
  revalidatePath('/goals');
  redirect('/goals');
}
