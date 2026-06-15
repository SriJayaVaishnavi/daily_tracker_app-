'use server';

import { createClient } from '@/lib/supabase/server';
import { recommendSchedules } from '@/lib/schedule-llm';
import type { ParsedGoal } from '@/lib/goal-parse';

/** Auth-gated schedule recommendation over draft goals. */
export async function recommendSchedulesAction(goals: ParsedGoal[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');
  return recommendSchedules(goals);
}
