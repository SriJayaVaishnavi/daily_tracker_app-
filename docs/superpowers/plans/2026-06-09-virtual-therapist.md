# Virtual Therapist Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.
> **Git:** Per user instruction, do NOT commit. No `git` commands in this plan.

**Goal:** Add a private, local-first virtual therapist ("Talk" tab) to daily_tracker_app — mood capture by text/voice, contextual memory, hybrid therapist tools, and conversation-rehearsal role-play.

**Architecture:** New "Talk" tab → chat UI → `/api/therapy/chat` → `lib/therapist/` (safety → memory → prompt → orchestrate) → local Ollama (Qwen2.5) + Supabase. Voice in via local Whisper, voice out via local Kokoro. Safety is deterministic and runs outside the LLM.

**Tech Stack:** Next.js 14 (app router, server actions), Supabase + RLS, Ollama/Qwen2.5, faster-whisper, Kokoro TTS, Tailwind, Vitest.

---

## Phase 0 — Local services (prerequisites)

### Task 0.1: Install Ollama + pull Qwen
- [ ] Install Ollama for Windows (winget `Ollama.Ollama` or installer).
- [ ] Start server (`ollama serve` / auto-starts as service), verify `http://localhost:11434/api/tags`.
- [ ] Pull model: `qwen2.5:3b` (≈2GB, fast) — upgrade to `qwen2.5:7b` if RAM allows.
- [ ] Smoke test: POST `/api/chat` with a one-line prompt, confirm a reply.

### Task 0.2: Local Whisper STT server (`~/whisper-stt`)
- [ ] uv venv (Py 3.10) + install `faster-whisper fastapi uvicorn[standard] python-multipart`.
- [ ] Write `server.py` exposing `POST /v1/audio/transcriptions` (multipart `file`) returning `{text}`. Model `base` or `small` (CPU int8).
- [ ] `start-whisper.ps1` launcher (idempotent health check on `:9000`).
- [ ] Smoke test: post `~/kokoro-tts/smoke.mp3`, confirm transcription text returned.

### Task 0.3: App env wiring
- [ ] Add to `daily_tracker_app/.env.local`:
  - `OLLAMA_URL=http://localhost:11434`
  - `OLLAMA_MODEL=qwen2.5:3b`
  - `WHISPER_URL=http://localhost:9000`
  - `KOKORO_URL=http://127.0.0.1:8880`
- [ ] Add the same keys (blank) to `.env.example`.

---

## Phase 1 — Database

### Task 1.1: Therapy tables migration
**Files:** Create `supabase/migrations/0002_therapy.sql`
- [ ] Write `therapy_sessions` + `therapy_messages` per spec §5, with `gen_random_uuid()` defaults, FK to `profiles`/`therapy_sessions`, cascade delete on messages.
- [ ] Enable RLS; add policies: `user_id = auth.uid()` for select/insert/update (mirror `mood_logs` policies in `0001_init.sql`).
- [ ] Apply migration to the Supabase project (SQL editor or CLI).

### Task 1.2: Regenerate DB types
**Files:** Modify `lib/database.types.ts`
- [ ] Add `TherapySession` and `TherapyMessage` types matching the new tables (hand-add following the existing `MoodLog` shape).

---

## Phase 2 — Safety module (TDD, highest priority)

### Task 2.1: Crisis classifier
**Files:** Create `lib/therapist/safety.ts`, Test `lib/__tests__/therapist-safety.test.ts`

- [ ] **Step 1: Failing tests**
```ts
import { classifyRisk, CRISIS_RESPONSE } from '@/lib/therapist/safety';

describe('classifyRisk', () => {
  it('flags explicit self-harm as crisis', () => {
    expect(classifyRisk('I want to kill myself').level).toBe('crisis');
    expect(classifyRisk('thinking about suicide tonight').level).toBe('crisis');
    expect(classifyRisk('i want to end my life').level).toBe('crisis');
  });
  it('flags distress as concern', () => {
    expect(classifyRisk("I can't cope anymore, everything is hopeless").level).toBe('concern');
  });
  it('returns none for ordinary venting', () => {
    expect(classifyRisk('work was stressful and I feel tired').level).toBe('none');
  });
  it('crisis response includes India helplines', () => {
    expect(CRISIS_RESPONSE).toContain('14416');
    expect(CRISIS_RESPONSE).toContain('1800-599-0019');
  });
  it('is case-insensitive', () => {
    expect(classifyRisk('KILL MYSELF').level).toBe('crisis');
  });
});
```
- [ ] **Step 2:** Run `npx vitest run lib/__tests__/therapist-safety.test.ts` → FAIL.
- [ ] **Step 3: Implement**
```ts
export type RiskLevel = 'none' | 'concern' | 'crisis';
export interface RiskResult { level: RiskLevel; matched?: string }

const CRISIS = [
  /\bkill myself\b/, /\bkilling myself\b/, /\bsuicid/, /\bend my life\b/,
  /\bend it all\b/, /\bwant to die\b/, /\bdon'?t want to (be alive|live)\b/,
  /\bharm myself\b/, /\bhurt myself\b/, /\bself[-\s]?harm\b/, /\boverdose\b/,
  /\bkill me\b/, /\bno reason to live\b/,
];
const CONCERN = [
  /\bcan'?t cope\b/, /\bhopeless\b/, /\bworthless\b/, /\bgive up\b/,
  /\bcan'?t go on\b/, /\bhate myself\b/, /\bnumb\b/, /\bempty inside\b/,
  /\bbreaking down\b/, /\bcan'?t do this anymore\b/,
];

export const CRISIS_RESPONSE =
  "I'm really glad you told me, and I'm concerned about your safety. " +
  "I'm not able to provide crisis care, but people who can are available right now:\n\n" +
  "• Tele-MANAS (India, 24x7): 14416 or 1-800-891-4416\n" +
  "• KIRAN Mental Health Helpline: 1800-599-0019\n" +
  "• Emergency services: 112\n\n" +
  "If you're in immediate danger, please call 112 now. " +
  "Would you like to stay here and talk through what you're feeling?";

export function classifyRisk(text: string): RiskResult {
  const t = text.toLowerCase();
  for (const re of CRISIS) if (re.test(t)) return { level: 'crisis', matched: re.source };
  for (const re of CONCERN) if (re.test(t)) return { level: 'concern', matched: re.source };
  return { level: 'none' };
}
```
- [ ] **Step 4:** Run tests → PASS.

---

## Phase 3 — Memory module (TDD)

### Task 3.1: Context block builder
**Files:** Create `lib/therapist/memory.ts`, Test `lib/__tests__/therapist-memory.test.ts`

- [ ] **Step 1: Failing test** — `buildContextBlock` is a PURE function over already-fetched data (so it's testable without Supabase):
```ts
import { buildContextBlock } from '@/lib/therapist/memory';

it('summarizes mood, goals, and prior session summary', () => {
  const block = buildContextBlock({
    moods: [{ log_date: '2026-06-08', mood: 2, energy: 2, note: 'rough day' }],
    goals: [{ title: 'Meditate daily', category: 'Health' }],
    priorSummaries: ['User has been anxious about work deadlines.'],
  });
  expect(block).toContain('rough day');
  expect(block).toContain('Meditate daily');
  expect(block).toContain('anxious about work');
});
it('handles empty data gracefully', () => {
  expect(buildContextBlock({ moods: [], goals: [], priorSummaries: [] }))
    .toContain('No recent');
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `buildContextBlock(input)` returning a compact multi-line string (mood trend line, bulleted goals, prior summaries; "No recent mood data." / "No goals set." fallbacks).
- [ ] **Step 4:** Run → PASS.

### Task 3.2: Supabase loaders (thin, untested wrappers)
**Files:** add to `lib/therapist/memory.ts`
- [ ] `loadContext(userId)`: query last 10 days `mood_logs`, active `goals`, last 3 `therapy_sessions.summary`; pass to `buildContextBlock`. Kept thin per "test pure functions, keep IO thin".

---

## Phase 4 — Prompt + orchestration (TDD on the parser)

### Task 4.1: System prompt builder
**Files:** Create `lib/therapist/prompt.ts`
- [ ] `buildSystemPrompt({ persona, contextBlock, riskLevel, mode, roleplayPersona })` returning the full system prompt: therapist role, guardrails (never diagnose / never medical advice / encourage professional help), the action JSON contract, persona style, the context block, extra-gentle clause when `riskLevel==='concern'`, and in-character instructions when `mode==='roleplay'`.

### Task 4.2: Tolerant action parser
**Files:** Create `lib/therapist/orchestrate.ts`, Test `lib/__tests__/therapist-parse.test.ts`
- [ ] **Step 1: Failing tests**
```ts
import { parseModelOutput } from '@/lib/therapist/orchestrate';

it('parses clean JSON', () => {
  const r = parseModelOutput('{"reply":"Hi","action":{"type":"launch_tool","tool":"breathing"}}');
  expect(r.reply).toBe('Hi');
  expect(r.action).toEqual({ type: 'launch_tool', tool: 'breathing' });
});
it('extracts JSON embedded in prose / fences', () => {
  const r = parseModelOutput('Sure!\n```json\n{"reply":"Let us breathe","action":null}\n```');
  expect(r.reply).toBe('Let us breathe');
  expect(r.action).toBeNull();
});
it('falls back to raw text when not JSON', () => {
  const r = parseModelOutput('I hear you, that sounds hard.');
  expect(r.reply).toBe('I hear you, that sounds hard.');
  expect(r.action).toBeNull();
});
it('ignores unknown action types', () => {
  const r = parseModelOutput('{"reply":"ok","action":{"type":"nonsense"}}');
  expect(r.action).toBeNull();
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `parseModelOutput(raw)`: strip code fences, find first `{`…last `}`, `JSON.parse` in try/catch; validate `action.type` against allowlist (`launch_tool` with tool in `breathing|thought_record`, `roleplay_start` with string persona, `roleplay_end`); on any failure return `{ reply: raw.trim(), action: null }`.
- [ ] **Step 4:** Run → PASS.

### Task 4.3: Ollama caller
**Files:** add to `lib/therapist/orchestrate.ts`
- [ ] `callOllama(messages)`: POST `${OLLAMA_URL}/api/chat` with `{model, messages, stream:false, options:{temperature:0.6}}`, 30s timeout; return `message.content`. On network error throw `OllamaOfflineError` (caught upstream to show the friendly offline notice).
- [ ] `runTherapistTurn({ userId, sessionId, userText })`: orchestrates safety → (crisis short-circuit) → loadContext → buildSystemPrompt → history → callOllama → parseModelOutput. Returns `{ reply, action, riskLevel }`.

---

## Phase 5 — Server API

### Task 5.1: Server actions
**Files:** Create `lib/actions/therapy.ts`
- [ ] `startSession(persona)` → insert `therapy_sessions`, return id.
- [ ] `sendMessage(sessionId, text)` → insert user msg; if crisis, insert assistant msg = `CRISIS_RESPONSE`, set `risk_flag='crisis'`, return early; else `runTherapistTurn`, insert assistant msg (+ action), apply roleplay mode changes; return `{reply, action}`.
- [ ] `endSession(sessionId)` → ask Ollama for a 2–3 sentence summary of the transcript, store in `summary`, set `ended_at`.
- [ ] All guarded by `supabase.auth.getUser()` (mirror `lib/actions/logs.ts`).

---

## Phase 6 — Chat UI + tab

### Task 6.1: Talk route + nav
**Files:** Create `app/(app)/talk/page.tsx`; Modify `components/BottomNav.tsx`
- [ ] Add "Talk" nav item (lucide `MessageCircleHeart` or `MessagesSquare`).
- [ ] `page.tsx` (server component): ensure/load latest open session, render `<TherapyChat>` with persistent disclaimer banner.

### Task 6.2: Chat component
**Files:** Create `components/therapy/TherapyChat.tsx`
- [ ] Client component: message list (user/assistant/coach bubbles), text input + send, `useTransition`, calls `sendMessage`. Persona selector (warm/stoic). Mic button + voice-mode toggle (wired in Phase 9). Renders action launch cards (Phase 7) and role-play banner (Phase 8).

---

## Phase 7 — Interactive tools

### Task 7.1: Box breathing
**Files:** Create `components/therapy/BoxBreathing.tsx`
- [ ] Animated 4-4-4-4 (inhale/hold/exhale/hold) circle via CSS transform + state machine; phase label + cycle counter; Start/Stop; opened in existing `Modal.tsx`.

### Task 7.2: CBT thought record
**Files:** Create `components/therapy/ThoughtRecord.tsx`
- [ ] Guided multi-step form: situation → automatic thought → emotion + intensity(0-100) → evidence for/against → balanced thought → re-rate. On submit, post a summarized entry back into the chat via `sendMessage` (prefixed so the model can respond).

### Task 7.3: Launch wiring
**Files:** Modify `components/therapy/TherapyChat.tsx`
- [ ] When an assistant message has `action.type==='launch_tool'`, show a launch card button that opens the matching component in a modal.

---

## Phase 8 — Role-play

### Task 8.1: Mode handling
**Files:** Modify `lib/actions/therapy.ts`, `lib/therapist/prompt.ts`, `components/therapy/TherapyChat.tsx`
- [ ] On `roleplay_start`, set session `mode='roleplay'`, `roleplay_persona`; prompt instructs Qwen to stay in character.
- [ ] Banner "Role-play: <persona> · [End & get feedback]"; End triggers a `sendMessage('[[end roleplay]]')` sentinel → action `roleplay_end` → set `mode='chat'`, insert a `coach`-role feedback message (prompt asks for specific, supportive feedback).

---

## Phase 9 — Voice loop

### Task 9.1: STT endpoint
**Files:** Create `app/api/therapy/transcribe/route.ts`
- [ ] Accept audio blob (multipart), forward to `${WHISPER_URL}/v1/audio/transcriptions`, return `{text}`.

### Task 9.2: TTS endpoint
**Files:** Create `app/api/therapy/speak/route.ts`
- [ ] Accept `{text, voice?}`, POST to `${KOKORO_URL}/v1/audio/speech` (`model:'kokoro'`, `voice:'af_heart'`, `response_format:'mp3'`), stream mp3 back.

### Task 9.3: Mic + playback in chat
**Files:** Modify `components/therapy/TherapyChat.tsx`
- [ ] Mic button uses `MediaRecorder` → POST to `/api/therapy/transcribe` → fill input. Voice-mode toggle: after each assistant reply, fetch `/api/therapy/speak` and play the audio.

---

## Phase 10 — Verification

### Task 10.1: Full test run
- [ ] `npx vitest run` — all therapist unit tests green (safety, memory, parser) plus existing suite unaffected.

### Task 10.2: Manual smoke
- [ ] With all 3 services up: open `/talk`, type a low-mood message → contextual reply + a tool suggestion; launch breathing + thought record; run a role-play and end it for feedback; toggle voice mode and confirm mic→text and reply→audio; type a crisis phrase and confirm the deterministic resources response fires (and Qwen is bypassed).

---

## Self-review notes
- **Spec coverage:** text/voice capture (P9/6), context memory (P3), hybrid tools (P7 + conversational via prompt P4), role-play (P8), safety (P2/5), local stack (P0), data model (P1), error handling (P4 offline error + P9 graceful), testing (P2/3/4/10). All covered.
- **Type consistency:** `parseModelOutput`, `runTherapistTurn`, `buildContextBlock`, `buildSystemPrompt`, `classifyRisk`/`RiskResult`, `CRISIS_RESPONSE` used consistently across tasks.
- **No git** steps included, per user instruction.
