# Goal Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture multiple goals from one description, let the AI recommend whole-day schedules the user picks and tweaks, and render the result as time-ordered tickable checklists.

**Architecture:** A three-step client-side planner (Capture → Schedule → Save) over draft goals, saved in one batch. Pure logic (`splitGoals`, `parseGoals`, `fallbackSchedules`, `recommendSchedules`) is unit-tested and LLM-optional; UI builds on the existing chip editor and habit check-offs. No new DB tables — a schedule is each goal's `scheduled_time` + recurrence.

**Tech Stack:** Next.js 14 (App Router, TS), Supabase, Groq (optional), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-08-goal-planner-design.md`

> **Commit note:** Standing rule — never change git state without explicit user approval. Commit steps are boundaries; confirm before committing or batch at the end.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `lib/parse-goal-fallback.ts` | `splitGoals` segmenter | Modify |
| `lib/llm.ts` | `parseGoals` (multi) | Modify |
| `lib/schedule.ts` | `SchedulePlan` types + `fallbackSchedules` | Create |
| `lib/schedule-llm.ts` | `recommendSchedules` (LLM + fallback) | Create |
| `lib/actions/goals.ts` | `parseGoalsAction`, `createGoals`, `buildGoalRow` | Modify |
| `lib/actions/schedule.ts` | `recommendSchedulesAction` | Create |
| `lib/__tests__/parse-goals.test.ts` | split + multi-parse fallback | Create |
| `lib/__tests__/schedule.test.ts` | fallback scheduler | Create |
| `components/GoalCardEditor.tsx` | per-goal chip editor (extracted) | Create |
| `components/GoalComposer.tsx` | multi-goal + steps orchestration | Modify |
| `components/SchedulePicker.tsx` | plan option cards | Create |
| `lib/routine.ts` | sort habits by time, expose `scheduled_time` | Modify |
| `components/HabitItem.tsx` | show time prefix | Modify |
| `components/RoutineView.tsx` | "Today" heading | Modify |
| `app/(app)/plan/page.tsx`, `components/PlanView.tsx` | schedule overview | Create |
| `components/BottomNav.tsx` | Plan tab | Modify |

---

## Task 1: `splitGoals` segmenter

**Files:**
- Modify: `lib/parse-goal-fallback.ts`
- Test: `lib/__tests__/parse-goals.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/parse-goals.test.ts
import { describe, it, expect } from 'vitest';
import { splitGoals } from '@/lib/parse-goal-fallback';

describe('splitGoals', () => {
  it('splits a comma list and strips trailing filler', () => {
    expect(splitGoals('aws course, take pills, spearmint tea all that')).toEqual([
      'aws course',
      'take pills',
      'spearmint tea',
    ]);
  });
  it('splits on the word "and"', () => {
    expect(splitGoals('meditate and journal')).toEqual(['meditate', 'journal']);
  });
  it('splits on newlines', () => {
    expect(splitGoals('run 5km\nread 20 pages')).toEqual(['run 5km', 'read 20 pages']);
  });
  it('keeps a single goal intact', () => {
    expect(splitGoals('learn the aws course')).toEqual(['learn the aws course']);
  });
  it('drops pure-filler segments', () => {
    expect(splitGoals('yoga, all that')).toEqual(['yoga']);
  });
  it('returns [] for empty input', () => {
    expect(splitGoals('   ')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/parse-goals.test.ts`
Expected: FAIL — `splitGoals` is not exported.

- [ ] **Step 3: Add `splitGoals` to `lib/parse-goal-fallback.ts`**

Add at the top of the file (after the import):

```ts
const FILLER = /^(all that|and all that|etc\.?|everything|and so on|and that)$/i;

/**
 * Split a multi-goal description into individual goal phrases. Splits on
 * newlines, commas, semicolons, ampersands, and the words "and"/"also";
 * trims trailing filler ("... all that"); drops empty and pure-filler segments.
 */
export function splitGoals(text: string): string[] {
  return text
    .split(/\n|,|;|&|\band\b|\balso\b/gi)
    .map((s) => s.replace(/\s+(all that|and all that|etc\.?|and so on)\s*$/i, '').trim())
    .filter((s) => s.length > 1 && !FILLER.test(s));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/parse-goals.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/parse-goal-fallback.ts lib/__tests__/parse-goals.test.ts
git commit -m "feat(goals): splitGoals segmenter for multi-goal input"
```

---

## Task 2: `parseGoals` (multi-goal, LLM + fallback)

**Files:**
- Modify: `lib/llm.ts`
- Test: `lib/__tests__/parse-goals.test.ts` (extend)

- [ ] **Step 1: Add the failing test**

Append to `lib/__tests__/parse-goals.test.ts`:

```ts
import { parseGoals } from '@/lib/llm';

describe('parseGoals (no key → fallback)', () => {
  it('returns one parsed goal per segment', async () => {
    const prev = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    try {
      const { goals, source } = await parseGoals('take pills, run 5km');
      expect(source).toBe('fallback');
      expect(goals).toHaveLength(2);
      expect(goals[0].title.toLowerCase()).toContain('pills');
      expect(goals[1].title.toLowerCase()).toContain('run');
    } finally {
      if (prev !== undefined) process.env.GROQ_API_KEY = prev;
    }
  });
  it('falls back to the whole text when nothing splits', async () => {
    const prev = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    try {
      const { goals } = await parseGoals('meditate every morning');
      expect(goals).toHaveLength(1);
    } finally {
      if (prev !== undefined) process.env.GROQ_API_KEY = prev;
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/__tests__/parse-goals.test.ts`
Expected: FAIL — `parseGoals` not exported from `@/lib/llm`.

- [ ] **Step 3: Implement `parseGoals` in `lib/llm.ts`**

Add the import for `splitGoals` to the existing fallback import line:

```ts
import { fallbackParse, splitGoals } from '@/lib/parse-goal-fallback';
```

Add a multi-goal system prompt constant near `SYSTEM_PROMPT`:

```ts
const MULTI_SYSTEM_PROMPT = `You convert a natural-language description that may list SEVERAL goals into JSON.
Return ONLY a JSON object of the form { "goals": [ <goal>, ... ] }.
Split lists like "do X, Y and Z" into one element per distinct goal. Extract every goal mentioned; ignore filler like "all that".
Each <goal> has the optional keys:
- goal_type: "habit" or "project"
- title: short imperative title, scheduling/quantity words removed
- category, recurrence_type ("daily"|"weekly_days"|"weekly_count"), weekdays (0-6, Sun=0),
  target_count, scheduled_time ("HH:MM"), target_value, unit, due_date ("YYYY-MM-DD", projects only)
Omit any key not stated. Never invent a due_date for a habit.`;
```

Add the function:

```ts
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
```

Add the `coerceParsedGoal` import if not already present (it is used by `parseGoalText`):

```ts
import { coerceParsedGoal, type ParsedGoal } from '@/lib/goal-parse';
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/__tests__/parse-goals.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/llm.ts
git commit -m "feat(goals): parseGoals — extract multiple goals from one description"
```

---

## Task 3: `createGoals` batch + `parseGoalsAction`

**Files:**
- Modify: `lib/actions/goals.ts`

- [ ] **Step 1: Extract a row builder and add the new actions**

In `lib/actions/goals.ts`, add the import:

```ts
import { parseGoals } from '@/lib/llm';
```

Add a private row builder (place above `createGoal`):

```ts
/** Map a GoalInput to a goals-table insert row for `userId`. */
function buildGoalRow(userId: string, input: GoalInput) {
  const due_date =
    input.goal_type === 'project'
      ? input.due_date ?? lastDayOfMonth(input.period_month)
      : null;
  return {
    user_id: userId,
    title: input.title,
    description: input.description ?? null,
    category: input.category ?? null,
    goal_type: input.goal_type,
    period_month: input.period_month,
    status: 'active' as const,
    recurrence_type: input.recurrence_type ?? null,
    weekdays: input.weekdays ?? null,
    target_count: input.target_count ?? null,
    scheduled_time: input.scheduled_time ?? null,
    target_value: input.target_value ?? null,
    unit: input.unit ?? null,
    due_date,
  };
}
```

Refactor `createGoal`'s insert to use it (replace the inline object in the `.insert({...})` call with `buildGoalRow(user.id, input)`), keeping the `.select('id').single()` and habit `syncTaskReminder` added earlier.

Add the multi-goal action wrapper and batch create:

```ts
/** Auth-gated multi-goal parse. */
export async function parseGoalsAction(text: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');
  return parseGoals(text);
}

/** Create several goals at once, syncing a reminder for each habit. */
export async function createGoals(inputs: GoalInput[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');

  for (const input of inputs) {
    const { data: inserted, error } = await supabase
      .from('goals')
      .insert(buildGoalRow(user.id, input))
      .select('id')
      .single();
    if (error) throw error;
    if (input.goal_type === 'habit') {
      await syncTaskReminder(inserted.id);
    }
  }

  revalidatePath('/');
  revalidatePath('/goals');
  redirect('/goals');
}
```

- [ ] **Step 2: Verify types + tests**

Run: `npx tsc --noEmit` → Expected: exit 0.
Run: `npx vitest run` → Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/goals.ts
git commit -m "feat(goals): createGoals batch + parseGoalsAction"
```

---

## Task 4: Multi-goal UI — `GoalCardEditor` + `GoalComposer` refactor

**Files:**
- Create: `components/GoalCardEditor.tsx`
- Modify: `components/GoalComposer.tsx`

- [ ] **Step 1: Extract `GoalCardEditor`**

Create `components/GoalCardEditor.tsx` containing the per-goal chips + inline
field editor currently inside `GoalComposer` (the `<div className="flex flex-wrap gap-2">…</div>`
chip block plus the `{active && (…)}` editor panel). It is a controlled component:

```tsx
'use client';
import { useState } from 'react';
import { X } from 'lucide-react';
import type { GoalType, RecurrenceType } from '@/lib/database.types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface Fields {
  goal_type: GoalType;
  title: string;
  category: string;
  recurrence_type: RecurrenceType;
  weekdays: number[];
  target_count: string;
  scheduled_time: string;
  target_value: string;
  unit: string;
  due_date: string;
  month: string; // YYYY-MM
}

export default function GoalCardEditor({
  fields,
  onChange,
  onRemove,
}: {
  fields: Fields;
  onChange: (next: Fields) => void;
  onRemove?: () => void;
}) {
  // Move the existing `active` state, `set`, `toggleWeekday`, `recurrenceLabel`,
  // `targetLabel`, the chip row, and the inline editor panel here, operating on
  // `fields`/`onChange` instead of GoalComposer's local state. Render `onRemove`
  // as an ✕ button in the card header when provided.
  // (Body is the chip + editor JSX lifted verbatim from GoalComposer, with
  //  `set(k,v)` implemented as `onChange({ ...fields, [k]: v })`.)
  return null; // replaced by the lifted JSX during implementation
}
```

Implementation note: the chip row and editor panel JSX already exist in
`GoalComposer` (lines ~257–467 of the current file). Move them verbatim; the only
change is `set`/`toggleWeekday` call `onChange` with the updated `fields`, and the
`title`/`target`/`month` field constants (`WEEKDAYS`, `recurrenceLabel`,
`targetLabel`, `fieldClass`) move with them. Export `Fields`, `emptyFields`,
`fromParsed`, `fromGoal` helpers from here so `GoalComposer` imports them.

- [ ] **Step 2: Rework `GoalComposer` into the multi-goal stepper**

`GoalComposer` keeps two modes. **Edit mode** (`{ mode:'edit'; goal }`) is unchanged
behaviour: render one `GoalCardEditor` (no remove) + Save → `updateGoal`.

**Create mode** becomes a stepper with state:

```tsx
const [goals, setGoals] = useState<Fields[]>([]);          // draft goals
const [text, setText] = useState('');
const [step, setStep] = useState<'describe' | 'edit'>('describe');
const [source, setSource] = useState<'llm' | 'fallback' | null>(null);
const [plans, setPlans] = useState<SchedulePlan[] | null>(null); // Task 7
```

- **Describe step:** the existing textarea + Parse button, but calls
  `parseGoalsAction(text)`; on result, `setGoals(res.goals.map(fromParsed))`,
  `setSource(res.source)`, `setStep('edit')`.
- **Edit step:** map `goals` to `GoalCardEditor` (with `onRemove` that splices
  index out, and `onChange` that replaces index), an "+ Add a goal" button
  (`setGoals([...goals, emptyFields()])`), a "Suggest schedule" button (Task 7),
  and **"Save all"** → `createGoals(goals.map(buildInput))`. The `buildInput`
  helper is the existing one, parameterized by a `Fields` argument.
- The `fallback` info banner shows when `source === 'fallback'`.
- Validation: disable "Save all" unless every goal has a non-empty title and each
  project goal has target_value + unit (reuse the existing `titleInvalid` /
  `projectInvalid` logic per goal).

- [ ] **Step 3: Verify types, lint, build**

Run: `npx tsc --noEmit` → exit 0.
Run: `npx next lint` → no errors.
Run: `npm run build` → success.

- [ ] **Step 4: Commit**

```bash
git add components/GoalCardEditor.tsx components/GoalComposer.tsx
git commit -m "feat(goals): multi-goal capture UI (card editor + stepper)"
```

---

## Task 5: `fallbackSchedules` (pure scheduler)

**Files:**
- Create: `lib/schedule.ts`
- Test: `lib/__tests__/schedule.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/schedule.test.ts
import { describe, it, expect } from 'vitest';
import { fallbackSchedules } from '@/lib/schedule';
import type { ParsedGoal } from '@/lib/goal-parse';

const habit = (title: string): ParsedGoal => ({ goal_type: 'habit', title });

describe('fallbackSchedules', () => {
  it('returns up to three named plans for habit goals', () => {
    const plans = fallbackSchedules([habit('pills'), habit('aws'), habit('tea')]);
    expect(plans).toHaveLength(3);
    expect(plans.map((p) => p.id)).toEqual(['morning', 'evening', 'spread']);
    for (const p of plans) expect(p.assignments).toHaveLength(3);
  });
  it('assigns morning-slot times in the morning plan', () => {
    const plans = fallbackSchedules([habit('pills'), habit('aws')]);
    const morning = plans.find((p) => p.id === 'morning')!;
    expect(morning.assignments[0].scheduled_time < '12:00').toBe(true);
  });
  it('is deterministic', () => {
    const goals = [habit('a'), habit('b'), habit('c')];
    expect(fallbackSchedules(goals)).toEqual(fallbackSchedules(goals));
  });
  it('excludes project goals from assignments', () => {
    const goals: ParsedGoal[] = [habit('pills'), { goal_type: 'project', title: 'read book' }];
    const plans = fallbackSchedules(goals);
    for (const p of plans) {
      expect(p.assignments.every((a) => a.goalIndex === 0)).toBe(true);
    }
  });
  it('returns [] when there are no habit goals', () => {
    expect(fallbackSchedules([{ goal_type: 'project', title: 'x' }])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/__tests__/schedule.test.ts`
Expected: FAIL — cannot resolve `@/lib/schedule`.

- [ ] **Step 3: Implement `lib/schedule.ts`**

```ts
import type { RecurrenceType } from '@/lib/database.types';
import type { ParsedGoal } from '@/lib/goal-parse';

export interface ScheduleAssignment {
  goalIndex: number;
  scheduled_time: string; // 'HH:MM'
  recurrence_type: RecurrenceType;
  weekdays?: number[];
}

export interface SchedulePlan {
  id: string;
  name: string;
  emoji: string;
  assignments: ScheduleAssignment[];
}

const MORNING = ['07:00', '08:00', '09:00', '10:00'];
const MIDDAY = ['12:00', '13:00', '14:00'];
const EVENING = ['19:00', '20:00', '21:00'];

function planFor(
  id: string,
  name: string,
  emoji: string,
  times: string[],
  goals: ParsedGoal[],
  habitIdx: number[],
): SchedulePlan {
  const assignments = habitIdx.map((gi, k) => ({
    goalIndex: gi,
    scheduled_time: goals[gi].scheduled_time ?? times[k % times.length],
    recurrence_type: goals[gi].recurrence_type ?? ('daily' as RecurrenceType),
    weekdays: goals[gi].weekdays,
  }));
  return { id, name, emoji, assignments };
}

/**
 * Deterministic schedule suggestions: spread habit goals across morning,
 * evening, or mixed time slots. Projects are excluded (they keep due dates).
 * Goals that already have a scheduled_time keep it. Returns [] when no habits.
 */
export function fallbackSchedules(goals: ParsedGoal[]): SchedulePlan[] {
  const habitIdx = goals
    .map((g, i) => (g.goal_type === 'habit' ? i : -1))
    .filter((i) => i >= 0);
  if (habitIdx.length === 0) return [];

  return [
    planFor('morning', 'Morning focus', '🌅', MORNING, goals, habitIdx),
    planFor('evening', 'Evening wind-down', '🌙', EVENING, goals, habitIdx),
    planFor(
      'spread',
      'Spread out',
      '⚖️',
      [MORNING[1], MIDDAY[0], EVENING[1], MORNING[2], MIDDAY[1], EVENING[2]],
      goals,
      habitIdx,
    ),
  ];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run lib/__tests__/schedule.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/schedule.ts lib/__tests__/schedule.test.ts
git commit -m "feat(schedule): deterministic fallback schedule generator"
```

---

## Task 6: `recommendSchedules` (LLM + fallback) + action

**Files:**
- Create: `lib/schedule-llm.ts`
- Create: `lib/actions/schedule.ts`

- [ ] **Step 1: Implement `lib/schedule-llm.ts`**

```ts
import type { ParsedGoal } from '@/lib/goal-parse';
import type { RecurrenceType } from '@/lib/database.types';
import { fallbackSchedules, type SchedulePlan, type ScheduleAssignment } from '@/lib/schedule';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const RECURRENCES: RecurrenceType[] = ['daily', 'weekly_days', 'weekly_count'];

const SYSTEM = `You are a gentle daily-routine planner. Given a list of goals (0-indexed), propose 2-3 whole-day schedules.
Return ONLY JSON: { "plans": [ { "id": string, "name": string, "emoji": string, "assignments": [ { "goalIndex": number, "scheduled_time": "HH:MM", "recurrence_type": "daily"|"weekly_days"|"weekly_count", "weekdays": [0-6]? } ] } ] }.
Only assign times to habit goals. Use realistic, humane times. Each plan should cover every habit goal once.`;

function coercePlans(raw: unknown, goals: ParsedGoal[]): SchedulePlan[] {
  const arr = Array.isArray((raw as { plans?: unknown[] })?.plans)
    ? (raw as { plans: unknown[] }).plans
    : [];
  const plans: SchedulePlan[] = [];
  for (const p of arr) {
    const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
    const rawAssigns = Array.isArray(o.assignments) ? o.assignments : [];
    const assignments: ScheduleAssignment[] = [];
    for (const a of rawAssigns) {
      const ao = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
      const gi = ao.goalIndex;
      const t = ao.scheduled_time;
      if (typeof gi !== 'number' || gi < 0 || gi >= goals.length) continue;
      if (typeof t !== 'string' || !/^\d{2}:\d{2}$/.test(t)) continue;
      const rt = RECURRENCES.includes(ao.recurrence_type as RecurrenceType)
        ? (ao.recurrence_type as RecurrenceType)
        : 'daily';
      const wd = Array.isArray(ao.weekdays)
        ? (ao.weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) as number[])
        : undefined;
      assignments.push({ goalIndex: gi, scheduled_time: t, recurrence_type: rt, weekdays: wd });
    }
    if (assignments.length === 0) continue;
    plans.push({
      id: typeof o.id === 'string' && o.id ? o.id : `plan-${plans.length}`,
      name: typeof o.name === 'string' && o.name ? o.name : 'Plan',
      emoji: typeof o.emoji === 'string' && o.emoji ? o.emoji : '🗓️',
      assignments,
    });
  }
  return plans;
}

/** Recommend whole-day schedules. Groq when keyed; deterministic fallback otherwise. */
export async function recommendSchedules(
  goals: ParsedGoal[],
): Promise<{ plans: SchedulePlan[]; source: 'llm' | 'fallback' }> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { plans: fallbackSchedules(goals), source: 'fallback' };

  try {
    const userMsg = JSON.stringify(
      goals.map((g, i) => ({ index: i, goal_type: g.goal_type, title: g.title })),
    );
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userMsg },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { plans: fallbackSchedules(goals), source: 'fallback' };
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return { plans: fallbackSchedules(goals), source: 'fallback' };
    const plans = coercePlans(JSON.parse(content), goals);
    if (plans.length === 0) return { plans: fallbackSchedules(goals), source: 'fallback' };
    return { plans, source: 'llm' };
  } catch {
    return { plans: fallbackSchedules(goals), source: 'fallback' };
  }
}
```

- [ ] **Step 2: Implement `lib/actions/schedule.ts`**

```ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { recommendSchedules } from '@/lib/schedule-llm';
import type { ParsedGoal } from '@/lib/goal-parse';

/** Auth-gated schedule recommendation over draft goals. */
export async function recommendSchedulesAction(goals: ParsedGoal[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');
  return recommendSchedules(goals);
}
```

- [ ] **Step 3: Verify types + tests**

Run: `npx tsc --noEmit` → exit 0.
Run: `npx vitest run` → all pass.

- [ ] **Step 4: Commit**

```bash
git add lib/schedule-llm.ts lib/actions/schedule.ts
git commit -m "feat(schedule): LLM schedule recommendations with fallback"
```

---

## Task 7: `SchedulePicker` + wire into `GoalComposer`

**Files:**
- Create: `components/SchedulePicker.tsx`
- Modify: `components/GoalComposer.tsx`

- [ ] **Step 1: Create `SchedulePicker.tsx`**

```tsx
'use client';
import type { SchedulePlan } from '@/lib/schedule';

export default function SchedulePicker({
  plans,
  goalTitles,
  onUse,
  onSkip,
}: {
  plans: SchedulePlan[];
  goalTitles: string[];
  onUse: (plan: SchedulePlan) => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-fg">Pick a plan — you can tweak times after.</p>
      <div className="grid gap-3">
        {plans.map((plan) => (
          <div key={plan.id} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <h3 className="font-serif text-base font-semibold text-foreground">
              {plan.emoji} {plan.name}
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-muted-fg">
              {[...plan.assignments]
                .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))
                .map((a) => (
                  <li key={`${plan.id}-${a.goalIndex}`}>
                    <span className="tabular-nums text-foreground">{a.scheduled_time}</span>{' '}
                    {goalTitles[a.goalIndex] ?? `Goal ${a.goalIndex + 1}`}
                  </li>
                ))}
            </ul>
            <button
              type="button"
              onClick={() => onUse(plan)}
              className="transition-calm mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Use this plan
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onSkip}
        className="transition-calm text-sm font-medium text-muted-fg hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        Skip — set times myself
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `GoalComposer`**

- Add `import SchedulePicker from '@/components/SchedulePicker';`,
  `import { recommendSchedulesAction } from '@/lib/actions/schedule';`,
  `import type { SchedulePlan } from '@/lib/schedule';`.
- Add a third step value `'schedule'` to the `step` union and `plans` state.
- "Suggest schedule" button (edit step): builds `ParsedGoal[]` from the draft
  `goals` (map each `Fields` → `{ goal_type, title, recurrence_type, weekdays,
  scheduled_time: fields.scheduled_time || undefined }`), calls
  `recommendSchedulesAction`, `setPlans(res.plans)`, `setStep('schedule')`.
- Render `SchedulePicker` when `step === 'schedule'`:
  - `goalTitles={goals.map((g) => g.title)}`
  - `onSkip={() => setStep('edit')}`
  - `onUse={(plan) => { setGoals((gs) => gs.map((g, i) => { const a = plan.assignments.find((x) => x.goalIndex === i); return a ? { ...g, scheduled_time: a.scheduled_time, recurrence_type: a.recurrence_type, weekdays: a.weekdays ?? g.weekdays } : g; })); setStep('edit'); }}`
- If `recommendSchedulesAction` returns `plans.length === 0` (all projects),
  show "No habit goals to schedule" and stay on edit.

- [ ] **Step 3: Verify types, lint, build**

Run: `npx tsc --noEmit` → exit 0.
Run: `npx next lint` → no errors.
Run: `npm run build` → success.

- [ ] **Step 4: Commit**

```bash
git add components/SchedulePicker.tsx components/GoalComposer.tsx
git commit -m "feat(schedule): plan picker step in the goal composer"
```

---

## Task 8: Time-ordered home checklist

**Files:**
- Modify: `lib/routine.ts`
- Modify: `components/HabitItem.tsx`
- Modify: `components/RoutineView.tsx`

- [ ] **Step 1: Add `scheduled_time` to the routine query + type**

In `lib/routine.ts`:
- Add `scheduled_time: string | null;` to the `HabitItem` interface.
- Add `scheduled_time` to the tasks `.select(...)` string and to the row cast type.
- Set `scheduled_time: t.scheduled_time` in the `habit.push({...})` object.
- Before returning, sort: `habit.sort((a, b) => (a.scheduled_time ?? '99:99').localeCompare(b.scheduled_time ?? '99:99'));`

- [ ] **Step 2: Show the time in `HabitItem`**

In `components/HabitItem.tsx`, in the metadata row (the `<div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-fg">`), prepend:

```tsx
{item.scheduled_time && (
  <span className="tabular-nums font-medium text-foreground">
    {item.scheduled_time.slice(0, 5)}
  </span>
)}
```

- [ ] **Step 3: Rename the home heading**

In `components/RoutineView.tsx`, change the habits heading text from
`Today&rsquo;s habits` to `Today` (the list is now the chronological checklist).

- [ ] **Step 4: Verify types, lint, tests, build**

Run: `npx tsc --noEmit` → exit 0.
Run: `npx vitest run` → all pass.
Run: `npx next lint` → no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/routine.ts components/HabitItem.tsx components/RoutineView.tsx
git commit -m "feat(routine): time-ordered home checklist with times"
```

---

## Task 9: `/plan` schedule overview + nav tab

**Files:**
- Create: `app/(app)/plan/page.tsx`
- Create: `components/PlanView.tsx`
- Modify: `components/BottomNav.tsx`

- [ ] **Step 1: Create `components/PlanView.tsx`**

```tsx
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import type { Goal } from '@/lib/database.types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function recurrenceLabel(g: Goal): string {
  if (g.recurrence_type === 'daily') return 'Daily';
  if (g.recurrence_type === 'weekly_days')
    return (g.weekdays ?? []).map((d) => WEEKDAYS[d]).join(', ') || 'Weekly';
  if (g.recurrence_type === 'weekly_count') return `${g.target_count ?? '?'}×/week`;
  return '';
}

export default function PlanView({ goals }: { goals: Goal[] }) {
  if (goals.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted-fg shadow-sm">
        No scheduled habits yet. Create goals and pick a schedule to see your plan here.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {goals.map((g) => (
        <li
          key={g.id}
          className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <span className="tabular-nums text-sm font-semibold text-foreground">
              {g.scheduled_time ? g.scheduled_time.slice(0, 5) : '—'}
            </span>
            <div>
              <p className="text-base text-foreground">{g.title}</p>
              <p className="text-xs text-muted-fg">{recurrenceLabel(g)}</p>
            </div>
          </div>
          <Link
            href={`/goals/${g.id}`}
            aria-label={`Edit ${g.title}`}
            className="transition-calm flex h-10 w-10 items-center justify-center rounded-full text-muted-fg hover:bg-background hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Pencil aria-hidden="true" size={16} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Create `app/(app)/plan/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { needsPasswordSetup } from '@/lib/auth';
import PlanView from '@/components/PlanView';

export const dynamic = 'force-dynamic';

export default async function PlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (needsPasswordSetup(user)) redirect('/set-password');

  const { data: goals } = await supabase
    .from('goals')
    .select('*')
    .eq('goal_type', 'habit')
    .eq('status', 'active');

  const sorted = (goals ?? []).sort((a, b) =>
    (a.scheduled_time ?? '99:99').localeCompare(b.scheduled_time ?? '99:99'),
  );

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Your plan</h1>
      <PlanView goals={sorted} />
    </div>
  );
}
```

- [ ] **Step 3: Add the Plan tab to `BottomNav`**

Import `CalendarCheck` from `lucide-react` and add to `items` after Goals:

```tsx
import { Home, Target, CalendarCheck, HeartPulse, Settings } from 'lucide-react';
// ...
const items = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/goals', label: 'Goals', icon: Target },
  { href: '/plan', label: 'Plan', icon: CalendarCheck },
  { href: '/mood', label: 'Mood', icon: HeartPulse },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;
```

- [ ] **Step 4: Verify types, lint, build**

Run: `npx tsc --noEmit` → exit 0.
Run: `npx next lint` → no errors.
Run: `npm run build` → success; `/plan` route present.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/plan/page.tsx" components/PlanView.tsx components/BottomNav.tsx
git commit -m "feat(plan): schedule overview page + nav tab"
```

---

## Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Static suite**

Run: `npx vitest run` → Expected: all pass (65 existing + 6 split + 2 parseGoals + 5 schedule = 78).
Run: `npx tsc --noEmit` → exit 0.
Run: `npx next lint` → no errors.
Run: `npm run build` → success; routes `/plan`, `/goals/new`, `/` compile.

- [ ] **Step 2: Manual (record results)**

With `npm run dev` and a logged-in session:
1. `/goals/new` → enter "aws course, take pills, spearmint tea all that" → Parse →
   **three** editable goal cards appear.
2. Tweak/remove a card; "+ Add a goal" adds an empty card.
3. "Suggest schedule" → 2-3 plan cards → "Use this plan" → times fill into each card.
4. Tweak one card's time → "Save all" → all three appear in `/goals`.
5. Home shows the three habits as a time-ordered checklist with times; tick one → logged done.
6. `/plan` lists the three ordered by time with recurrence + edit links.

- [ ] **Step 3: Final commit (if tracked changes remain)**

```bash
git add -A
git commit -m "chore(planner): verification pass"
```

---

## Self-Review (completed)

- **Spec coverage:** Part 1 → Tasks 1-4; Part 2 → Tasks 5-7; Part 3 → Tasks 8-9; testing/fallbacks → Tasks 1,2,5 + 10. No gaps.
- **Placeholder scan:** the only non-literal step is Task 4 Step 1's `return null` stub, explicitly annotated to be replaced by JSX lifted from the named line range of the existing `GoalComposer` — concrete instruction, not a vague TODO. All pure-logic tasks carry full code.
- **Type consistency:** `Fields` (defined in `GoalCardEditor`, imported by `GoalComposer`), `ParsedGoal`, `SchedulePlan`/`ScheduleAssignment` (defined Task 5, consumed Tasks 6-7), `parseGoals`/`parseGoalsAction`/`createGoals`/`recommendSchedules`/`recommendSchedulesAction` signatures match across tasks. `HabitItem.scheduled_time` added in Task 8 matches its consumer.
