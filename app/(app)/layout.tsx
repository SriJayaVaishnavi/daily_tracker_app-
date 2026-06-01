import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import BottomNav from '@/components/BottomNav';
import SignOutButton from '@/components/SignOutButton';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <Link
            href="/"
            className="font-serif text-xl font-semibold tracking-tight text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
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
