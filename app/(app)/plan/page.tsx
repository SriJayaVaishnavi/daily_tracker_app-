import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { needsPasswordSetup } from '@/lib/auth';
import PlanView from '@/components/PlanView';

export const dynamic = 'force-dynamic';

export default async function PlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (needsPasswordSetup(user)) redirect('/set-password');

  const { data: goals } = await supabase
    .from('goals')
    .select('*')
    .eq('goal_type', 'habit')
    .eq('status', 'active');

  const sorted = (goals ?? []).sort((a, b) =>
    (a.scheduled_time ?? '99:99').localeCompare(b.scheduled_time ?? '99:99'),
  );

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Your plan</h1>
      <PlanView goals={sorted} />
    </div>
  );
}
