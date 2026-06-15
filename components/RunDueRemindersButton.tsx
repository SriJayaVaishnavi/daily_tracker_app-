'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';

const TOKEN = process.env.NEXT_PUBLIC_CRON_INVOKE_TOKEN;

/** DEV-ONLY: manually invoke the processor so reminders can be verified without cron. */
export default function RunDueRemindersButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Hidden unless the dev token is configured.
  if (!TOKEN) return null;

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/reminders/process', {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        processed?: number;
        sent?: number;
        failed?: number;
        error?: string;
      };
      if (!res.ok) {
        setMessage(data.error ?? 'Failed to run.');
        return;
      }
      setMessage(
        `Processed ${data.processed ?? 0} · sent ${data.sent ?? 0} · failed ${data.failed ?? 0}.`,
      );
    } catch {
      setMessage('Failed to run the processor.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="transition-calm inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-foreground hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <Send aria-hidden="true" size={18} />
        {busy ? 'Running…' : 'Run due reminders now'}
      </button>
      {message && (
        <p aria-live="polite" className="text-sm text-muted-fg">
          {message}
        </p>
      )}
    </div>
  );
}
