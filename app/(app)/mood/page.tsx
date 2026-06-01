import { createClient } from '@/lib/supabase/server';
import type { MoodLog, Profile } from '@/lib/database.types';
import MoodCheckIn from '@/components/MoodCheckIn';

export const dynamic = 'force-dynamic';

export default async function MoodPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let tz = 'Asia/Kolkata';
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    const profile = data as Profile | null;
    if (profile?.timezone) tz = profile.timezone;
  }
  const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

  const { data: moodData } = await supabase
    .from('mood_logs')
    .select('*')
    .eq('log_date', todayIso)
    .maybeSingle();
  const mood = (moodData as MoodLog | null) ?? null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-foreground">Daily check-in</h1>
        <p className="mt-1 text-sm text-muted-fg">
          A quiet moment to notice how you&rsquo;re doing.
        </p>
      </div>
      <MoodCheckIn initial={mood} />
    </div>
  );
}
