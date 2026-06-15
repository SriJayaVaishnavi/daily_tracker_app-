# Slice 2 — Reminder Scheduling + Local Delivery — Design

**Date:** 2026-06-08
**Status:** Approved (design)
**Depends on:** Slice 1 (PWA + Web Push) — `lib/push.ts` `sendPushToUser`, `push_subscriptions`, service worker.
**Canonical spec:** `docs/PRD.md` §5.2 (`reminders`), §7.5 (Reminders + Web Push).

---

## 1. Goal

Turn the existing-but-unused `reminders` table into working scheduled push:
reminder rows are created from user actions, a pure function computes the next
UTC fire time, and a processor route delivers due reminders and advances them.
Everything is buildable and verifiable on localhost; the processor is written to
the exact contract a Supabase Edge Function + `pg_cron` will later assume, so the
production port is a copy-paste, not a rewrite.

### In scope
- `reminders` types in `database.types.ts`.
- Pure `computeNextFireAt` + `buildReminderPayload` with unit tests.
- Server actions that create/sync/disable reminders (session-scoped, RLS).
- A token-guarded, service-role processor route that sends due reminders.
- Settings UI: daily-brief + mood toggles with time pickers, and a dev
  "Run due reminders now" button.
- Three reminder kinds: `task`, `daily_brief`, `mood_checkin`.

### Out of scope (deferred, by prior decision)
- `pg_cron` job and the Deno Edge Function deploy (the "production port").
- Quiet-hours enforcement (`profiles.quiet_hours_*` columns exist; later slice).
- LLM brief generation (Slice 3). Daily-brief reminders use a template line
  until `daily_briefs` is populated.
- `weekly_count` per-day reminders — explicitly no push (PRD §7.5).

---

## 2. Architecture

Three independent units, each testable on its own:

```
User action (create/edit habit goal, toggle in Settings)
        │
        ▼
lib/actions/reminders.ts  ── upsert/disable reminder row
        │  (computes next_fire_at via …)
        ▼
lib/reminders.ts  computeNextFireAt() / buildReminderPayload()   ← pure, unit-tested
        ▲
        │  (same fn advances next_fire_at after a send)
        │
app/api/reminders/process/route.ts  (POST, service-role, token-guarded)
        │  select enabled reminders where next_fire_at <= now()
        ▼
lib/push.ts  sendPushToUser(userId, payload, client)   ← Slice 1 primitive (+ optional client)
        ▼
Web Push → service worker → OS notification
```

**Rule preserved from PRD:** all push delivery is owned by the processor; the
client never schedules a send itself. The Settings button only *invokes* the
processor; it does not send.

---

## 3. Components

### 3.1 `lib/reminders.ts` (pure, no I/O)

```ts
export type ReminderKind = 'task' | 'daily_brief' | 'mood_checkin';

/**
 * Next UTC instant strictly after `after` that the reminder should fire.
 * Returns null when there is no per-day fire (weekly_count).
 */
export function computeNextFireAt(
  scheduledTime: string,            // 'HH:MM' or 'HH:MM:SS', user-local
  recurrenceType: RecurrenceType,
  weekdays: number[] | null,        // 0=Sun..6=Sat, for weekly_days
  tz: string,                       // IANA, e.g. 'Asia/Kolkata'
  after: Date,                      // usually "now"
): Date | null;

export function buildReminderPayload(
  kind: ReminderKind,
  ctx: { title?: string | null; briefText?: string | null },
): PushPayload;
```

- `daily` → today at `scheduledTime` (tz→UTC) if strictly after `after`, else
  the next day.
- `weekly_days` → the soonest day in `weekdays[]` whose `scheduledTime` is after
  `after` (scan up to 8 days ahead to wrap the week).
- `weekly_count` → `null`.
- Conversion uses `date-fns-tz` (`fromZonedTime`), matching `lib/recurrence.ts`.

Payloads:
- `task` → `{ title: ctx.title ?? 'Routine', body: 'Time for ' + ctx.title, url: '/' }`
- `daily_brief` → `{ title: 'Your daily brief', body: ctx.briefText ?? <template>, url: '/' }`
- `mood_checkin` → `{ title: 'Mood check-in', body: 'How are you feeling today?', url: '/' }`

### 3.2 `lib/database.types.ts`
Add `ReminderKind`, a `Reminder` row type matching the `reminders` DDL, and the
`reminders` entry in the `Database['public']['Tables']` map (currently absent).

### 3.3 `lib/actions/reminders.ts` (`'use server'`, session client, RLS)
- `syncTaskReminder(goalId: string)` — invoked from `createGoal`/`updateGoal`
  for habit goals. Looks up the goal's task (created by the
  `handle_new_habit_goal` trigger) by `goal_id`. If the task has a
  `scheduled_time` and recurrence ≠ `weekly_count`: upsert a `kind='task'`
  reminder (on `task_id`) with computed `next_fire_at`. Otherwise delete any
  existing `task` reminder for that task. Task *deletion* is handled by the FK
  `on delete cascade` — no action code needed.
- `setDailyBriefReminder(enabled: boolean, time: string)` — upsert/disable the
  user's single `kind='daily_brief'`, `recurrence_type='daily'` reminder.
- `setMoodReminder(enabled: boolean, time: string)` — same for `kind='mood_checkin'`.
- `getReminderSettings()` — returns `{ dailyBrief, mood }` (enabled + time) for
  the Settings UI.

All actions get `user` via `auth.getUser()` and write through the session client,
so RLS guarantees own-rows only.

**"Upsert" is action-layer**, not a DB `on conflict`: each action selects the
existing reminder (by `task_id` for `task`, by `(user_id, kind)` for the
singletons) and then updates it or inserts a new row. This slice adds **no new
unique constraints or migrations** — it only reads/writes the existing
`reminders` table.

### 3.4 `lib/supabase/admin.ts`
Service-role client factory (no cookies, `SUPABASE_SERVICE_ROLE_KEY`). Used
**only** by the processor route. Bypasses RLS because the processor acts for all
users, exactly as the future cron will.

### 3.5 `app/api/reminders/process/route.ts` (POST)
1. Reject unless `Authorization: Bearer <CRON_INVOKE_TOKEN>` matches → 401.
2. If `SUPABASE_SERVICE_ROLE_KEY`/token env missing → 500 with a clear message.
3. Service-role select: `reminders` where `is_enabled` and `next_fire_at <= now()`.
4. Per reminder (try/catch each, never abort the batch):
   - **Idempotency:** if `last_sent_at` within the last 60s, skip.
   - Build payload by `kind` (for `daily_brief`, read today's
     `daily_briefs.motivation_text` for that user → fallback template).
   - `sendPushToUser(reminder.user_id, payload, adminClient)`.
   - Update `last_sent_at = now()`,
     `next_fire_at = computeNextFireAt(..., after = now)`; if `null`, disable.
5. Return `{ processed, sent, failed }` JSON.

### 3.6 `lib/push.ts` (minimal refactor)
`sendPushToUser(userId, payload, client?)` — optional Supabase client param,
defaulting to the session client (`await createClient()`). Existing callers
(`savePushSubscription`, `/api/push/test`) are unchanged. The processor passes
the admin client.

### 3.7 Settings UI
- `components/ReminderSettings.tsx` (client) — daily-brief and mood rows, each a
  toggle + `<input type="time">`, calling the server actions. Defaults: both
  **07:00** (user tz), disabled until toggled on.
- `components/RunDueRemindersButton.tsx` (client) — POSTs to
  `/api/reminders/process`. The token is read from a public dev env var
  (`NEXT_PUBLIC_CRON_INVOKE_TOKEN`) **for local verification only**; documented
  as dev-only in `.env.example`. Shows the `{sent}` summary.
- `app/(app)/settings/page.tsx` — render a "Reminders" section above Appearance.

---

## 4. Data flow examples

**Create a habit goal "Meditate" at 07:30 daily**
`createGoal` inserts goal → `handle_new_habit_goal` trigger inserts task →
`createGoal` calls `syncTaskReminder(goalId)` → reminder row with
`next_fire_at` = next 07:30 IST in UTC.

**Enable daily brief at 06:30**
Settings toggle → `setDailyBriefReminder(true, '06:30')` → upsert `daily_brief`
reminder, `next_fire_at` computed.

**Fire**
Button (or later cron) → POST `/api/reminders/process` → due rows found →
push sent → `next_fire_at` advanced to the next occurrence.

---

## 5. Error handling

| Case | Behaviour |
|---|---|
| Bad/missing token | 401, no work done. |
| Missing service-role key | 500, clear message. |
| One reminder's send throws | Caught; counted in `failed`; batch continues. |
| Dead push subscription (404/410) | Pruned by `sendPushToUser` (Slice 1 behaviour). |
| `computeNextFireAt` returns null (weekly_count) | Reminder disabled, not retried. |
| Button mashed / overlapping cron | 60s `last_sent_at` guard skips re-send. |

---

## 6. Testing

**Unit (`lib/__tests__/reminders.test.ts`):**
- `daily`: time later today → today; time already passed → tomorrow.
- `weekly_days`: picks the next matching weekday; wraps past the week's end.
- tz→UTC correctness for `Asia/Kolkata` (07:00 IST → 01:30 UTC).
- `weekly_count` → null.
- `buildReminderPayload` for all three kinds incl. brief template fallback.

**Static:** `npx tsc --noEmit`, `npx vitest run` (all green), `npx next lint`,
`npm run build`.

**Manual:** create a task with a `scheduled_time` a minute ahead (or set a row's
`next_fire_at` into the past), grant notifications, tap "Run due reminders now",
confirm the OS notification arrives and `next_fire_at` advanced.

---

## 7. Prerequisites (user-supplied)

- `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (Supabase dashboard → Settings →
  API). Required for the processor to read across users.
- `CRON_INVOKE_TOKEN` (any random string) in `.env.local`; mirror as
  `NEXT_PUBLIC_CRON_INVOKE_TOKEN` for the dev button. Both documented in
  `.env.example`.
- Restart `npm run dev` after editing env.

---

## 8. File summary

| File | Action |
|---|---|
| `lib/reminders.ts` | Create — `computeNextFireAt`, `buildReminderPayload` |
| `lib/__tests__/reminders.test.ts` | Create — unit tests |
| `lib/database.types.ts` | Modify — `Reminder` type + `reminders` Tables entry |
| `lib/actions/reminders.ts` | Create — sync/toggle server actions |
| `lib/supabase/admin.ts` | Create — service-role client |
| `lib/push.ts` | Modify — optional `client` param |
| `lib/actions/goals.ts` | Modify — call `syncTaskReminder` on create/update |
| `app/api/reminders/process/route.ts` | Create — processor |
| `components/ReminderSettings.tsx` | Create — toggles + time pickers |
| `components/RunDueRemindersButton.tsx` | Create — dev fire button |
| `app/(app)/settings/page.tsx` | Modify — render Reminders section |
| `.env.example`, `.env.local` | Modify — `CRON_INVOKE_TOKEN`, service-role key |
