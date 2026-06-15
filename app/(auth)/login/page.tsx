'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import KittyMark from '@/components/KittyMark';

type Mode = 'landing' | 'login' | 'signup';

function LoginInner() {
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'login' ? 'login' : 'landing');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [linkSent, setLinkSent] = useState<null | 'magic' | 'reset'>(null);
  const justSaved = params.get('set') === '1';

  function go(next: Mode) {
    setError(null);
    setLinkSent(null);
    setMode(next);
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setError('Incorrect email or password.');
      return;
    }
    window.location.href = '/';
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError('Enter your email first.');
      return;
    }
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}/callback` },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setLinkSent('magic');
  }

  async function sendReset() {
    if (!email.trim()) {
      setError('Enter your email first.');
      return;
    }
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/callback?next=/set-password`,
    });
    setLoading(false);
    if (error) setError(error.message);
    else setLinkSent('reset');
  }

  const fieldClass =
    'w-full rounded-xl border border-border bg-background px-3 py-3 text-base text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const primaryBtn =
    'transition-calm inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-primary-fg hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60';
  const linkBtn =
    'transition-calm rounded text-sm font-medium text-primary hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

  const backButton = (
    <button type="button" onClick={() => go('landing')} className={`${linkBtn} inline-flex items-center gap-1`}>
      <ChevronLeft aria-hidden="true" size={16} /> Back
    </button>
  );

  // Confirmation state after a magic link / reset email is sent.
  if (linkSent) {
    return (
      <Shell>
        <div className="space-y-3 text-center">
          <h1 className="font-serif text-2xl font-semibold text-foreground">Check your email</h1>
          <p className="text-sm text-muted-fg">
            {linkSent === 'magic'
              ? 'We sent you a sign-in link. Open it on this device to set up your account.'
              : 'We sent you a link to reset your password.'}
          </p>
          <button type="button" onClick={() => go('landing')} className={linkBtn}>
            Back to start
          </button>
        </div>
      </Shell>
    );
  }

  if (mode === 'landing') {
    return (
      <Shell>
        <div className="space-y-6 text-center">
          <div className="flex justify-center">
            <KittyMark size={56} className="kitty-mark" />
          </div>
          <h1 className="font-serif text-3xl font-semibold text-foreground">Routine</h1>
          {justSaved && (
            <p className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-muted-fg">
              Password saved — log in to continue.
            </p>
          )}
          <div className="space-y-3">
            <button type="button" onClick={() => go('signup')} className={primaryBtn}>
              I&rsquo;m new here
            </button>
            <button
              type="button"
              onClick={() => go('login')}
              className="transition-calm inline-flex min-h-[48px] w-full items-center justify-center rounded-xl border border-border px-4 text-base font-semibold text-foreground hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Log in
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  if (mode === 'signup') {
    return (
      <Shell>
        <form onSubmit={sendMagicLink} className="space-y-4">
          {backButton}
          <div>
            <h1 className="font-serif text-2xl font-semibold text-foreground">Create your account</h1>
            <p className="mt-1 text-sm text-muted-fg">
              We&rsquo;ll email you a link to confirm. After that you&rsquo;ll set a password.
            </p>
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-foreground">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={fieldClass}
            />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <button type="submit" disabled={loading} className={primaryBtn}>
            {loading && <Loader2 aria-hidden="true" size={18} className="animate-spin" />}
            {loading ? 'Sending…' : 'Send magic link'}
          </button>
        </form>
      </Shell>
    );
  }

  // mode === 'login'
  return (
    <Shell>
      <form onSubmit={signIn} className="space-y-4">
        {backButton}
        <h1 className="font-serif text-2xl font-semibold text-foreground">Log in</h1>
        {justSaved && (
          <p className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-muted-fg">
            Password saved — log in to continue.
          </p>
        )}
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-foreground">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-foreground">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldClass}
          />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={loading} className={primaryBtn}>
          {loading && <Loader2 aria-hidden="true" size={18} className="animate-spin" />}
          {loading ? 'Logging in…' : 'Log in'}
        </button>
        <div className="pt-1">
          <button type="button" onClick={sendReset} disabled={loading} className={linkBtn}>
            Forgot password?
          </button>
        </div>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
