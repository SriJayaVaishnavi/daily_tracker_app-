'use client';

import { useTransition } from 'react';
import { LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function SignOutButton() {
  const [pending, startTransition] = useTransition();

  function signOut() {
    startTransition(async () => {
      await createClient().auth.signOut();
      location.href = '/login';
    });
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      aria-label="Sign out"
      className="transition-calm inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-muted-fg hover:bg-background hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      <LogOut aria-hidden="true" size={18} />
      <span className="hidden sm:inline">{pending ? 'Signing out…' : 'Sign out'}</span>
    </button>
  );
}
