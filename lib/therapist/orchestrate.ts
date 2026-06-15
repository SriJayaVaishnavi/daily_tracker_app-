/**
 * Orchestration for one therapist turn: call the local Qwen model (Ollama) and
 * parse its structured output tolerantly.
 */
import type { TherapyAction } from '@/lib/database.types';

export interface ParsedTurn {
  reply: string;
  action: TherapyAction | null;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Thrown when the local model is unreachable, so the UI can show an offline notice. */
export class OllamaOfflineError extends Error {
  constructor() {
    super('The local therapist model (Ollama) is not reachable.');
    this.name = 'OllamaOfflineError';
  }
}

/** Validate a raw parsed action against the allowlist; unknown → null. */
function coerceAction(raw: unknown): TherapyAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  switch (a.type) {
    case 'launch_tool':
      return a.tool === 'breathing' || a.tool === 'thought_record'
        ? { type: 'launch_tool', tool: a.tool }
        : null;
    case 'roleplay_start':
      return typeof a.persona === 'string' && a.persona.trim()
        ? { type: 'roleplay_start', persona: a.persona.trim() }
        : null;
    case 'roleplay_end':
      return { type: 'roleplay_end' };
    default:
      return null;
  }
}

/**
 * Parse the model's raw output into {reply, action}. Tolerant of code fences and
 * prose around the JSON. On any failure, degrades to the raw text as the reply.
 */
export function parseModelOutput(raw: string): ParsedTurn {
  const text = raw.trim();

  // Try to locate a JSON object, even if wrapped in ```json fences or prose.
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const candidate = text.slice(start, end + 1);
    try {
      const obj = JSON.parse(candidate) as Record<string, unknown>;
      if (typeof obj.reply === 'string' && obj.reply.trim()) {
        return { reply: obj.reply.trim(), action: coerceAction(obj.action) };
      }
    } catch {
      // fall through to raw-text fallback
    }
  }

  // Strip any stray code fences from the fallback text.
  const cleaned = text.replace(/```[a-z]*|```/gi, '').trim();
  return { reply: cleaned || text, action: null };
}

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';

/** Call the local Ollama chat endpoint. Throws OllamaOfflineError on network failure. */
export async function callOllama(messages: ChatMessage[]): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
        options: { temperature: 0.6 },
      }),
      signal: AbortSignal.timeout(45000),
    });
  } catch {
    throw new OllamaOfflineError();
  }
  if (!res.ok) throw new OllamaOfflineError();
  const data = await res.json();
  const content = data?.message?.content;
  if (typeof content !== 'string') throw new OllamaOfflineError();
  return content;
}
