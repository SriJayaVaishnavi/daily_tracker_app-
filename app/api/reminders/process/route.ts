import { NextRequest, NextResponse } from 'next/server';
import { formatInTimeZone } from 'date-fns-tz';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/lib/push';
import { buildReminderPayload, computeNextFireAt } from '@/lib/reminders';
import { isWithinQuietHours } from '@/lib/quiet-hours';

export const dynamic = 'force-dynamic';

/**
 * Process all due reminders and send pushes. Token-guarded; uses the
 * service-role client to act across users. This is the exact contract the
 * future pg_cron-invoked Edge Function will assume.
 */
export async function POST(req: NextRequest) {
  const token = process.env.CRON_INVOKE_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'CRON_INVOKE_TOKEN is not configured.' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const now = new Date();
  const { data: due, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('is_enabled', true)
    .lte('next_fire_at', now.toISOString());
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;

  for (const r of due ?? []) {
    try {
      // Idempotency: skip if fired within the last minute (overlapping cron / button mash).
      if (r.last_sent_at && now.getTime() - new Date(r.last_sent_at).getTime() < 60_000) {
        continue;
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('timezone, quiet_hours_start, quiet_hours_end')
        .eq('id', r.user_id)
        .single();
      const tz = prof?.timezone ?? 'Asia/Kolkata';

      // Respect quiet hours: skip without advancing, so it fires once the
      // window ends (the next process run picks it up — it stays due).
      const nowHHMM = formatInTimeZone(now, tz, 'HH:mm');
      if (isWithinQuietHours(nowHHMM, prof?.quiet_hours_start ?? null, prof?.quiet_hours_end ?? null)) {
        continue;
      }

      let briefText: string | null = null;
      if (r.kind === 'daily_brief') {
        const todayIso = formatInTimeZone(now, tz, 'yyyy-MM-dd');
        const { data: brief } = await supabase
          .from('daily_briefs')
          .select('motivation_text')
          .eq('user_id', r.user_id)
          .eq('brief_date', todayIso)
          .maybeSingle();
        briefText = brief?.motivation_text ?? null;
      }

      const payload = buildReminderPayload(r.kind, { title: r.title_template, briefText });
      const result = await sendPushToUser(r.user_id, payload, supabase);
      sent += result.sent;

      const next = computeNextFireAt(r.scheduled_time, r.recurrence_type, r.weekdays, tz, now);
      await supabase
        .from('reminders')
        .update({
          last_sent_at: now.toISOString(),
          next_fire_at: next ? next.toISOString() : r.next_fire_at,
          is_enabled: next !== null,
        })
        .eq('id', r.id);
    } catch {
      failed += 1;
    }
  }

  return NextResponse.json({ processed: (due ?? []).length, sent, failed });
}
