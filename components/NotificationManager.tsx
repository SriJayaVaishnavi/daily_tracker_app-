'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, Send } from 'lucide-react';
import { savePushSubscription } from '@/lib/actions/push';
import { vapidKeyToUint8Array } from '@/lib/push-keys';

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

type Support = 'checking' | 'unsupported' | 'supported';

export default function NotificationManager() {
  const [support, setSupport] = useState<Support>('checking');
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const ok =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    if (!ok) {
      setSupport('unsupported');
      return;
    }
    setSupport('supported');
    setPermission(Notification.permission);
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {});
  }, []);

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setMessage('Notifications were not allowed.');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast: the DOM lib types applicationServerKey as a BufferSource backed
        // by ArrayBuffer specifically; our Uint8Array satisfies it at runtime.
        applicationServerKey: vapidKeyToUint8Array(VAPID_PUBLIC!) as BufferSource,
      });
      const json = sub.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      await savePushSubscription(json, navigator.userAgent);
      setSubscribed(true);
      setMessage('Notifications enabled on this device.');
    } catch {
      setMessage('Could not enable notifications. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as {
        sent?: number;
        pruned?: number;
        error?: string;
      };
      if (!res.ok) {
        setMessage(data.error ?? 'Failed to send test notification.');
        return;
      }
      setMessage(
        data.sent
          ? 'Test notification sent — check your device.'
          : 'No active devices to notify. Enable notifications first.',
      );
    } catch {
      setMessage('Failed to send test notification.');
    } finally {
      setBusy(false);
    }
  }

  if (support === 'checking') return null;

  if (support === 'unsupported') {
    return (
      <p className="text-sm text-muted-fg">
        Push notifications aren&apos;t supported on this browser.
      </p>
    );
  }

  if (!VAPID_PUBLIC) {
    return (
      <p className="text-sm text-muted-fg">
        Push isn&apos;t configured. Set <code>NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> to enable
        notifications.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {permission === 'denied' ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-background p-3 text-sm text-muted-fg">
          <BellOff aria-hidden="true" size={18} className="mt-0.5 shrink-0" />
          <span>
            Notifications are blocked. Re-enable them for this site in your browser settings,
            then reload.
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={enable}
          disabled={busy || (subscribed && permission === 'granted')}
          className="transition-calm inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-fg hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50"
        >
          <Bell aria-hidden="true" size={18} />
          {subscribed && permission === 'granted'
            ? 'Notifications enabled'
            : busy
              ? 'Enabling…'
              : 'Enable notifications'}
        </button>
      )}

      {subscribed && permission === 'granted' && (
        <button
          type="button"
          onClick={sendTest}
          disabled={busy}
          className="transition-calm inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-foreground hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-50"
        >
          <Send aria-hidden="true" size={18} />
          {busy ? 'Sending…' : 'Send test notification'}
        </button>
      )}

      {message && (
        <p aria-live="polite" className="text-sm text-muted-fg">
          {message}
        </p>
      )}
    </div>
  );
}
