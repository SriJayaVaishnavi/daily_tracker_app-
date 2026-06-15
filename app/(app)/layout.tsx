import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { needsPasswordSetup, isOnboarded } from '@/lib/auth';
import BottomNav from '@/components/BottomNav';
import SignOutButton from '@/components/SignOutButton';
import KittyMark from '@/components/KittyMark';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (needsPasswordSetup(user)) redirect('/set-password');

  const { data: profile } = await supabase
    .from('profiles')
    .select('notif_prefs')
    .eq('id', user.id)
    .single();
  if (!isOnboarded(profile)) redirect('/onboarding');

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <Link
            href="/"
            className="flex items-center gap-2 font-serif text-xl font-semibold tracking-tight text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            <KittyMark size={26} className="kitty-mark" />
            Routine
          </Link>
          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-4">{children}</main>

      <BottomNav />
    </div>
  );
}
