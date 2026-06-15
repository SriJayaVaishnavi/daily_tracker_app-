/**
 * Deterministic crisis-risk classifier for the virtual therapist.
 *
 * Runs OUTSIDE the LLM: every user message is scanned here before it reaches
 * the model, so crisis handling never depends on the model behaving correctly.
 */
import type { TherapyRisk } from '@/lib/database.types';

export interface RiskResult {
  level: TherapyRisk;
  matched?: string;
}

// Explicit self-harm / suicide intent → immediate resources, LLM bypassed.
const CRISIS: RegExp[] = [
  /\bkill (myself|me)\b/,
  /\bkilling myself\b/,
  /\bsuicid/,
  /\bend my life\b/,
  /\bend it all\b/,
  /\b(want|going) to die\b/,
  /\bdon'?t want to (be alive|live|wake up)\b/,
  /\b(harm|hurt|cut|cutting) myself\b/,
  /\bself[-\s]?harm\b/,
  /\boverdose\b/,
  /\bno reason to (live|go on)\b/,
  /\bbetter off without me\b/,
  /\bi want to disappear\b/,
];

// Serious distress without explicit intent → extra-gentle reply + nudge to help.
const CONCERN: RegExp[] = [
  /\bcan'?t cope\b/,
  /\bhopeless\b/,
  /\bworthless\b/,
  /\bgiving up\b/,
  /\bgive up on (everything|life)\b/,
  /\bcan'?t go on\b/,
  /\bhate myself\b/,
  /\bso (numb|empty)\b/,
  /\bempty inside\b/,
  /\bbreaking down\b/,
  /\bcan'?t do this anymore\b/,
  /\bnothing matters\b/,
];

/**
 * Crisis response shown immediately (LLM bypassed) when CRISIS is detected.
 * India-focused helplines.
 */
export const CRISIS_RESPONSE =
  "I'm really glad you told me, and I'm concerned about your safety. " +
  "I'm not able to provide crisis care, but people who can are available right now:\n\n" +
  '• Tele-MANAS (India, 24×7): 14416 or 1-800-891-4416\n' +
  '• KIRAN Mental Health Helpline: 1800-599-0019\n' +
  '• Emergency services: 112\n\n' +
  "If you're in immediate danger, please call 112 now. " +
  "I'm here with you — would you like to stay and talk through what you're feeling?";

/** Classify a user message into a risk level via keyword/regex scan. */
export function classifyRisk(text: string): RiskResult {
  const t = text.toLowerCase();
  for (const re of CRISIS) if (re.test(t)) return { level: 'crisis', matched: re.source };
  for (const re of CONCERN) if (re.test(t)) return { level: 'concern', matched: re.source };
  return { level: 'none' };
}
