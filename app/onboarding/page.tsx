import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { needsPasswordSetup, isOnboarded } from '@/lib/auth';
import OnboardingFlow from '@/components/OnboardingFlow';

export const dynamic = 'force-dynamic';

/**
 * One-time onboarding. Top-level route (not under the (app) layout) so it never
 * redirect-loops with the layout's onboarding gate. Guards auth + password
 * itself, and sends already-onboarded users home.
 */
export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (needsPasswordSetup(user)) redirect('/set-password');

  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone, notif_prefs')
    .eq('id', user.id)
    .single();
  if (isOnboarded(profile)) redirect('/');

  return <OnboardingFlow initialTimezone={profile?.timezone ?? 'Asia/Kolkata'} />;
}
