/**
 * Long-term memory / context for the virtual therapist.
 *
 * `buildContextBlock` is a PURE function over already-fetched data so it can be
 * unit-tested without Supabase. `loadContext` is a thin IO wrapper around it.
 */
import { createClient } from '@/lib/supabase/server';

export interface MoodPoint {
  log_date: string;
  mood: number;
  energy: number | null;
  note: string | null;
}

export interface GoalPoint {
  title: string;
  category: string | null;
}

export interface ContextInput {
  moods: MoodPoint[];
  goals: GoalPoint[];
  priorSummaries: string[];
}

const MOOD_WORD = ['', 'very low', 'low', 'okay', 'good', 'great'];

/** Assemble a compact context block injected into the system prompt. */
export function buildContextBlock(input: ContextInput): string {
  const lines: string[] = [];

  lines.push('## Recent mood');
  if (input.moods.length === 0) {
    lines.push('No recent mood data.');
  } else {
    for (const m of input.moods) {
      const word = MOOD_WORD[m.mood] ?? String(m.mood);
      const energy = m.energy != null ? `, energy ${m.energy}/5` : '';
      const note = m.note ? ` — "${m.note}"` : '';
      lines.push(`- ${m.log_date}: ${word} (${m.mood}/5)${energy}${note}`);
    }
  }

  lines.push('');
  lines.push('## Active goals');
  if (input.goals.length === 0) {
    lines.push('No goals set.');
  } else {
    for (const g of input.goals) {
      lines.push(`- ${g.title}${g.category ? ` (${g.category})` : ''}`);
    }
  }

  lines.push('');
  lines.push('## Notes from past sessions');
  if (input.priorSummaries.length === 0) {
    lines.push('No prior sessions.');
  } else {
    for (const s of input.priorSummaries) lines.push(`- ${s}`);
  }

  return lines.join('\n');
}

/** Load the user's recent mood, active goals, and recent session summaries. */
export async function loadContext(userId: string): Promise<string> {
  const supabase = await createClient();

  const since = new Date();
  since.setDate(since.getDate() - 10);
  const sinceIso = since.toISOString().slice(0, 10);

  const [moodRes, goalRes, sessRes] = await Promise.all([
    supabase
      .from('mood_logs')
      .select('log_date, mood, energy, note')
      .eq('user_id', userId)
      .gte('log_date', sinceIso)
      .order('log_date', { ascending: true }),
    supabase
      .from('goals')
      .select('title, category')
      .eq('user_id', userId)
      .eq('status', 'active'),
    supabase
      .from('therapy_sessions')
      .select('summary')
      .eq('user_id', userId)
      .not('summary', 'is', null)
      .order('started_at', { ascending: false })
      .limit(3),
  ]);

  return buildContextBlock({
    moods: moodRes.data ?? [],
    goals: goalRes.data ?? [],
    priorSummaries: (sessRes.data ?? [])
      .map((s) => s.summary)
      .filter((s): s is string => Boolean(s)),
  });
}
