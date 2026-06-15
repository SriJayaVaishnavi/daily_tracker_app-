/**
 * Journal extraction: turn an uploaded image or PDF into plain text via Gemini
 * (multimodal). The local therapist model is text-only, so this runs first.
 */

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

/** Statuses worth retrying: transient overload (503) and rate limits (429). */
const RETRY_STATUSES = new Set([429, 503]);
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const EXTRACT_PROMPT =
  'This file is a personal journal entry (it may be handwritten). Transcribe its ' +
  'text faithfully and completely. Output ONLY the transcribed text — no headings, ' +
  'commentary, or explanation. If there is no legible text, output an empty string.';

/** Thrown when extraction is unavailable or fails, so the API can return a clean error. */
export class JournalExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JournalExtractError';
  }
}

/** True when a Gemini API key is configured. */
export function isJournalExtractionConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Transcribe a journal file to text. `base64` is the raw file bytes base64-encoded;
 * `mimeType` is e.g. "image/jpeg" or "application/pdf".
 */
export async function extractJournalText(base64: string, mimeType: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new JournalExtractError('Journal reading is not configured (missing GEMINI_API_KEY).');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  const payload = JSON.stringify({
    contents: [
      {
        parts: [
          { text: EXTRACT_PROMPT },
          { inline_data: { mime_type: mimeType, data: base64 } },
        ],
      },
    ],
    // Disable 2.5-flash "thinking": faster and lighter for plain transcription.
    generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
  });

  let res: Response | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(60000),
      });
    } catch {
      throw new JournalExtractError('Could not reach the journal reader. Please try again.');
    }

    if (res.ok) break;

    // Transient overload / rate limit → wait and retry (1s, then 2s).
    if (RETRY_STATUSES.has(res.status) && attempt < MAX_ATTEMPTS) {
      await sleep(attempt * 1000);
      continue;
    }

    let detail = '';
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    // Surfaced in the dev server log so we can see the real Gemini error.
    console.error(`[journal] Gemini ${res.status} (model=${GEMINI_MODEL}): ${detail.slice(0, 600)}`);
    const hint = res.status === 503 ? ' The model is busy — please try again in a moment.' : '';
    throw new JournalExtractError(
      `The journal reader could not process this file. (Gemini ${res.status})${hint}`,
    );
  }

  if (!res) throw new JournalExtractError('Could not reach the journal reader. Please try again.');

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts
        .map((p: { text?: string }) => (typeof p.text === 'string' ? p.text : ''))
        .join('')
        .trim()
    : '';

  if (!text) throw new JournalExtractError("I couldn't read any text from that file.");
  return text;
}
