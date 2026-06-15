'use server';

import { createClient } from '@/lib/supabase/server';

/** The browser PushSubscription shape, after `.toJSON()`. */
export interface BrowserPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Persist (or refresh) the current user's push subscription. Idempotent on
 * `endpoint` — re-subscribing the same device updates `last_seen_at` rather than
 * inserting a duplicate. RLS enforces `user_id = auth.uid()`.
 */
export async function savePushSubscription(
  sub: BrowserPushSubscription,
  userAgent?: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');

  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    throw new Error('Invalid push subscription.');
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth_key: sub.keys.auth,
      user_agent: userAgent ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  );
  if (error) throw error;
}
