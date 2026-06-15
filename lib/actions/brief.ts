'use server';

import { createClient } from '@/lib/supabase/server';
import { generateBrief } from '@/lib/brief';
import { localDateIso } from '@/lib/recurrence';
import { pickStoicForDate } from '@/lib/stoic';

/** Yesterday's local calendar date, given today's 'YYYY-MM-DD'. */
function yesterdayIso(todayIso: string): string {
  const d = new Date(todayIso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Ensure today's daily brief exists for the current user. Generates and upserts
 * once per local day (idempotent on the `unique(user_id, brief_date)`); a no-op
 * when the row already exists. Safe to call on every home render — only the
 * first call of the day does any LLM work.
 */
export async function ensureTodayBrief(today: Date = new Date()): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone, display_name')
    .eq('id', user.id)
    .single();
  const tz = profile?.timezone ?? 'Asia/Kolkata';
  const todayIso = localDateIso(today, tz);

  const { data: existing } = await supabase
    .from('daily_briefs')
    .select('id')
    .eq('user_id', user.id)
    .eq('brief_date', todayIso)
    .maybeSingle();
  if (existing) return;

  const yIso = yesterdayIso(todayIso);
  const { count: activeGoals } = await supabase
    .from('goals')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'active');
  const { count: doneYesterday } = await supabase
    .from('task_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'done')
    .eq('log_date', yIso);

  const { text, source } = await generateBrief({
    displayName: profile?.display_name ?? null,
    activeGoals: activeGoals ?? 0,
    doneYesterday: doneYesterday ?? 0,
  });

  const { data: quotes } = await supabase.from('stoic_quotes').select('*').order('id');
  const stoic = pickStoicForDate(quotes ?? [], today, tz);

  await supabase.from('daily_briefs').upsert(
    {
      user_id: user.id,
      brief_date: todayIso,
      motivation_text: text,
      stoic_quote_id: stoic?.id ?? null,
      generated_by: source,
    },
    { onConflict: 'user_id,brief_date' },
  );
}
