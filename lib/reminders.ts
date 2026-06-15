import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import type { RecurrenceType } from '@/lib/database.types';
import type { PushPayload } from '@/lib/push';

export type ReminderKind = 'task' | 'daily_brief' | 'mood_checkin';

/** Shown by a daily-brief reminder before Slice 3 populates `daily_briefs`. */
export const DEFAULT_BRIEF_TEXT = 'A fresh day. Show up for one small thing. 🌱';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 'HH:MM' or 'HH:MM:SS' → {h, m}. */
function parseTime(t: string): { h: number; m: number } {
  const [h, m] = t.split(':');
  return { h: Number(h), m: Number(m) };
}

/** Add whole days to a 'YYYY-MM-DD' calendar date (tz-independent). */
function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(dateIso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Calendar weekday (0=Sun..6=Sat) of a 'YYYY-MM-DD' date. */
function weekdayOfIso(dateIso: string): number {
  return new Date(dateIso + 'T00:00:00Z').getUTCDay();
}

/**
 * The next UTC instant strictly after `after` that a reminder should fire.
 * `weekly_count` has no per-day fire and returns null. Scans up to 8 local
 * days so `weekly_days` wraps the week even when today already matched.
 */
export function computeNextFireAt(
  scheduledTime: string,
  recurrenceType: RecurrenceType,
  weekdays: number[] | null,
  tz: string,
  after: Date,
): Date | null {
  if (recurrenceType === 'weekly_count') return null;
  const { h, m } = parseTime(scheduledTime);
  const startIso = formatInTimeZone(after, tz, 'yyyy-MM-dd');

  for (let offset = 0; offset <= 8; offset++) {
    const dateIso = addDaysIso(startIso, offset);
    if (recurrenceType === 'weekly_days') {
      if (!weekdays || !weekdays.includes(weekdayOfIso(dateIso))) continue;
    }
    // Interpret the wall-clock time as local to `tz`, convert to the UTC instant.
    const fireUtc = fromZonedTime(`${dateIso}T${pad(h)}:${pad(m)}:00`, tz);
    if (fireUtc.getTime() > after.getTime()) return fireUtc;
  }
  return null;
}

/** Build the push payload for a due reminder, by kind. */
export function buildReminderPayload(
  kind: ReminderKind,
  ctx: { title?: string | null; briefText?: string | null },
): PushPayload {
  switch (kind) {
    case 'task': {
      const title = ctx.title ?? 'Routine';
      return { title, body: `Time for ${title}`, url: '/', tag: 'reminder-task' };
    }
    case 'daily_brief':
      return {
        title: 'Your daily brief',
        body: ctx.briefText ?? DEFAULT_BRIEF_TEXT,
        url: '/',
        tag: 'reminder-brief',
      };
    case 'mood_checkin':
      return {
        title: 'Mood check-in',
        body: 'How are you feeling today?',
        url: '/',
        tag: 'reminder-mood',
      };
  }
}
