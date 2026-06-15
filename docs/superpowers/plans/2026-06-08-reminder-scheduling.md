# Reminder Scheduling + Local Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing `reminders` table deliver scheduled Web Push — rows created from user actions, a pure function computes the next UTC fire time, and a token-guarded processor route sends due reminders and advances them.

**Architecture:** Pure scheduling logic (`lib/reminders.ts`, unit-tested) is consumed by session-scoped server actions (create/sync/toggle) and by a service-role processor route (`/api/reminders/process`) that reuses the Slice 1 `sendPushToUser` primitive. The processor matches the contract a future Supabase Edge Function + pg_cron will assume, so the production port is a copy, not a rewrite.

**Tech Stack:** Next.js 14 (App Router, TS), Supabase (Postgres/Auth/RLS), `web-push`, `date-fns-tz`, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-08-reminder-scheduling-design.md`

> **Commit note:** This repo follows a standing rule — *never change git state without explicit user approval.* The `Commit` steps are the intended commit boundaries; during execution, confirm with the user before each commit (or batch at the end if they prefer).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `lib/database.types.ts` | `ReminderKind`, `Reminder` type, `reminders` Tables entry | Modify |
| `lib/reminders.ts` | Pure `computeNextFireAt` + `buildReminderPayload` | Create |
| `lib/__tests__/reminders.test.ts` | Unit tests for the pure logic | Create |
| `lib/push.ts` | Add optional `client` param to `sendPushToUser` | Modify |
| `lib/supabase/admin.ts` | Service-role client (processor only) | Create |
| `lib/actions/reminders.ts` | `syncTaskReminder`, daily-brief/mood toggles, getter | Create |
| `lib/actions/goals.ts` | Call `syncTaskReminder` on habit create/update | Modify |
| `app/api/reminders/process/route.ts` | Token-guarded service-role processor | Create |
| `components/ReminderSettings.tsx` | Daily-brief + mood toggles with time pickers | Create |
| `components/RunDueRemindersButton.tsx` | Dev "Run due reminders now" button | Create |
| `app/(app)/settings/page.tsx` | Render the Reminders section | Modify |
| `.env.example` | Document new env vars | Modify |
| `.env.local` | Local dev values (token generated; service key user-supplied) | Modify |

---

## Task 1: Reminder types

**Files:**
- Modify: `lib/database.types.ts`

- [ ] **Step 1: Add the `ReminderKind` and `Reminder` types**

After the `PushSubscription` type (around line 113), add:

```ts
export type ReminderKind = 'task' | 'daily_brief' | 'mood_checkin';

export type Reminder = {
  id: string;
  user_id: string;
  task_id: string | null;
  kind: ReminderKind;
  title_template: string | null;
  scheduled_time: string;           // 'HH:MM:SS', user-local
  recurrence_type: RecurrenceType;
  weekdays: number[] | null;
  next_fire_at: string;             // ISO UTC
  is_enabled: boolean;
  last_sent_at: string | null;
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 2: Add the `reminders` entry to the `Tables` map**

Inside `Database['public']['Tables']`, after the `push_subscriptions` entry:

```ts
      reminders: {
        Row: Reminder;
        Insert: Omit<
          Reminder,
          'id' | 'created_at' | 'updated_at' | 'last_sent_at' | 'is_enabled'
        > & { last_sent_at?: string | null; is_enabled?: boolean };
        Update: Partial<Reminder>;
        Relationships: [];
      };
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add lib/database.types.ts
git commit -m "feat(reminders): add Reminder type + reminders table to db types"
```

---

## Task 2: Pure scheduling logic + tests

**Files:**
- Create: `lib/reminders.ts`
- Test: `lib/__tests__/reminders.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/reminders.test.ts
import { describe, it, expect } from 'vitest';
import { computeNextFireAt, buildReminderPayload, DEFAULT_BRIEF_TEXT } from '@/lib/reminders';

const TZ = 'Asia/Kolkata'; // UTC+5:30, no DST

describe('computeNextFireAt', () => {
  it('daily: fires later today when the time is still ahead', () => {
    // 05:30 IST = 00:00Z; 07:00 IST = 01:30Z, which is ahead.
    const after = new Date('2026-06-08T00:00:00Z');
    const next = computeNextFireAt('07:00', 'daily', null, TZ, after);
    expect(next?.toISOString()).toBe('2026-06-08T01:30:00.000Z');
  });

  it('daily: rolls to tomorrow when the time already passed today', () => {
    // 10:30 IST = 05:00Z; today 07:00 IST (01:30Z) is behind → tomorrow.
    const after = new Date('2026-06-08T05:00:00Z');
    const next = computeNextFireAt('07:00', 'daily', null, TZ, after);
    expect(next?.toISOString()).toBe('2026-06-09T01:30:00.000Z');
  });

  it('weekly_days: picks the next matching weekday', () => {
    // 2026-06-10 is a Wednesday (3). Target Friday (5) → 2026-06-12.
    const after = new Date('2026-06-10T00:00:00Z');
    const next = computeNextFireAt('09:00', 'weekly_days', [5], TZ, after);
    expect(next?.toISOString()).toBe('2026-06-12T03:30:00.000Z'); // 09:00 IST
  });

  it('weekly_days: wraps to next week when today matches but time passed', () => {
    // Wed 10:30 IST (05:00Z); target Wed (3) at 09:00 IST (03:30Z) already past → +7 days.
    const after = new Date('2026-06-10T05:00:00Z');
    const next = computeNextFireAt('09:00', 'weekly_days', [3], TZ, after);
    expect(next?.toISOString()).toBe('2026-06-17T03:30:00.000Z');
  });

  it('weekly_count: never fires (returns null)', () => {
    const after = new Date('2026-06-08T00:00:00Z');
    expect(computeNextFireAt('07:00', 'weekly_count', null, TZ, after)).toBeNull();
  });

  it('accepts HH:MM:SS as well as HH:MM', () => {
    const after = new Date('2026-06-08T00:00:00Z');
    const next = computeNextFireAt('07:00:00', 'daily', null, TZ, after);
    expect(next?.toISOString()).toBe('2026-06-08T01:30:00.000Z');
  });
});

describe('buildReminderPayload', () => {
  it('task: prompts for the task by title', () => {
    expect(buildReminderPayload('task', { title: 'Meditate', briefText: null })).toEqual({
      title: 'Meditate',
      body: 'Time for Meditate',
      url: '/',
      tag: 'reminder-task',
    });
  });

  it('daily_brief: uses the generated text when present', () => {
    const p = buildReminderPayload('daily_brief', { title: null, briefText: 'You showed up 5 days running.' });
    expect(p.body).toBe('You showed up 5 days running.');
    expect(p.title).toBe('Your daily brief');
  });

  it('daily_brief: falls back to the template line when no brief exists', () => {
    const p = buildReminderPayload('daily_brief', { title: null, briefText: null });
    expect(p.body).toBe(DEFAULT_BRIEF_TEXT);
  });

  it('mood_checkin: asks how you feel', () => {
    const p = buildReminderPayload('mood_checkin', { title: null, briefText: null });
    expect(p).toEqual({
      title: 'Mood check-in',
      body: 'How are you feeling today?',
      url: '/',
      tag: 'reminder-mood',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/reminders.test.ts`
Expected: FAIL — cannot resolve module `@/lib/reminders`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/reminders.ts
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import type { RecurrenceType } from '@/lib/database.types';
import type { PushPayload } from '@/lib/push';

export type ReminderKind = 'task' | 'daily_brief' | 'mood_checkin';

/** Shown by a daily-brief reminder before Slice 3 populates `daily_briefs`. */
export const DEFAULT_BRIEF_TEXT = 'A fresh day. Show up for one small thing. 🌱';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 'HH:MM' or 'HH:MM:SS' → {h, m}. */
function parseTime(t: string): { h: number; m: number } {
  const [h, m] = t.split(':');
  return { h: Number(h), m: Number(m) };
}

/** Add whole days to a 'YYYY-MM-DD' calendar date (tz-independent). */
function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(dateIso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Calendar weekday (0=Sun..6=Sat) of a 'YYYY-MM-DD' date. */
function weekdayOfIso(dateIso: string): number {
  return new Date(dateIso + 'T00:00:00Z').getUTCDay();
}

/**
 * The next UTC instant strictly after `after` that a reminder should fire.
 * `weekly_count` has no per-day fire and returns null. Scans up to 8 local
 * days so `weekly_days` wraps the week even when today already matched.
 */
export function computeNextFireAt(
  scheduledTime: string,
  recurrenceType: RecurrenceType,
  weekdays: number[] | null,
  tz: string,
  after: Date,
): Date | null {
  if (recurrenceType === 'weekly_count') return null;
  const { h, m } = parseTime(scheduledTime);
  const startIso = formatInTimeZone(after, tz, 'yyyy-MM-dd');

  for (let offset = 0; offset <= 8; offset++) {
    const dateIso = addDaysIso(startIso, offset);
    if (recurrenceType === 'weekly_days') {
      if (!weekdays || !weekdays.includes(weekdayOfIso(dateIso))) continue;
    }
    // Interpret the wall-clock time as local to `tz`, convert to the UTC instant.
    const fireUtc = fromZonedTime(`${dateIso}T${pad(h)}:${pad(m)}:00`, tz);
    if (fireUtc.getTime() > after.getTime()) return fireUtc;
  }
  return null;
}

/** Build the push payload for a due reminder, by kind. */
export function buildReminderPayload(
  kind: ReminderKind,
  ctx: { title?: string | null; briefText?: string | null },
): PushPayload {
  switch (kind) {
    case 'task': {
      const title = ctx.title ?? 'Routine';
      return { title, body: `Time for ${title}`, url: '/', tag: 'reminder-task' };
    }
    case 'daily_brief':
      return {
        title: 'Your daily brief',
        body: ctx.briefText ?? DEFAULT_BRIEF_TEXT,
        url: '/',
        tag: 'reminder-brief',
      };
    case 'mood_checkin':
      return {
        title: 'Mood check-in',
        body: 'How are you feeling today?',
        url: '/',
        tag: 'reminder-mood',
      };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/reminders.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/reminders.ts lib/__tests__/reminders.test.ts
git commit -m "feat(reminders): pure next-fire computation + payload builder"
```

---

## Task 3: Optional client param on `sendPushToUser`

**Files:**
- Modify: `lib/push.ts`

- [ ] **Step 1: Add the import and the optional param**

At the top of `lib/push.ts`, add:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
```

Change the `sendPushToUser` signature and its first line:

```ts
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  client?: SupabaseClient<Database>,
): Promise<{ sent: number; pruned: number }> {
  configure();
  const supabase = client ?? (await createClient());
```

(The rest of the function body is unchanged — it already uses `supabase`.)

- [ ] **Step 2: Verify types + existing tests/callers**

Run: `npx tsc --noEmit`
Expected: exit 0 (existing callers omit the arg and still typecheck).
Run: `npx vitest run`
Expected: all tests PASS.

If `npx tsc --noEmit` reports `Cannot find module '@supabase/supabase-js'`, install it:
Run: `npm install @supabase/supabase-js` then re-run tsc (it ships with `@supabase/ssr`, so this is rarely needed).

- [ ] **Step 3: Commit**

```bash
git add lib/push.ts package.json package-lock.json
git commit -m "feat(push): allow injecting a Supabase client into sendPushToUser"
```

---

## Task 4: Service-role admin client

**Files:**
- Create: `lib/supabase/admin.ts`

- [ ] **Step 1: Write the client factory**

```ts
// lib/supabase/admin.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/**
 * Service-role Supabase client — bypasses RLS. Used ONLY by the reminder
 * processor route, which acts on behalf of all users (exactly as the future
 * pg_cron-invoked Edge Function will). Never import this from a Client
 * Component or a normal user-facing action.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/admin.ts
git commit -m "feat(reminders): service-role admin client for the processor"
```

---

## Task 5: Reminder server actions

**Files:**
- Create: `lib/actions/reminders.ts`

- [ ] **Step 1: Write the actions**

```ts
// lib/actions/reminders.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { computeNextFireAt } from '@/lib/reminders';
import type { ReminderKind } from '@/lib/database.types';

async function userTz(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string> {
  const { data } = await supabase.from('profiles').select('timezone').eq('id', userId).single();
  return data?.timezone ?? 'Asia/Kolkata';
}

/**
 * Ensure the `task` reminder for a habit goal's task matches the task's current
 * schedule. Creates, updates, or removes the reminder as appropriate. Called
 * from createGoal/updateGoal. Task deletion is handled by the FK cascade.
 */
export async function syncTaskReminder(goalId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');

  const { data: task } = await supabase
    .from('tasks')
    .select('*')
    .eq('goal_id', goalId)
    .maybeSingle();

  const { data: existing } = task
    ? await supabase
        .from('reminders')
        .select('*')
        .eq('task_id', task.id)
        .eq('kind', 'task')
        .maybeSingle()
    : { data: null };

  const tz = await userTz(supabase, user.id);
  const nextFire =
    task && task.scheduled_time && task.is_active
      ? computeNextFireAt(task.scheduled_time, task.recurrence_type, task.weekdays, tz, new Date())
      : null;

  if (!task || !nextFire) {
    if (existing) await supabase.from('reminders').delete().eq('id', existing.id);
    return;
  }

  const fields = {
    title_template: task.title,
    scheduled_time: task.scheduled_time,
    recurrence_type: task.recurrence_type,
    weekdays: task.weekdays,
    next_fire_at: nextFire.toISOString(),
    is_enabled: true,
  };

  if (existing) {
    await supabase.from('reminders').update(fields).eq('id', existing.id);
  } else {
    await supabase
      .from('reminders')
      .insert({ user_id: user.id, task_id: task.id, kind: 'task', ...fields });
  }
}

async function setSingletonReminder(
  kind: Exclude<ReminderKind, 'task'>,
  enabled: boolean,
  time: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');

  const { data: existing } = await supabase
    .from('reminders')
    .select('*')
    .eq('user_id', user.id)
    .eq('kind', kind)
    .maybeSingle();

  if (!enabled) {
    if (existing) await supabase.from('reminders').update({ is_enabled: false }).eq('id', existing.id);
    return;
  }

  const tz = await userTz(supabase, user.id);
  const nextFire = computeNextFireAt(time, 'daily', null, tz, new Date());
  if (!nextFire) return;

  const fields = {
    scheduled_time: time,
    recurrence_type: 'daily' as const,
    weekdays: null,
    next_fire_at: nextFire.toISOString(),
    is_enabled: true,
  };

  if (existing) {
    await supabase.from('reminders').update(fields).eq('id', existing.id);
  } else {
    await supabase
      .from('reminders')
      .insert({ user_id: user.id, task_id: null, kind, title_template: null, ...fields });
  }
}

export async function setDailyBriefReminder(enabled: boolean, time: string): Promise<void> {
  await setSingletonReminder('daily_brief', enabled, time);
}

export async function setMoodReminder(enabled: boolean, time: string): Promise<void> {
  await setSingletonReminder('mood_checkin', enabled, time);
}

export interface ReminderRow {
  enabled: boolean;
  time: string;
}

export async function getReminderSettings(): Promise<{
  dailyBrief: ReminderRow;
  mood: ReminderRow;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');

  const { data: rows } = await supabase
    .from('reminders')
    .select('kind, scheduled_time, is_enabled')
    .eq('user_id', user.id)
    .in('kind', ['daily_brief', 'mood_checkin']);

  const find = (kind: ReminderKind): ReminderRow => {
    const r = (rows ?? []).find((x) => x.kind === kind);
    return {
      enabled: !!r?.is_enabled,
      time: (r?.scheduled_time ?? '07:00:00').slice(0, 5),
    };
  };

  return { dailyBrief: find('daily_brief'), mood: find('mood_checkin') };
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/reminders.ts
git commit -m "feat(reminders): server actions to sync task + toggle brief/mood reminders"
```

---

## Task 6: Wire `syncTaskReminder` into goal create/update

**Files:**
- Modify: `lib/actions/goals.ts`

- [ ] **Step 1: Import the sync action**

At the top of `lib/actions/goals.ts`, after the existing imports:

```ts
import { syncTaskReminder } from '@/lib/actions/reminders';
```

- [ ] **Step 2: Call it after a habit goal is created**

In `createGoal`, the function currently inserts the goal then calls
`revalidatePath('/')`. The insert uses `.insert({...})` without returning the id.
Change the insert to return the new row id, and sync the reminder before the
redirect. Replace the insert + post-insert block:

```ts
  const { data: inserted, error } = await supabase
    .from('goals')
    .insert({
      user_id: user.id,
      title: input.title,
      description: input.description ?? null,
      category: input.category ?? null,
      goal_type: input.goal_type,
      period_month: input.period_month,
      status: 'active',
      recurrence_type: input.recurrence_type ?? null,
      weekdays: input.weekdays ?? null,
      target_count: input.target_count ?? null,
      scheduled_time: input.scheduled_time ?? null,
      target_value: input.target_value ?? null,
      unit: input.unit ?? null,
      due_date,
    })
    .select('id')
    .single();
  if (error) throw error;

  if (input.goal_type === 'habit') {
    await syncTaskReminder(inserted.id);
  }

  revalidatePath('/');
  revalidatePath('/goals');
  redirect('/goals');
```

- [ ] **Step 3: Call it after a habit goal is updated**

In `updateGoal`, after the successful update and before `revalidatePath`:

```ts
export async function updateGoal(id: string, patch: Partial<GoalInput>) {
  const supabase = await createClient();
  const { error } = await supabase.from('goals').update(patch).eq('id', id);
  if (error) throw error;
  await syncTaskReminder(id);
  revalidatePath('/');
  revalidatePath('/goals');
  revalidatePath(`/goals/${id}`);
}
```

(`syncTaskReminder` no-ops when the goal has no task or no `scheduled_time`, so
calling it for project goals is harmless.)

- [ ] **Step 4: Verify types + tests**

Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/goals.ts
git commit -m "feat(reminders): sync task reminder on habit goal create/update"
```

---

## Task 7: Processor route

**Files:**
- Create: `app/api/reminders/process/route.ts`

- [ ] **Step 1: Write the route**

```ts
// app/api/reminders/process/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { formatInTimeZone } from 'date-fns-tz';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/lib/push';
import { buildReminderPayload, computeNextFireAt } from '@/lib/reminders';

export const dynamic = 'force-dynamic';

/**
 * Process all due reminders and send pushes. Token-guarded; uses the
 * service-role client to act across users. This is the exact contract the
 * future pg_cron-invoked Edge Function will assume.
 */
export async function POST(req: NextRequest) {
  const token = process.env.CRON_INVOKE_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'CRON_INVOKE_TOKEN is not configured.' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const now = new Date();
  const { data: due, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('is_enabled', true)
    .lte('next_fire_at', now.toISOString());
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  let failed = 0;

  for (const r of due ?? []) {
    try {
      // Idempotency: skip if fired within the last minute (overlapping cron / button mash).
      if (r.last_sent_at && now.getTime() - new Date(r.last_sent_at).getTime() < 60_000) {
        continue;
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('timezone')
        .eq('id', r.user_id)
        .single();
      const tz = prof?.timezone ?? 'Asia/Kolkata';

      let briefText: string | null = null;
      if (r.kind === 'daily_brief') {
        const todayIso = formatInTimeZone(now, tz, 'yyyy-MM-dd');
        const { data: brief } = await supabase
          .from('daily_briefs')
          .select('motivation_text')
          .eq('user_id', r.user_id)
          .eq('brief_date', todayIso)
          .maybeSingle();
        briefText = brief?.motivation_text ?? null;
      }

      const payload = buildReminderPayload(r.kind, { title: r.title_template, briefText });
      const result = await sendPushToUser(r.user_id, payload, supabase);
      sent += result.sent;

      const next = computeNextFireAt(r.scheduled_time, r.recurrence_type, r.weekdays, tz, now);
      await supabase
        .from('reminders')
        .update({
          last_sent_at: now.toISOString(),
          next_fire_at: next ? next.toISOString() : r.next_fire_at,
          is_enabled: next !== null,
        })
        .eq('id', r.id);
    } catch {
      failed += 1;
    }
  }

  return NextResponse.json({ processed: (due ?? []).length, sent, failed });
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add "app/api/reminders/process/route.ts"
git commit -m "feat(reminders): token-guarded service-role processor route"
```

---

## Task 8: Environment variables

**Files:**
- Modify: `.env.example`
- Modify: `.env.local`

- [ ] **Step 1: Document the vars in `.env.example`**

Append to `.env.example`:

```
# ── Reminder processor (Slice 2) ──────────────────────────────
# Shared secret the processor route requires in `Authorization: Bearer <token>`.
CRON_INVOKE_TOKEN=
# DEV ONLY: same value, exposed to the "Run due reminders now" button in Settings.
# Do not set this in production — the real cron passes the token server-side.
NEXT_PUBLIC_CRON_INVOKE_TOKEN=
# Service-role key (Supabase dashboard → Settings → API). Server-only. Required
# by the processor to read reminders/subscriptions across users.
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 2: Set local dev values in `.env.local`**

Generate a token and append both vars (run from the project root):

```bash
TOKEN=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
printf '\nCRON_INVOKE_TOKEN=%s\nNEXT_PUBLIC_CRON_INVOKE_TOKEN=%s\n' "$TOKEN" "$TOKEN" >> .env.local
```

Then **manually add** `SUPABASE_SERVICE_ROLE_KEY=<your service role key>` to
`.env.local` (copy it from the Supabase dashboard → Settings → API → `service_role`).
Restart `npm run dev` afterwards so the new env is picked up.

- [ ] **Step 3: Verify `.env.local` is git-ignored (no commit of secrets)**

Run: `git check-ignore .env.local`
Expected: prints `.env.local` (it is ignored). Only `.env.example` is committed.

- [ ] **Step 4: Commit the example**

```bash
git add .env.example
git commit -m "docs(reminders): document processor env vars"
```

---

## Task 9: Settings UI — toggles + dev fire button

**Files:**
- Create: `components/ReminderSettings.tsx`
- Create: `components/RunDueRemindersButton.tsx`
- Modify: `app/(app)/settings/page.tsx`

- [ ] **Step 1: Create `ReminderSettings.tsx`**

```tsx
// components/ReminderSettings.tsx
'use client';

import { useEffect, useState } from 'react';
import {
  getReminderSettings,
  setDailyBriefReminder,
  setMoodReminder,
  type ReminderRow,
} from '@/lib/actions/reminders';

function Row({
  label,
  value,
  busy,
  onChange,
}: {
  label: string;
  value: ReminderRow;
  busy: boolean;
  onChange: (next: ReminderRow) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <label className="flex items-center gap-3 text-sm text-foreground">
        <input
          type="checkbox"
          checked={value.enabled}
          disabled={busy}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
          className="h-5 w-5 rounded border-border accent-primary"
        />
        {label}
      </label>
      <input
        type="time"
        value={value.time}
        disabled={busy || !value.enabled}
        onChange={(e) => onChange({ ...value, time: e.target.value })}
        className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-foreground disabled:opacity-50"
      />
    </div>
  );
}

export default function ReminderSettings() {
  const [brief, setBrief] = useState<ReminderRow>({ enabled: false, time: '07:00' });
  const [mood, setMood] = useState<ReminderRow>({ enabled: false, time: '07:00' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getReminderSettings()
      .then((s) => {
        setBrief(s.dailyBrief);
        setMood(s.mood);
      })
      .catch(() => {});
  }, []);

  async function saveBrief(next: ReminderRow) {
    setBrief(next);
    setBusy(true);
    try {
      await setDailyBriefReminder(next.enabled, next.time);
    } finally {
      setBusy(false);
    }
  }

  async function saveMood(next: ReminderRow) {
    setMood(next);
    setBusy(true);
    try {
      await setMoodReminder(next.enabled, next.time);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="divide-y divide-border">
      <Row label="Daily brief" value={brief} busy={busy} onChange={saveBrief} />
      <Row label="Mood check-in" value={mood} busy={busy} onChange={saveMood} />
    </div>
  );
}
```

- [ ] **Step 2: Create `RunDueRemindersButton.tsx`**

```tsx
// components/RunDueRemindersButton.tsx
'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';

const TOKEN = process.env.NEXT_PUBLIC_CRON_INVOKE_TOKEN;

/** DEV-ONLY: manually invoke the processor so reminders can be verified without cron. */
export default function RunDueRemindersButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Hidden unless the dev token is configured.
  if (!TOKEN) return null;

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/reminders/process', {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        processed?: number;
        sent?: number;
        failed?: number;
        error?: string;
      };
      if (!res.ok) {
        setMessage(data.error ?? 'Failed to run.');
        return;
      }
      setMessage(`Processed ${data.processed ?? 0} · sent ${data.sent ?? 0} · failed ${data.failed ?? 0}.`);
    } catch {
      setMessage('Failed to run the processor.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="transition-calm inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-foreground hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <Send aria-hidden="true" size={18} />
        {busy ? 'Running…' : 'Run due reminders now'}
      </button>
      {message && (
        <p aria-live="polite" className="text-sm text-muted-fg">
          {message}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Render the Reminders section in Settings**

In `app/(app)/settings/page.tsx`, add the imports:

```tsx
import ReminderSettings from '@/components/ReminderSettings';
import RunDueRemindersButton from '@/components/RunDueRemindersButton';
```

Add a new section between the Notifications and Appearance sections:

```tsx
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="font-serif text-lg font-semibold text-foreground">Reminders</h2>
        <p className="mb-2 mt-1 text-sm text-muted-fg">
          Schedule a morning brief and a mood check-in. Task reminders are created
          automatically for habits with a time.
        </p>
        <ReminderSettings />
        <RunDueRemindersButton />
      </section>
```

- [ ] **Step 4: Verify types, lint, tests**

Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npx next lint`
Expected: no errors.
Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ReminderSettings.tsx components/RunDueRemindersButton.tsx "app/(app)/settings/page.tsx"
git commit -m "feat(reminders): settings toggles + dev run-due-reminders button"
```

---

## Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Static suite green**

Run: `npx vitest run` → Expected: all tests PASS (44 existing + 10 new = 54).
Run: `npx tsc --noEmit` → Expected: exit 0.
Run: `npx next lint` → Expected: no errors.
Run: `npm run build` → Expected: build completes; `/api/reminders/process` and `/settings` compile.

- [ ] **Step 2: Manual end-to-end (record results)**

Prereq: `SUPABASE_SERVICE_ROLE_KEY` + `CRON_INVOKE_TOKEN` + `NEXT_PUBLIC_CRON_INVOKE_TOKEN` set in `.env.local`; `npm run dev` running; notifications enabled on the device (Slice 1).

1. Create a habit goal with a `scheduled_time` ~1 minute in the future → confirm a `reminders` row exists (Supabase dashboard) with `kind='task'` and a UTC `next_fire_at`.
2. Settings → Reminders → enable Daily brief at a near time → confirm a `daily_brief` reminder row.
3. To force a fire now, set a row's `next_fire_at` to a past timestamp in the dashboard, then tap **Run due reminders now**.
4. Confirm the OS notification arrives, and the row's `last_sent_at` is set and `next_fire_at` advanced.
5. Tap the button again immediately → the same reminder is skipped (60s idempotency); summary shows `sent 0`.

- [ ] **Step 3: Final commit (if any tracked changes remain)**

```bash
git add -A
git commit -m "chore(reminders): Slice 2 verification pass"
```

---

## Self-Review (completed)

- **Spec coverage:** §3.1 pure logic → Task 2; §3.2 types → Task 1; §3.3 actions → Tasks 5–6; §3.4 admin client → Task 4; §3.5 processor → Task 7; §3.6 push refactor → Task 3; §3.7 UI → Task 9; §7 env prerequisites → Task 8; §6 testing → Tasks 2 & 10. No gaps.
- **Placeholder scan:** none — every code step is complete; the one user-supplied value (`SUPABASE_SERVICE_ROLE_KEY`) is a deployment secret, not a code placeholder.
- **Type consistency:** `ReminderKind`, `Reminder`, `computeNextFireAt`, `buildReminderPayload`, `DEFAULT_BRIEF_TEXT`, `ReminderRow`, `syncTaskReminder`, `setDailyBriefReminder`, `setMoodReminder`, `getReminderSettings` are defined once and consumed with matching signatures. `sendPushToUser`'s new optional `client` param is `SupabaseClient<Database>`, matching `createAdminClient`'s return type.
