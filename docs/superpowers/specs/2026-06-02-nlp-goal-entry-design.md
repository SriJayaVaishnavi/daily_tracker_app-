# Natural-Language Goal Entry — Design

**Date:** 2026-06-02
**Status:** Approved (design), pending spec review
**Parent spec:** [`docs/PRD.md`](../../PRD.md) — pulls forward the v2 item
*"LLM goal suggestion from natural-language input"* into the current build.

This document scopes a single feature: replacing the goal-creation **form** with a
**natural-language text box** whose parsed result is presented as **inline,
editable chips**. Where it differs from the PRD, this feature spec wins for the
current session.

---

## 1. Goal of this feature

Today, creating a goal means filling a multi-field form (`components/GoalForm.tsx`):
title, type, recurrence, weekdays, target value, unit, time, due date, month.

Instead, the user types one sentence — e.g. *"meditate 10 minutes every morning"*
or *"read 12 books by year end"* — an LLM extracts the structured goal fields, and
those fields appear as **editable chips** under the input. The user tweaks any chip
and saves. The same chip editor (without the text box) replaces the existing
**edit** form.

When this feature is done:
- `/goals/new` has no traditional form — only a text box + editable chips.
- `/goals/[id]` edits via the same chip editor, pre-filled, no text box.
- `components/GoalForm.tsx` is deleted.
- A goal can be created/edited end-to-end with the chip UI, with row-level security
  unchanged.

---

## 2. In scope

1. **`lib/llm.ts`** — server-only Groq client wrapper + `parseGoalText(text)`.
2. **`lib/parse-goal-fallback.ts`** — pure, unit-tested keyword heuristic parser
   used when no API key is present or the LLM call fails.
3. **`parseGoal(text)`** Server Action in `lib/actions/goals.ts` — auth-gated,
   calls `lib/llm`, returns a validated partial goal.
4. **`components/GoalComposer.tsx`** — client component: text input (create mode
   only), parse trigger, chip row, save. Replaces `GoalForm`.
5. **`components/EditableChip.tsx`** — one chip primitive with a popover editor and
   variants (enum-select, number+unit, time, date, text).
6. Wire `/goals/new` and `/goals/[id]` to `GoalComposer`; delete `GoalForm.tsx`.
7. Unit tests for the fallback parser and the JSON coercion/validation layer.

## 3. Out of scope (YAGNI)

- Voice input.
- Parsing one sentence into multiple goals.
- NL parsing for mood or progress logging (goals only).
- Streaming/typeahead parsing — parse fires on submit (Enter / button), not on
  every keystroke.
- Any change to the `goals` schema, `createGoal`, or `updateGoal` write logic.

---

## 4. Architecture & data flow

```
/goals/new  (create mode)
┌─────────────────────────────────────┐
│ Describe your goal…                  │
│ [ meditate 10 min every morning   ↵ ]│  free text
└─────────────────────────────────────┘
      │ Server Action: parseGoal(text)
      ▼
   lib/llm.parseGoalText(text)
      ├── GROQ_API_KEY present → Groq (llama-3.3-70b-versatile, JSON mode)
      ├── no key               → lib/parse-goal-fallback
      └── Groq error/timeout   → lib/parse-goal-fallback
      ▼
   validate + coerce → ParsedGoal (partial GoalInput)
      ▼
   chips render: [Habit ▾] [Daily ▾] [Meditate ✎] [10 min ✎] [08:00 ✎] [+category]
      │ all chips editable; required-but-missing chips render empty + highlighted
      ▼
   [ Save goal ] → existing createGoal(input)   (unchanged)

/goals/[id]  (edit mode)
   load goal → chips pre-filled (no text box) → [ Save ] → updateGoal(id, input)
```

**Why a Server Action (not a Route Handler):** keeps `GROQ_API_KEY` server-side,
returns typed data directly, no fetch/JSON boilerplate. A Route Handler buys
nothing here.

---

## 5. Module boundaries

Each unit has one purpose and a clear interface.

- **`lib/llm.ts`** *(server-only)* — Groq client via the OpenAI SDK
  (`baseURL=https://api.groq.com/openai/v1`, `response_format: {type:'json_object'}`,
  model `llama-3.3-70b-versatile`). Exports `parseGoalText(text: string):
  Promise<ParsedGoal>`. Provider auto-detect: `GROQ_API_KEY` → Groq, else fallback;
  on any Groq error, fall back. *Depends on:* env var, `parse-goal-fallback`,
  the coercion layer. *Used by:* the `parseGoal` action only.
- **`lib/parse-goal-fallback.ts`** *(pure, no I/O)* — `fallbackParse(text):
  ParsedGoal`. Keyword heuristics (see §7). *Unit-testable in isolation.*
- **`lib/actions/goals.ts`** — add `parseGoal(text): Promise<ParsedGoal>`
  (`'use server'`, auth-gated). `createGoal` / `updateGoal` / `setGoalStatus` /
  `deleteGoal` unchanged.
- **`components/GoalComposer.tsx`** *(client)* — props
  `{ mode: 'create' } | { mode: 'edit'; goal: Goal }`. Holds chip state, calls
  `parseGoal` (create), `createGoal` / `updateGoal` (save). Reuses the existing
  Save-gate validation rules.
- **`components/EditableChip.tsx`** *(client)* — renders a labelled chip; clicking
  opens a small popover editor. Variants: `enum` (type, recurrence), `numberUnit`
  (target value + unit), `time`, `date`, `weekdays`, `text` (title, category),
  `month`.

---

## 6. Parse contract (`ParsedGoal`)

The LLM is instructed to return JSON matching this shape; the server **validates and
coerces** it before it ever reaches `createGoal`, so a malformed response can never
produce an invalid write.

```ts
interface ParsedGoal {
  goal_type: 'habit' | 'project';   // default 'habit' if ambiguous
  title: string;                    // fallback to raw text if empty
  category?: string;
  description?: string;
  // habit
  recurrence_type?: 'daily' | 'weekly_days' | 'weekly_count';
  weekdays?: number[];              // 0=Sun .. 6=Sat
  target_count?: number;            // for weekly_count
  scheduled_time?: string;          // 'HH:MM'
  // habit (optional) + project (required)
  target_value?: number;
  unit?: string;
  // project
  due_date?: string;                // 'YYYY-MM-DD'
}
```

`period_month` is **not** parsed from text; it defaults to the current month and is
editable via its own chip (mirrors today's form default).

**Coercion rules (server-side):**
- Enum fields clamped to their allowed sets; unknown values dropped.
- `weekdays` filtered to integers 0–6, de-duplicated.
- Numeric fields parsed; `NaN`/negative dropped.
- `scheduled_time` must match `HH:MM`; else dropped.
- `due_date` must match `YYYY-MM-DD`; else dropped.
- Empty `title` → set to the trimmed raw input text.

The chip UI then maps `ParsedGoal` → the existing `GoalInput` on save (adding
`period_month`), reusing the current Save-gate validation:
title required; project requires numeric `target_value` + non-empty `unit`.

---

## 7. Fallback parser heuristics (`fallbackParse`)

Pure function used keyless or on LLM failure. Best-effort, never throws:

| Input pattern | Extracted |
|---|---|
| "every day" / "daily" | `recurrence_type: 'daily'` |
| weekday names ("mon", "tue/thu") | `recurrence_type: 'weekly_days'`, `weekdays:[…]` |
| "3x/week", "3 times a week" | `recurrence_type: 'weekly_count'`, `target_count:3` |
| trailing "10 min", "12 pages", "5 km" | `target_value:10`, `unit:'min'` |
| "by Jun 30", "by year end", "by 2026-06-30" | `goal_type:'project'`, `due_date` |
| "morning" / "8am" / "at 18:00" | `scheduled_time` |
| (no project/due signals) | `goal_type:'habit'` default |

Title = input with the matched recurrence/value/time fragments stripped, trimmed.

---

## 8. Error handling & edge cases

- **No key / LLM down** → `fallbackParse` runs; `GoalComposer` shows a subtle banner:
  *"Guessed from keywords — check the chips."*
- **Vague text** (e.g. "get healthy") → required chips render empty + highlighted;
  **Save disabled** with a hint until filled.
- **Ambiguous type** → default `habit`; user taps the type chip to flip to project.
- **Parse latency** → spinner in the input; chips appear when the parse resolves.
- **Auth** → `parseGoal` is auth-gated like the other actions; unauthenticated calls
  throw. RLS on `goals` is unchanged.
- **Malformed LLM JSON** → coercion drops bad fields; never reaches `createGoal`
  invalid.

---

## 9. Testing / verification

- **`parse-goal-fallback.ts`** — unit tests across phrasings: daily, weekday list,
  N-times-per-week, "X min" measurable, "by <date>" project, time-of-day, vague
  input (→ habit, empty title fallback).
- **Coercion layer** — unit tests: messy/partial LLM JSON (bad enum, negative
  number, malformed time/date, missing title) → valid `ParsedGoal`.
- **Manual** — type several phrases at `/goals/new`, confirm chips, edit a chip,
  save, confirm the goal appears in the list with correct fields; edit an existing
  goal via chips and save; toggle keyless mode and confirm the banner + heuristic
  parse.

---

## 10. Definition of Done

- `/goals/new` shows a text box; submitting parses via Groq (or fallback) and renders
  editable chips; saving creates the goal via the unchanged `createGoal`.
- `/goals/[id]` edits via the same chip editor (no text box), pre-filled, saving via
  `updateGoal`.
- `components/GoalForm.tsx` is deleted; no references remain.
- Keyless mode works via the fallback parser with the banner shown.
- Fallback parser and coercion layer have passing unit tests; existing tests still
  pass; lint clean.
- `GROQ_API_KEY` documented in `.env.example`; live parse verified once the key is set.

---

## 11. Required from the user

- A **`GROQ_API_KEY`** (free at console.groq.com) to enable the live LLM parse. Until
  then the feature runs on the fallback parser, fully usable for development.
