# Goal Planner — Multi-Goal Capture, Schedule Recommendations, Interactive Checklist — Design

**Date:** 2026-06-08
**Status:** Approved (design)
**Fixes:** NL goal entry only created one goal from a multi-goal description.
**Depends on:** existing goal CRUD, `lib/llm.ts`, `lib/goal-parse.ts`, routine engine, reminder sync (Slice 2).
**Out of scope (deferred):** voice-to-voice (dropped this round).

Turns goal creation into a three-step planner — **Capture → Schedule → Save** —
operating on draft goals client-side until one final save, then renders the
result as tickable checklists. No new database tables: a "schedule" is just each
goal's `scheduled_time` + recurrence.

---

## Part 1 — Multi-goal capture

**Problem:** `parseGoalText` returns one `ParsedGoal`; the prompt says "a personal
goal", so "aws course, take pills, spearmint tea" collapses to one.

- `lib/goal-parse.ts` — unchanged `ParsedGoal`; reuse `coerceParsedGoal`.
- `lib/parse-goal-fallback.ts` — add `splitGoals(text): string[]` that splits on
  newlines, commas, and the word "and" (and "also"), trims, drops empties and
  filler like "all that". Existing `fallbackParse` then runs per segment.
- `lib/llm.ts` — add `parseGoals(text): Promise<{ goals: ParsedGoal[]; source: 'llm' | 'fallback' }>`:
  - With `GROQ_API_KEY`: prompt instructs the model to return
    `{ "goals": [ {<goal>}, ... ] }`; map each through `coerceParsedGoal`;
    if the array is empty or malformed, fall back.
  - Without a key / on error: `splitGoals(text).map(fallbackParse)`.
  - Keep `parseGoalText` (single) for any existing caller, implemented as
    `parseGoals` then first element — or remove if unused after the refactor.
- `lib/actions/goals.ts` — add `parseGoalsAction(text)` (auth-gated wrapper, like
  the existing `parseGoal`) and `createGoals(inputs: GoalInput[])`: insert each
  goal, call `syncTaskReminder` for habit goals, revalidate, then `redirect('/goals')`.

---

## Part 2 — Schedule recommendations (whole-day plan, then per-goal tweak)

- `lib/schedule.ts` (pure, unit-tested):
  - `SchedulePlan = { id: string; name: string; emoji: string; assignments: ScheduleAssignment[] }`.
  - `ScheduleAssignment = { goalIndex: number; scheduled_time: string; recurrence_type: RecurrenceType; weekdays?: number[] }`.
  - `fallbackSchedules(goals: ParsedGoal[]): SchedulePlan[]` — deterministic. Produces
    up to three named plans ("Morning focus", "Evening wind-down", "Spread out")
    by distributing goals across fixed time slots (morning 07–10, midday 12–14,
    evening 19–21). Only assigns times to habit goals; projects keep their due
    dates. Stable order in → stable plans out.
- `lib/schedule-llm.ts` — `recommendSchedules(goals): Promise<{ plans: SchedulePlan[]; source }>`:
  Groq prompt returns `{ "plans": [...] }`; each plan validated/coerced (drop
  assignments with out-of-range `goalIndex` or bad time); on missing key / error /
  empty, return `fallbackSchedules(goals)`.
- `components/SchedulePicker.tsx` (client) — renders plan cards; "Use this"
  **applies** the plan's assignments onto the draft goal field-states (sets each
  goal's `scheduled_time`/recurrence), then returns to the editable cards so the
  user can tweak any goal before saving.

The recommendation step is optional: the user can skip straight to Save.

---

## Part 3 — Interactive checklist (home + Plan page)

### Home — time-ordered checklist
- `lib/routine.ts` — sort the returned `habit` items by `scheduled_time`
  (untimed last), and surface each habit's `scheduled_time` on `HabitItem` (add
  the field to the query + interface).
- `components/RoutineView.tsx` / `HabitItem.tsx` — render today's habits as one
  chronological list, each row a checkbox showing the time. Ticking logs `done`
  via the existing `logs` action; unticking clears it. Projects remain as pace
  tiles below. (Reuses the current done/skip/partial logging — no new write path.)

### `/plan` page — full schedule overview
- `app/(app)/plan/page.tsx` + `components/PlanView.tsx` — lists all active goals
  ordered by `scheduled_time`, grouped by morning/midday/evening, showing
  recurrence and time, with an edit link per goal (to `/goals/[id]`). Read-only
  overview of the chosen schedule.
- `components/BottomNav.tsx` — add a "Plan" tab.

---

## Data flow

```
text ─▶ parseGoalsAction ─▶ draft goals[] (chips per goal)
      ─▶ [optional] recommendSchedules ─▶ plan cards ─▶ pick ─▶ apply to drafts ─▶ tweak
      ─▶ createGoals ─▶ reminders synced ─▶ /goals
home: todayRoutine (habits sorted by time) ─▶ checkbox list ─▶ tick = log done
/plan: active goals ordered by time ─▶ overview
```

## Error handling & fallbacks

| Case | Behaviour |
|---|---|
| No `GROQ_API_KEY` | `splitGoals` + per-segment keyword parse; `fallbackSchedules`. Full flow works. |
| LLM returns malformed goals/plans | Coerce/drop invalid entries; if empty, use fallback. |
| Parse yields zero goals | Show one empty editable goal card (manual entry). |
| Plan assignment references a missing goal | Dropped during coercion. |
| Save fails | Inline error; drafts preserved (NEXT_REDIRECT re-thrown). |

## Testing

- Unit: `splitGoals` (comma / "and" / newline / filler), `parseGoals` array
  coercion (incl. empty → fallback path with key unset), `fallbackSchedules`
  (slot distribution, determinism, habit-only assignment, ≤3 plans).
- Static: `tsc`, `vitest` (65 existing stay green), `next lint`, `next build`.
- Manual: enter a 3-goal sentence → three editable cards → Suggest schedule →
  pick a plan → times applied → tweak one → Save all → all three appear in
  /goals and on the home checklist; /plan shows the ordered schedule.

## File summary

| File | Action |
|---|---|
| `lib/parse-goal-fallback.ts` | Modify — `splitGoals` |
| `lib/llm.ts` | Modify — `parseGoals` |
| `lib/schedule.ts` | Create — `SchedulePlan`, `fallbackSchedules` |
| `lib/schedule-llm.ts` | Create — `recommendSchedules` |
| `lib/actions/goals.ts` | Modify — `parseGoalsAction`, `createGoals` |
| `lib/__tests__/parse-goals.test.ts` | Create — split + multi-parse tests |
| `lib/__tests__/schedule.test.ts` | Create — fallback scheduler tests |
| `components/GoalComposer.tsx` | Modify — multi-goal + steps |
| `components/GoalCardEditor.tsx` | Create — per-goal chip editor (extracted) |
| `components/SchedulePicker.tsx` | Create — plan option cards |
| `lib/routine.ts` | Modify — sort habits by time, expose `scheduled_time` |
| `components/RoutineView.tsx`, `HabitItem.tsx` | Modify — time-ordered checklist |
| `app/(app)/plan/page.tsx`, `components/PlanView.tsx` | Create — schedule overview |
| `components/BottomNav.tsx` | Modify — Plan tab |
