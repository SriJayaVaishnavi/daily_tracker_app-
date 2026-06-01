# Routine Tracker — Foundation Slice Design

**Date:** 2026-06-01
**Status:** Approved (design), pending spec review
**Parent spec:** [`docs/PRD.md`](../../PRD.md) — the full v1 product.
**This document** scopes only the first buildable slice. Where it differs from the
PRD, this slice wins for the current build session.

---

## 1. Goal of this slice

Stand up the app's foundation, end to end and locally verifiable, **without any
of the push / scheduling / LLM machinery**. When this slice is done, a logged-in
user can create monthly goals, see a deterministic daily routine derived from
them, complete habits, log project progress, record a mood, and read the day's
Stoic quote — all with row-level security enforced.

This corresponds to **PRD §10 build steps 1–7**.

---

## 2. In scope

1. **Repo scaffold** — Next.js (App Router, TypeScript), Tailwind, ESLint,
   directory layout per PRD Appendix A (only the parts this slice needs),
   `.env.example`, `.gitignore`, README.
2. **Database** — the complete schema from PRD §5 (all tables, enums, indexes),
   all 4 triggers, RLS on every user-data table, public-read RLS on
   `stoic_quotes`, and a ~150-row public-domain Stoic seed. Delivered as
   source-controlled SQL the user runs in the Supabase dashboard SQL Editor.
3. **Auth + profiles** — Supabase Auth magic link, login screen, session
   handling, protected `(app)` route group, `handle_new_user` trigger creating
   the profile row.
4. **Routine engine** — deterministic `/lib/routine.ts` + `/lib/recurrence.ts`,
   computed server-side at render time, no stored daily plan.
5. **Home / routine view** — today's due habit tasks (with check-off state),
   project pace tiles, mood check-in entry point, Stoic quote of the day, and a
   daily-brief area that renders gracefully empty (generator is a later slice).
6. **Goals CRUD** — create / edit / archive / delete habit and project goals,
   with month switching.
7. **Habit check-offs** — done / skipped / partial → `task_logs` (idempotent on
   `(task_id, log_date)`), optional value for measurable habits.
8. **Project progress logging** — `+ log progress` modal → `progress_logs` →
   `bump_goal_progress` trigger → pace recomputes on next render.
9. **Mood check-in** — one-tap 1–5 mood (+ optional energy/gratitude/note),
   idempotent on `(user_id, log_date)`.
10. **Stoic quote display** — deterministic `pickStoicForDate`.

## 3. Out of scope (later slices)

PWA manifest & service worker, Web Push + VAPID, `push_subscriptions` writes,
both Edge Functions, pg_cron, `reminders` firing, LLM brief generation, the
Funtouch battery onboarding nudge. The `reminders`, `push_subscriptions`, and
`daily_briefs` **tables are still created** in this slice (full schema up front)
— they are simply not yet written to or read by a generator.

---

## 4. Key decisions

| # | Decision | Alternative considered | Why |
|---|---|---|---|
| 1 | Apply schema via **dashboard SQL Editor**, SQL kept in `/supabase/migrations/` + `/supabase/seed-stoic-quotes.sql` | Supabase CLI migrations | PRD pins dashboard-only for v1; CLI adds local setup we deferred. Source stays in Git regardless. |
| 2 | **Server Components for reads, Server Actions / Route Handlers for writes**, Supabase client bound to the user session (anon key + RLS) | Client-side `supabase-js` everywhere | Keeps the service-role key off the client; fits App Router; the routine engine runs server-side. |
| 3 | **Magic-link** auth | Email + password | Simpler v1 — no password-reset flows (PRD-preferred). |
| 4 | **Full ~150-quote** Stoic seed | Start with ~20 | One-time seed; the deterministic `dayOfYear % length` pick needs variety, and DoD depends on it. |
| 5 | UI built with the **`frontend-design` / `ui-ux-pro-max`** skills | Hand-rolled generic components | User explicitly asked for our best UI skills; mobile-first PWA deserves a polished, non-generic look. |

---

## 5. Architecture (this slice)

```
Browser (Next.js, mobile-first)
   │  magic-link session (Supabase Auth)
   ▼
Next.js App Router (Vercel-targeted, run locally for now)
   ├── Server Components ── read ──► Supabase Postgres (RLS: user_id = auth.uid())
   │       └── /lib/routine.ts  (deterministic engine, server-side)
   └── Server Actions ───── write ─► Supabase Postgres
           (goals CRUD, task_logs, progress_logs, mood_logs)

Supabase Postgres
   ├── triggers: handle_new_user, handle_new_habit_goal,
   │             bump_goal_progress, set_updated_at
   └── RLS on every user-data table; stoic_quotes public-read
```

No cron, no Edge Functions, no push in this slice.

---

## 6. Module boundaries

Each module has one purpose and a clear interface; built and verified in order.

- **`/lib/supabase.ts`** — typed browser + server Supabase clients. *Depends on:*
  env vars. *Used by:* everything.
- **`/lib/recurrence.ts`** — pure date/timezone/weekday helpers
  (`weekdayOf`, `daysBetween`, `expectedSoFar`, week-boundary math). *Pure, no I/O
  — unit-testable in isolation.*
- **`/lib/routine.ts`** — `todayRoutine(userId, today)` and `paceItem`. *Depends
  on:* supabase client + recurrence. *Returns:* the routine payload the home view
  renders.
- **`/lib/stoic.ts`** — `pickStoicForDate(date, tz)`. *Pure given the quote list.*
- **`/app/(auth)/login`** — magic-link sign-in.
- **`/app/(app)/page.tsx`** — home; composes `RoutineView`.
- **`/app/(app)/goals`** — list + create/edit; `[id]` detail.
- **`/app/(app)/mood`** — mood check-in.
- **Server Actions** — `createGoal`, `updateGoal`, `archiveGoal`, `deleteGoal`,
  `logHabit`, `logProgress`, `logMood`. Each enforces ownership via RLS.
- **Components** — `RoutineView`, `GoalCard`, `HabitItem`, `ProjectItem`,
  `MoodCheckIn`, `StoicQuote`, `DailyBrief` (empty-state aware).

---

## 7. Data flow examples

- **Render home:** Server Component calls `todayRoutine(userId, today)` →
  reads `tasks`⋈`goals`, `mood_logs`, `daily_briefs`, computes pace + Stoic pick
  → renders. Editing a goal changes the next render with no regeneration.
- **Complete habit:** tap → Server Action `logHabit(taskId, status, value?)`
  → upsert `task_logs` on `(task_id, log_date)` → revalidate home.
- **Log progress:** modal → `logProgress(goalId, valueAdded, note?)` → insert
  `progress_logs` → `bump_goal_progress` updates `goals.current_value` →
  revalidate → pace recomputes.

---

## 8. Error handling & edge cases

- **Auth gap:** unauthenticated access to `(app)` routes redirects to login.
- **No goals yet:** home shows an empty-state CTA to create the first goal.
- **No mood/brief yet today:** those tiles render their own empty states.
- **`weekly_count` habits:** shown until quota met, with `done/target`; no per-day
  reminder (push is out of slice anyway).
- **Timezone:** all DATE values computed in the user's `profiles.timezone`; all
  timestamptz stored UTC. `log_date` / `period_month` are user-local dates.
- **RLS:** every write also passes the `with check` clause; no service-role key
  on the client.

---

## 9. Testing / verification per module

- **DB:** after running SQL, verify all tables/triggers/policies exist; insert a
  habit goal as user A and confirm the `tasks` row auto-creates; insert a
  `progress_logs` row and confirm `current_value` bumps; query as two different
  JWTs and confirm **zero cross-user visibility** (PRD gotcha #1).
- **`recurrence.ts` / `stoic.ts`:** unit tests (pure functions) — weekday
  filtering, pace math, deterministic quote index.
- **Auth:** sign in with two test emails; confirm a `profiles` row per user.
- **Routine view:** seed test goals; confirm daily vs weekly_days filtering and
  pace on-track indicator.
- **Check-offs / progress / mood:** exercise each Server Action; confirm
  idempotency constraints reject duplicates gracefully.

---

## 10. Definition of Done (this slice)

- App runs locally against the user's Supabase project.
- Magic-link login works; a profile row is created per new user.
- A logged-in user can create habit + project goals, edit and archive them, and
  switch months.
- The home view renders a deterministic routine: due habits with check-off state,
  project pace tiles, the Stoic quote of the day, mood entry, and an empty
  daily-brief area.
- Habit check-offs, project progress logging, and mood check-in all persist with
  their idempotency constraints.
- RLS verified across two accounts — no data bleed.
- All SQL and (placeholder) Edge Function source committed to the repo and pushed
  to GitHub `main`.

---

## 11. What this unblocks next

With the schema fully in place and the routine view live, later slices add only
delivery/intelligence layers without touching the data model: **(A)** PWA shell +
Web Push subscription, **(B)** `notification-processor` Edge Function + pg_cron,
**(C)** LLM helper + `daily-brief-generator`, **(D)** onboarding polish.
