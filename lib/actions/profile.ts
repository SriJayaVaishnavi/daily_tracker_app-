'use server';

import { createClient } from '@/lib/supabase/server';

export interface ProfileSettings {
  timezone: string;
  quietStart: string | null;
  quietEnd: string | null;
}

export async function getProfileSettings(): Promise<ProfileSettings> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');

  const { data } = await supabase
    .from('profiles')
    .select('timezone, quiet_hours_start, quiet_hours_end')
    .eq('id', user.id)
    .single();

  return {
    timezone: data?.timezone ?? 'Asia/Kolkata',
    quietStart: data?.quiet_hours_start ? data.quiet_hours_start.slice(0, 5) : null,
    quietEnd: data?.quiet_hours_end ? data.quiet_hours_end.slice(0, 5) : null,
  };
}

/** Save (or clear, with nulls) the user's quiet-hours window. */
export async function setQuietHours(start: string | null, end: string | null): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');

  await supabase
    .from('profiles')
    .update({ quiet_hours_start: start || null, quiet_hours_end: end || null })
    .eq('id', user.id);
}

/** Mark onboarding complete and persist the confirmed timezone. */
export async function completeOnboarding(timezone: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');

  const { data: profile } = await supabase
    .from('profiles')
    .select('notif_prefs')
    .eq('id', user.id)
    .single();
  const prefs = { ...(profile?.notif_prefs ?? {}), onboarded: true };

  await supabase.from('profiles').update({ timezone, notif_prefs: prefs }).eq('id', user.id);
}
