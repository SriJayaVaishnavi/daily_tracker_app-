import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendPushToUser } from '@/lib/push';

export const dynamic = 'force-dynamic';

/** Auth-gated: send a test push to the current user's own devices. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
  }

  try {
    const result = await sendPushToUser(user.id, {
      title: 'Routine',
      body: 'This is a test notification. Push is working. ✨',
      url: '/',
      tag: 'routine-test',
    });
    return NextResponse.json(result);
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Failed to send notification.';
    return NextResponse.json({ error }, { status: 500 });
  }
}
