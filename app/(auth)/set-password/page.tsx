import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import SetPasswordForm from '@/components/SetPasswordForm';

export const dynamic = 'force-dynamic';

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-5">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-foreground">Create a password</h1>
          <p className="mt-1 text-sm text-muted-fg">
            Set a password so you can sign in without a magic link next time.
          </p>
        </div>
        <SetPasswordForm />
      </div>
    </main>
  );
}
