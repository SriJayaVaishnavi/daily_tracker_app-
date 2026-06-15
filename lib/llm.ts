import { coerceParsedGoal, type ParsedGoal } from '@/lib/goal-parse';
import { fallbackParse, splitGoals } from '@/lib/parse-goal-fallback';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `You convert a short natural-language description of a personal goal into JSON.
Return ONLY a JSON object with these optional keys:
- goal_type: "habit" (a recurring behaviour) or "project" (a one-off target with a deadline)
- title: short imperative title, with scheduling/quantity words removed
- category: e.g. "Health", "Learning" (omit if unclear)
- recurrence_type: "daily" | "weekly_days" | "weekly_count" (habits only)
- weekdays: array of integers 0-6 (Sunday=0) when recurrence_type is "weekly_days"
- target_count: integer times per week when recurrence_type is "weekly_count"
- scheduled_time: "HH:MM" in 24-hour time, only if a time of day is mentioned
- target_value: number, if the goal is measurable
- unit: short unit string e.g. "min", "pages", "km", "books"
- due_date: "YYYY-MM-DD", projects only
Infer sensible values. Omit any key that is not stated. Never invent a due_date for a habit.`;

const MULTI_SYSTEM_PROMPT = `You convert a natural-language description that may list SEVERAL goals into JSON.
Return ONLY a JSON object of the form { "goals": [ <goal>, ... ] }.
Split lists like "do X, Y and Z" into one element per distinct goal. Extract every goal mentioned; ignore filler like "all that".
Each <goal> has the optional keys:
- goal_type: "habit" or "project"
- title: short imperative title, with scheduling/quantity words removed
- category, recurrence_type ("daily"|"weekly_days"|"weekly_count"), weekdays (array 0-6, Sunday=0),
  target_count, scheduled_time ("HH:MM"), target_value, unit, due_date ("YYYY-MM-DD", projects only)
Omit any key not stated. Never invent a due_date for a habit.`;

/** Result of a parse, tagged with which engine produced it. */
export interface ParseResult {
  goal: ParsedGoal;
  source: 'llm' | 'fallback';
}

/** True when a Groq API key is configured (live LLM parsing is available). */
export function isLlmConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

/**
 * Parse free text into a structured goal. Uses Groq when `GROQ_API_KEY` is set;
 * on a missing key, network error, or malformed response, falls back to the
 * keyword parser so the feature always works.
 */
export async function parseGoalText(text: string): Promise<ParseResult> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { goal: fallbackParse(text), source: 'fallback' };

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return { goal: fallbackParse(text), source: 'fallback' };

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return { goal: fallbackParse(text), source: 'fallback' };

    return { goal: coerceParsedGoal(JSON.parse(content), text), source: 'llm' };
  } catch {
    return { goal: fallbackParse(text), source: 'fallback' };
  }
}

/**
 * Parse free text into one or more structured goals. Uses Groq when
 * `GROQ_API_KEY` is set; on a missing key, error, or empty result, falls back to
 * splitting the text and keyword-parsing each segment so the feature always works.
 */
export async function parseGoals(
  text: string,
): Promise<{ goals: ParsedGoal[]; source: 'llm' | 'fallback' }> {
  const fallback = (): { goals: ParsedGoal[]; source: 'fallback' } => {
    const segments = splitGoals(text);
    const list = segments.length > 0 ? segments : [text.trim()].filter(Boolean);
    return { goals: list.map(fallbackParse), source: 'fallback' };
  };

  const key = process.env.GROQ_API_KEY;
  if (!key) return fallback();

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: MULTI_SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return fallback();

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return fallback();

    const parsed = JSON.parse(content);
    const arr: unknown[] = Array.isArray(parsed?.goals) ? parsed.goals : [];
    const goals = arr.map((g) => coerceParsedGoal(g, text)).filter((g) => g.title.length > 0);
    if (goals.length === 0) return fallback();

    return { goals, source: 'llm' };
  } catch {
    return fallback();
  }
}
