'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import NotificationManager from '@/components/NotificationManager';
import KittyMark from '@/components/KittyMark';
import { completeOnboarding } from '@/lib/actions/profile';

const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
];

export default function OnboardingFlow({ initialTimezone }: { initialTimezone: string }) {
  const router = useRouter();
  const [tz, setTz] = useState(initialTimezone);
  const [busy, setBusy] = useState(false);

  const zones = TIMEZONES.includes(initialTimezone) ? TIMEZONES : [initialTimezone, ...TIMEZONES];

  async function finish() {
    setBusy(true);
    try {
      await completeOnboarding(tz);
      router.replace('/');
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-background px-4 py-10">
      <div className="space-y-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <KittyMark size={56} className="kitty-mark" />
          <h1 className="font-serif text-2xl font-semibold text-foreground">Welcome to Routine</h1>
          <p className="text-sm text-muted-fg">A couple of quick things, then you&apos;re set.</p>
        </div>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="font-serif text-lg font-semibold text-foreground">Your timezone</h2>
          <p className="mb-3 mt-1 text-sm text-muted-fg">
            Reminders fire in your local time. We guessed {initialTimezone}.
          </p>
          <select
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="font-serif text-lg font-semibold text-foreground">Enable reminders</h2>
          <p className="mb-3 mt-1 text-sm text-muted-fg">
            Get your daily brief and task nudges as notifications. Optional — you can do this later
            in Settings.
          </p>
          <NotificationManager />
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="font-serif text-lg font-semibold text-foreground">One Android tip</h2>
          <p className="mt-1 text-sm text-muted-fg">
            For reliable reminders, open <strong>Settings → Battery → App Battery Usage</strong>,
            find this app (or Chrome), and set it to <strong>Unrestricted</strong>. Otherwise the
            system may delay notifications.{' '}
            <a
              href="https://dontkillmyapp.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Learn more
            </a>
            .
          </p>
        </section>

        <button
          type="button"
          onClick={finish}
          disabled={busy}
          className="transition-calm min-h-[48px] w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {busy ? 'Finishing…' : "I'm ready"}
        </button>
      </div>
    </div>
  );
}
