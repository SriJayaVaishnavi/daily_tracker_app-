import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { needsPasswordSetup } from '@/lib/auth';
import { todayRoutine } from '@/lib/routine';
import { ensureTodayBrief } from '@/lib/actions/brief';
import RoutineView from '@/components/RoutineView';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  // The (app) layout redirects unauthenticated users, but in the App Router a
  // page renders concurrently with its layout — so guard here too, otherwise
  // todayRoutine() throws "not authenticated" before the layout redirect lands.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (needsPasswordSetup(user)) redirect('/set-password');

  // Generate today's brief if missing (once/day, cached). Non-critical — never
  // let a generation failure block the routine from rendering.
  await ensureTodayBrief(new Date()).catch(() => {});

  const routine = await todayRoutine(new Date());
  return <RoutineView routine={routine} />;
}
