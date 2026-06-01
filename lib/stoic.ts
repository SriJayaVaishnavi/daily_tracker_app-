import { toZonedTime } from 'date-fns-tz';
import { startOfYear } from 'date-fns';
import type { StoicQuote } from '@/lib/database.types';

/** Deterministic index into a quote list for a given local calendar day. */
export function stoicIndexForDate(date: Date, tz: string, count: number): number {
  if (count <= 0) return 0;
  const local = toZonedTime(date, tz);
  const dayOfYear = Math.floor(
    (local.getTime() - startOfYear(local).getTime()) / 86_400_000,
  );
  return dayOfYear % count;
}

/** The quote of the day — same for everyone on the same local calendar day. */
export function pickStoicForDate(
  quotes: StoicQuote[],
  date: Date,
  tz: string,
): StoicQuote | null {
  if (quotes.length === 0) return null;
  return quotes[stoicIndexForDate(date, tz, quotes.length)];
}
