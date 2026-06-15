/** Minutes since midnight for an 'HH:MM' or 'HH:MM:SS' string. */
function toMinutes(t: string): number {
  const [h, m] = t.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * Whether `nowHHMM` (user-local time) falls inside the quiet-hours window.
 * Start is inclusive, end is exclusive. Handles overnight windows that wrap
 * midnight (e.g. 22:00–07:00). Returns false when either bound is null/empty
 * (quiet hours disabled) or the window is zero-length.
 */
export function isWithinQuietHours(
  nowHHMM: string,
  start: string | null,
  end: string | null,
): boolean {
  if (!start || !end) return false;
  const n = toMinutes(nowHHMM);
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === e) return false;
  if (s < e) return n >= s && n < e; // same-day window
  return n >= s || n < e; // overnight wrap
}
