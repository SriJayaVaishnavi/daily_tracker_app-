const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

/** Lightweight signal about the user's recent activity, fed to the brief. */
export interface BriefContext {
  displayName: string | null;
  activeGoals: number;
  doneYesterday: number;
}

/** Where a brief's text came from. */
export type BriefSource = 'llm' | 'template';

/**
 * Deterministic, no-I/O motivation line. Used directly when no LLM key is set,
 * and as the fallback whenever a live generation fails.
 */
export function templateBrief(ctx: BriefContext): string {
  const who = ctx.displayName ? `${ctx.displayName}, ` : '';
  const opener = who ? who.charAt(0).toUpperCase() + who.slice(1) : '';

  if (ctx.doneYesterday > 0) {
    return `${opener}you showed up ${ctx.doneYesterday} time${ctx.doneYesterday === 1 ? '' : 's'} yesterday. Keep the thread going — one small step today. 🌱`;
  }
  if (ctx.activeGoals > 0) {
    return `${opener}a fresh day with ${ctx.activeGoals} goal${ctx.activeGoals === 1 ? '' : 's'} in motion. Pick one and begin. 🌱`;
  }
  return `${opener}a calm, open day. Choose one small thing and show up for it. 🌱`;
}

const SYSTEM_PROMPT = `You write a single warm, grounded motivation line for a personal routine app.
Rules: 1-2 sentences, under 220 characters, second person, no hashtags, no quotes around it, no emoji spam (at most one). Encouraging but calm — not hype. Return ONLY the line.`;

function userPrompt(ctx: BriefContext): string {
  return [
    `Name: ${ctx.displayName ?? 'unknown'}`,
    `Active goals: ${ctx.activeGoals}`,
    `Things completed yesterday: ${ctx.doneYesterday}`,
  ].join('\n');
}

/**
 * Produce today's motivation line. Uses Groq when `GROQ_API_KEY` is set; on a
 * missing key, network error, or empty response, falls back to `templateBrief`
 * so the brief always exists. Mirrors `lib/llm.ts` parseGoalText.
 */
export async function generateBrief(
  ctx: BriefContext,
): Promise<{ text: string; source: BriefSource }> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { text: templateBrief(ctx), source: 'template' };

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        temperature: 0.7,
        max_tokens: 120,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt(ctx) },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { text: templateBrief(ctx), source: 'template' };

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    const text = typeof content === 'string' ? content.trim() : '';
    if (text.length < 5) return { text: templateBrief(ctx), source: 'template' };

    return { text, source: 'llm' };
  } catch {
    return { text: templateBrief(ctx), source: 'template' };
  }
}
