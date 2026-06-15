import type { ParsedGoal } from '@/lib/goal-parse';

const FILLER = /^(all that|and all that|etc\.?|everything|and so on|and that)$/i;

/**
 * Split a multi-goal description into individual goal phrases. Splits on
 * newlines, commas, semicolons, ampersands, and the words "and"/"also"; trims
 * trailing filler ("... all that"); drops empty and pure-filler segments.
 */
export function splitGoals(text: string): string[] {
  return text
    .split(/\n|,|;|&|\band\b|\balso\b/gi)
    .map((s) => s.replace(/\s+(all that|and all that|etc\.?|and so on)\s*$/i, '').trim())
    .filter((s) => s.length > 1 && !FILLER.test(s));
}

/**
 * Best-effort keyword parse of a natural-language goal description.
 * Pure and total — never throws. Used when no LLM key is configured or the
 * LLM call fails. Always returns at least a habit with a title.
 */
export function fallbackParse(text: string): ParsedGoal {
  const raw = text.trim();
  const lower = raw.toLowerCase();
  let work = raw;

  // Match `re` against the working string, remove it, and return the match.
  const take = (re: RegExp): RegExpMatchArray | null => {
    const m = work.match(re);
    if (m) work = work.replace(re, ' ');
    return m;
  };

  // --- scheduled time -------------------------------------------------------
  let scheduled_time: string | undefined;
  const ampm = take(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (ampm) {
    scheduled_time = to24h(Number(ampm[1]), ampm[2] ? Number(ampm[2]) : 0, ampm[3].toLowerCase());
  } else {
    const at24 = take(/\bat\s+(\d{1,2}):(\d{2})\b/i);
    if (at24) {
      scheduled_time = `${pad(Number(at24[1]))}:${at24[2]}`;
    } else {
      const named = take(/\b(morning|afternoon|evening|night|noon)\b/i);
      if (named) scheduled_time = NAMED_TIME[named[1].toLowerCase()];
    }
  }

  // --- due date / project ---------------------------------------------------
  let goal_type: ParsedGoal['goal_type'] = 'habit';
  let due_date: string | undefined;
  const iso = take(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) {
    due_date = iso[1];
    goal_type = 'project';
  }

  // --- recurrence -----------------------------------------------------------
  let recurrence_type: ParsedGoal['recurrence_type'];
  let weekdays: number[] | undefined;
  let target_count: number | undefined;

  const count = take(/\b(\d+)\s*(?:x|times?)\s*(?:\/|per|a)?\s*week\b/i);
  if (count) {
    recurrence_type = 'weekly_count';
    target_count = Number(count[1]);
  } else {
    const days = matchWeekdays(work.toLowerCase());
    if (days.length > 0) {
      recurrence_type = 'weekly_days';
      weekdays = days;
      take(WEEKDAY_RE);
    } else if (take(/\b(every\s?day|daily|each day)\b/i)) {
      recurrence_type = 'daily';
    } else if (scheduled_time && goal_type === 'habit' && /\b(every|each)\b/.test(lower)) {
      // "every morning" / "each evening" implies a daily rhythm.
      recurrence_type = 'daily';
    }
  }

  // --- measurable target (after counts/times/dates removed) -----------------
  let target_value: number | undefined;
  let unit: string | undefined;
  const meas = take(/\b(\d+(?:\.\d+)?)\s*([a-zA-Z]+)\b/);
  if (meas) {
    target_value = Number(meas[1]);
    unit = normalizeUnit(meas[2]);
  }

  return {
    goal_type,
    title: cleanTitle(work),
    recurrence_type,
    weekdays,
    target_count,
    scheduled_time,
    target_value,
    unit,
    due_date,
  };
}

const NAMED_TIME: Record<string, string> = {
  morning: '08:00',
  noon: '12:00',
  afternoon: '14:00',
  evening: '18:00',
  night: '21:00',
};

const WEEKDAY_RE =
  /\b(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)\b/gi;

const WEEKDAY_INDEX: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

function to24h(hour: number, minute: number, mer: string): string {
  let h = hour % 12;
  if (mer === 'pm') h += 12;
  return `${pad(h)}:${pad(minute)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function normalizeUnit(raw: string): string {
  const u = raw.toLowerCase();
  if (/^(minutes?|mins?|min)$/.test(u)) return 'min';
  if (/^(hours?|hrs?|hr)$/.test(u)) return 'hr';
  return u;
}

/** Returns sorted, de-duplicated weekday indices (0=Sun..6=Sat) found in text. */
function matchWeekdays(lower: string): number[] {
  const found = new Set<number>();
  for (const m of Array.from(lower.matchAll(WEEKDAY_RE))) {
    const idx = WEEKDAY_INDEX[m[1].slice(0, 3)];
    if (idx !== undefined) found.add(idx);
  }
  return Array.from(found).sort((a, b) => a - b);
}

/** Strip leftover connector words and punctuation, collapse whitespace. */
function cleanTitle(work: string): string {
  return work
    .replace(/\b(every|each|at|on|by|per|a|and|of)\b/gi, ' ')
    .replace(/[,.;]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.;-]+|[\s,.;-]+$/g, '')
    .trim();
}
