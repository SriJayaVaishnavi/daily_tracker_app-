# Virtual Therapist — Design Spec

**Date:** 2026-06-09
**Status:** Approved (pending written review)
**Author:** brainstormed with Claude

## 1. Summary

Add a **virtual therapist** capability to `daily_tracker_app`: a private,
local-first conversational companion that captures the user's mood (by text or
voice), remembers context across sessions, suggests evidence-based therapist
"tools" (breathing, grounding, CBT, journaling), and can role-play rehearsing
difficult real-life conversations with coaching feedback.

It surfaces as a new **"Talk"** tab in the existing app shell and reuses the
app's Supabase + server-action + Vitest patterns.

## 2. Goals / Non-goals

**Goals**
- Capture mood via **text or voice**, fully offline.
- **Context-aware**: the therapist references recent mood trends, active goals,
  and summaries of past sessions.
- Suggest **therapist tools** — hybrid delivery: most walked through in chat,
  plus 2 polished interactive components (box breathing, CBT thought record).
- **Role-play** rehearsing hard conversations, with in-character responses and
  post-session coaching feedback.
- **Privacy-first / local**: conversational LLM, speech-to-text, and
  text-to-speech all run locally. No third-party AI cloud.
- **Safe by construction**: deterministic crisis handling independent of the LLM.

**Non-goals (YAGNI / later)**
- Therapist personas beyond a simple style selector (warm / stoic).
- Inner-parts / chair-work role-play.
- Mobile-native voice; we use the PWA + local services.
- Diagnosis, clinical advice, or any claim of being real therapy.

## 3. Local stack (all offline)

| Service | Port | Role | Status |
|---|---|---|---|
| Ollama running **Qwen2.5** | 11434 | therapist "brain" (LLM) | to install |
| **Whisper** (faster-whisper) | 9000 | speech-to-text | to set up |
| **Kokoro** TTS | 8880 | text-to-speech | ✅ already running (`~/kokoro-tts`) |

All three expose simple HTTP (OpenAI-style where practical) so app code stays
thin. The only cloud touchpoint is the user's **own** Supabase project (same
place mood notes already live), RLS-locked per user. Inference never leaves the
device; only the stored transcript lives in the cloud DB — a conscious,
documented trade-off.

## 4. Architecture

New **"Talk" tab** → chat UI → server route `/api/therapy/chat` →
`lib/therapist/` orchestration → Ollama + Supabase. Voice in via Whisper,
voice out via Kokoro.

```
[Talk tab] chat UI, mic, tool launchers, persona selector
   │
   ▼ /api/therapy/chat (server)
lib/therapist/
  • safety.ts      → crisis check, runs OUTSIDE the LLM
  • memory.ts      → load mood logs + goals + session summary
  • prompt.ts      → system prompt + persona + context block
  • orchestrate.ts → call Qwen (Ollama), parse {reply, action}
   │           │            │
   ▼           ▼            ▼
Supabase    Ollama       action → launch tool / role-play UI
(sessions,  Qwen2.5
 messages)
Voice in:  mic → Whisper :9000 → text
Voice out: reply → Kokoro :8880 → audio
```

### Conversation orchestration (chosen approach: LLM-orchestrated)

One carefully-authored system prompt drives the conversation. Qwen decides when
to reflect, suggest a tool, or enter role-play, and emits a structured action
with each reply:

```json
{ "reply": "…", "action": { "type": "launch_tool", "tool": "breathing" } }
```

`action` may be `null`, `launch_tool` (`breathing` | `thought_record`),
`roleplay_start` (`{persona}`), or `roleplay_end`. A **tolerant parser** extracts
the reply even when Qwen's JSON is imperfect; on total failure it degrades to a
plain-text reply (mirrors the existing graceful fallback in `lib/llm.ts`).

## 5. Data model (Supabase, RLS per user)

```sql
therapy_sessions
  id          uuid pk default gen_random_uuid()
  user_id     uuid not null → profiles(id)
  persona     text not null default 'warm'    -- 'warm' | 'stoic'
  risk_flag   text not null default 'none'     -- 'none' | 'concern' | 'crisis'
  mode        text not null default 'chat'     -- 'chat' | 'roleplay'
  roleplay_persona text                         -- e.g. 'manager' when mode='roleplay'
  summary     text                              -- rolling memory of this session
  started_at  timestamptz not null default now()
  ended_at    timestamptz

therapy_messages
  id          uuid pk default gen_random_uuid()
  session_id  uuid not null → therapy_sessions(id) on delete cascade
  user_id     uuid not null → profiles(id)
  role        text not null   -- 'user' | 'assistant' | 'coach'
  content     text not null
  action      jsonb           -- launch_tool / roleplay_* / null
  created_at  timestamptz not null default now()
```

RLS: user can only see/insert their own rows (same policies as `mood_logs`).
Migration added under `supabase/migrations/`.

## 6. Memory model ("add the context")

- **Within a session:** full `therapy_messages` history sent to Qwen.
- **Across sessions (long-term):** a compact context block injected into the
  system prompt each turn:
  - last ~10 days of `mood_logs` (mood/energy trend + notable notes),
  - active `goals`,
  - `summary` text from recent sessions.
- On session end, Qwen writes a 2–3 sentence `summary` → future context. Keeps
  the prompt small while persisting memory.

## 7. Safety (deterministic, `lib/therapist/safety.ts`)

- Tiered keyword/regex scan on **each user message** → `none | concern | crisis`.
- **crisis** → app immediately returns a grounding message + India resources
  (Tele-MANAS **14416**, KIRAN **1800-599-0019**, emergency **112**), sets
  `risk_flag='crisis'`, still logs the turn. **Qwen is bypassed** for that turn.
- **concern** → normal reply, but the system prompt gains an extra "be extra
  gentle; gently suggest professional support" instruction.
- Persistent disclaimer on the Talk tab: *"I'm a supportive companion, not a
  substitute for professional care."* Prominent on first visit.
- System prompt guardrails: never diagnose, never give medical/clinical advice,
  always encourage professional help for serious concerns.
- The safety classifier is the **single most-tested unit** — crisis detection
  must never silently regress.

## 8. UI / components

- New **"Talk"** tab in `BottomNav`; route `app/(app)/talk/page.tsx`.
- `components/therapy/TherapyChat.tsx` — message list, text input, mic button,
  persona selector, voice-mode toggle.
- `components/therapy/BoxBreathing.tsx` — animated 4-4-4-4 guide + cycle count.
- `components/therapy/ThoughtRecord.tsx` — guided CBT form (situation →
  automatic thought → emotion + intensity → evidence for/against → balanced
  thought → re-rate), saved into the transcript.
- Reuses existing `Modal.tsx`, calm Tailwind tokens, and app shell styling.

**Voice loop:** mic → record → POST audio to Whisper `:9000` → transcript fills
input → send. Replies optionally auto-spoken via Kokoro `:8880` (voice-mode
toggle, off by default).

**Role-play:** Qwen `roleplay_start` → in-character replies + banner
*"Role-play: <persona> · [End & get feedback]"*; **End** → `roleplay_end` →
`coach`-role feedback message. Mode persisted on the session.

## 9. Error handling (graceful, mirrors `lib/llm.ts`)

- Ollama down → friendly "therapist is offline — start Ollama" notice;
  interactive tools still usable.
- Whisper down → mic disabled with tooltip; text still works.
- Kokoro down → replies still display, no audio.

## 10. Testing (Vitest)

- `safety.ts` — crisis/concern/none classification (highest priority).
- Action parser — tolerant of imperfect Qwen JSON; bad output → plain reply.
- Memory context builder — assembles mood/goals/summary correctly.
- Pure functions tested in isolation; server actions kept thin.
- Manual: end-to-end voice loop (mic → Whisper → Qwen → Kokoro).

## 11. Setup / one-time prerequisites

1. Install **Ollama** (Windows), then `ollama pull qwen2.5` (size TBD by chosen
   variant; 3B ≈ 2 GB, 7B ≈ 4.7 GB).
2. Stand up a local **Whisper** STT server on `:9000` (faster-whisper), with a
   start script under a `~/whisper-stt` dir, mirroring the Kokoro setup.
3. Kokoro TTS already configured (`~/kokoro-tts`, `:8880`).
4. App env: add base URLs for the three local services (e.g.
   `OLLAMA_URL`, `WHISPER_URL`, reuse Kokoro via existing OpenAI base URL).

## 12. Open questions for plan phase

- Qwen2.5 variant (3B for speed vs 7B for quality) — decide during setup based
  on the machine's RAM.
- Whether to auto-summarize mid-session (every N turns) or only at session end.
