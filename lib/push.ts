import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

/**
 * Server-only Web Push delivery. Imported only from Server Actions / Route
 * Handlers (never a Client Component), so the VAPID private key stays on the
 * server. This is the shared delivery primitive reused by later slices
 * (reminder firing, daily-brief push) and ported to a Supabase Edge Function
 * when the production path is deployed.
 */

export interface PushPayload {
  title: string;
  body: string;
  /** Path to focus/open when the notification is clicked. Defaults to '/'. */
  url?: string;
  /** Collapse key — a new push with the same tag replaces the previous one. */
  tag?: string;
}

let configured = false;

/** Lazily set VAPID details once; throws a clear error if env is missing. */
function configure(): void {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:you@example.com';
  if (!publicKey || !privateKey) {
    throw new Error(
      'VAPID keys are not configured. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.',
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

/**
 * Send a push to every active subscription belonging to `userId`. Subscriptions
 * whose endpoint reports 404/410 (gone) are pruned. Returns a delivery summary.
 *
 * Reads through the session-bound Supabase client, so RLS guarantees only the
 * caller's own subscriptions are ever touched. (A future server-side cron port
 * will swap in a service-role client and pass an explicit userId.)
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  client?: SupabaseClient<Database>,
): Promise<{ sent: number; pruned: number }> {
  configure();
  const supabase = client ?? (await createClient());
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId);

  const body = JSON.stringify(payload);
  let sent = 0;
  let pruned = 0;

  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        body,
      );
      sent++;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        pruned++;
      } else {
        throw err;
      }
    }
  }

  return { sent, pruned };
}
