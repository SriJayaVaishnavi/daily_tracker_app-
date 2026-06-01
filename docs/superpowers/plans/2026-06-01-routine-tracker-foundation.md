# Routine Tracker — Foundation Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Routine Tracker foundation — schema, auth, deterministic routine view, goals CRUD, habit/project/mood logging — locally verifiable against the user's Supabase project, with RLS enforced.

**Architecture:** Next.js App Router (TypeScript) with Server Components for reads and Server Actions for writes, talking to Supabase Postgres over a session-bound client so RLS enforces ownership. The daily routine is computed deterministically server-side at render time from `goals`/`tasks` + logs — there is no stored daily plan. Pure date/recurrence/quote logic lives in unit-tested helper modules.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, `@supabase/supabase-js` + `@supabase/ssr`, Vitest (unit tests), Supabase Postgres + dashboard SQL Editor. UI built with the `frontend-design` / `ui-ux-pro-max` skills.

**Spec:** [`docs/superpowers/specs/2026-06-01-routine-tracker-foundation-design.md`](../specs/2026-06-01-routine-tracker-foundation-design.md) · **Product PRD:** [`docs/PRD.md`](../../PRD.md)

**Conventions used in this plan:**
- All shell commands run from repo root `C:\Users\SrijayavaishnaviS\daily_tracker_app` (Windows PowerShell or Bash).
- "User action" steps are things the developer does in the Supabase dashboard / browser — the agent pauses and instructs, then verifies.
- Commit after every task. Push to GitHub `main` only at the final task (or when the user asks).

---

## File Structure

```
/app
  layout.tsx                      Root layout, Tailwind, fonts
  globals.css                     Tailwind directives + design tokens
  (auth)/login/page.tsx           Magic-link sign-in
  (auth)/callback/route.ts        Auth code exchange
  (app)/layout.tsx                Protected shell (redirects if no session)
  (app)/page.tsx                  Home / routine view (Server Component)
  (app)/goals/page.tsx            Goals list
  (app)/goals/new/page.tsx        Create goal
  (app)/goals/[id]/page.tsx       Edit / archive / delete goal
  (app)/mood/page.tsx             Mood check-in
/components
  RoutineView.tsx  HabitItem.tsx  ProjectItem.tsx
  GoalForm.tsx     GoalCard.tsx
  MoodCheckIn.tsx  StoicQuote.tsx  DailyBrief.tsx
  ui/                             primitives from UI skill (Button, Card, ...)
/lib
  supabase/client.ts              browser client
  supabase/server.ts              server client (cookies-bound)
  database.types.ts               generated/handwritten DB types
  recurrence.ts                   pure date/weekday/pace helpers
  stoic.ts                        deterministic quote-of-day picker
  routine.ts                      todayRoutine() engine
  actions/goals.ts                createGoal/updateGoal/archiveGoal/deleteGoal
  actions/logs.ts                 logHabit/logProgress/logMood
/lib/__tests__
  recurrence.test.ts  stoic.test.ts
/supabase
  migrations/0001_init.sql        full schema + enums + indexes + triggers + RLS
  seed-stoic-quotes.sql           ~150 public-domain quotes
  functions/notification-processor/.gitkeep   (placeholder; later slice)
  functions/daily-brief-generator/.gitkeep    (placeholder; later slice)
/public                           icons placeholder (PWA is a later slice)
.env.example
.env.local                        (gitignored; real keys)
README.md
```

---

## Task 0: Repo scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `app/globals.css`, `app/layout.tsx`, `app/(app)/page.tsx` (placeholder), `.env.example`, `.gitignore`, `README.md`, `vitest.config.ts`

- [ ] **Step 1: Scaffold Next.js + Tailwind**

Run from repo root:
```bash
npx create-next-app@14 . --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --no-turbopack
```
If `create-next-app` refuses because the dir is non-empty (it has `docs/` + `.git`), scaffold in a temp dir and move files in:
```bash
npx create-next-app@14 ../_tmp_rt --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --no-turbopack
robocopy ../_tmp_rt . /E /XD .git /XF README.md
rm -rf ../_tmp_rt
```

- [ ] **Step 2: Add runtime + dev dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr date-fns date-fns-tz
npm install -D vitest @vitejs/plugin-react
```

- [ ] **Step 3: Add Vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'node', include: ['lib/**/*.test.ts'] },
});
```
Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 4: Write `.env.example` and `.gitignore` entry**

Create `.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# Server-only (used in later slices):
SUPABASE_SERVICE_ROLE_KEY=
GROQ_API_KEY=
GEMINI_API_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
```
Ensure `.gitignore` contains `.env*.local` (create-next-app adds this; verify).

- [ ] **Step 5: Verify it builds and runs**

Run: `npm run build`
Expected: build succeeds (default home page).
Run: `npm run test`
Expected: "No test files found" (acceptable now) or passes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + Tailwind + Vitest"
```

---

## Task 1: Database schema migration

**Files:**
- Create: `supabase/migrations/0001_init.sql`

- [ ] **Step 1: Write the full schema migration**

Create `supabase/migrations/0001_init.sql` with the complete schema. This is run by the developer in the Supabase SQL Editor (Task 1 Step 2).

```sql
-- ── Extensions ───────────────────────────────────────────────
create extension if not exists pgcrypto;

-- ── Enums ────────────────────────────────────────────────────
create type goal_type as enum ('habit', 'project');
create type goal_status as enum ('active', 'paused', 'completed', 'archived');
create type recurrence_type as enum ('daily', 'weekly_days', 'weekly_count');
create type log_status as enum ('done', 'skipped', 'partial');

-- ── profiles ─────────────────────────────────────────────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Asia/Kolkata',
  quiet_hours_start time,
  quiet_hours_end time,
  notif_prefs jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── goals ────────────────────────────────────────────────────
create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  category text,
  goal_type goal_type not null,
  period_month date not null,
  status goal_status not null default 'active',
  recurrence_type recurrence_type,
  weekdays int[],
  target_count int,
  scheduled_time time,
  target_value numeric,
  current_value numeric default 0,
  unit text,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index goals_user_status_idx on goals (user_id, status);
create index goals_user_period_idx on goals (user_id, period_month);

-- ── tasks ────────────────────────────────────────────────────
create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references goals(id) on delete cascade,
  title text not null,
  recurrence_type recurrence_type not null,
  weekdays int[],
  target_count int,
  scheduled_time time,
  target_value numeric,
  unit text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_user_active_idx on tasks (user_id, is_active);

-- ── task_logs ────────────────────────────────────────────────
create table task_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  log_date date not null,
  status log_status not null,
  value numeric,
  note text,
  created_at timestamptz not null default now(),
  unique (task_id, log_date)
);
create index task_logs_user_date_idx on task_logs (user_id, log_date);

-- ── progress_logs ────────────────────────────────────────────
create table progress_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references goals(id) on delete cascade,
  log_date date not null,
  value_added numeric not null,
  note text,
  created_at timestamptz not null default now()
);
create index progress_logs_user_date_idx on progress_logs (user_id, log_date);
create index progress_logs_goal_idx on progress_logs (goal_id);

-- ── reminders (table created now; written/read in a later slice) ─
create table reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  kind text not null,
  title_template text,
  scheduled_time time not null,
  recurrence_type recurrence_type not null,
  weekdays int[],
  next_fire_at timestamptz not null,
  is_enabled boolean not null default true,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reminders_next_fire_idx on reminders (next_fire_at) where is_enabled = true;

-- ── push_subscriptions (created now; used in a later slice) ──────
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on push_subscriptions (user_id);

-- ── mood_logs ────────────────────────────────────────────────
create table mood_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  mood int not null check (mood between 1 and 5),
  energy int check (energy between 1 and 5),
  gratitude text,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, log_date)
);

-- ── stoic_quotes (global, public read) ───────────────────────
create table stoic_quotes (
  id serial primary key,
  body text not null,
  author text not null check (author in ('Marcus Aurelius', 'Seneca', 'Epictetus')),
  source_work text,
  tags text[]
);

-- ── daily_briefs (created now; written by generator in later slice) ─
create table daily_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brief_date date not null,
  motivation_text text not null,
  stoic_quote_id int references stoic_quotes(id),
  generated_by text not null,
  generated_at timestamptz not null default now(),
  unique (user_id, brief_date)
);

-- ── Triggers ─────────────────────────────────────────────────
-- 1. profile on new auth user
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end; $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- 2. habit goal -> task template
create or replace function handle_new_habit_goal() returns trigger
language plpgsql as $$
begin
  if new.goal_type = 'habit' then
    insert into public.tasks
      (user_id, goal_id, title, recurrence_type, weekdays, target_count,
       scheduled_time, target_value, unit)
    values
      (new.user_id, new.id, new.title, new.recurrence_type, new.weekdays,
       new.target_count, new.scheduled_time, new.target_value, new.unit);
  end if;
  return new;
end; $$;
create trigger on_habit_goal_created
  after insert on goals
  for each row execute function handle_new_habit_goal();

-- 3. progress log -> bump goal current_value
create or replace function bump_goal_progress() returns trigger
language plpgsql as $$
begin
  update goals set current_value = coalesce(current_value, 0) + new.value_added
  where id = new.goal_id;
  return new;
end; $$;
create trigger on_progress_logged
  after insert on progress_logs
  for each row execute function bump_goal_progress();

-- 4. generic updated_at
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated_at before update on profiles
  for each row execute function set_updated_at();
create trigger goals_updated_at before update on goals
  for each row execute function set_updated_at();
create trigger tasks_updated_at before update on tasks
  for each row execute function set_updated_at();
create trigger reminders_updated_at before update on reminders
  for each row execute function set_updated_at();

-- ── Row Level Security ───────────────────────────────────────
alter table profiles enable row level security;
create policy "own profile" on profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

-- helper macro applied per table below
alter table goals enable row level security;
create policy "own rows" on goals for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table tasks enable row level security;
create policy "own rows" on tasks for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table task_logs enable row level security;
create policy "own rows" on task_logs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table progress_logs enable row level security;
create policy "own rows" on progress_logs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table reminders enable row level security;
create policy "own rows" on reminders for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table push_subscriptions enable row level security;
create policy "own rows" on push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table mood_logs enable row level security;
create policy "own rows" on mood_logs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table daily_briefs enable row level security;
create policy "own rows" on daily_briefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table stoic_quotes enable row level security;
create policy "anyone can read" on stoic_quotes for select using (true);
```

- [ ] **Step 2: User action — run the migration**

Instruct the developer: open Supabase dashboard → SQL Editor → paste the entire contents of `supabase/migrations/0001_init.sql` → Run. Confirm "Success. No rows returned."

- [ ] **Step 3: Verify schema**

In SQL Editor run:
```sql
select table_name from information_schema.tables
where table_schema='public' order by 1;
```
Expected rows: `daily_briefs, goals, mood_logs, profiles, progress_logs,
push_subscriptions, reminders, stoic_quotes, task_logs, tasks`.
Then verify triggers:
```sql
select tgname from pg_trigger where not tgisinternal order by 1;
```
Expected to include `on_auth_user_created`, `on_habit_goal_created`,
`on_progress_logged`, and the four `_updated_at` triggers.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_init.sql
git commit -m "feat(db): initial schema, triggers, RLS"
```

---

## Task 2: Stoic quotes seed

**Files:**
- Create: `supabase/seed-stoic-quotes.sql`

- [ ] **Step 1: Generate the seed file**

Create `supabase/seed-stoic-quotes.sql` as a single `insert into stoic_quotes (body, author, source_work) values (...), (...);` statement. **Acceptance criteria for this content task:**
- ≥ 120 rows (target ~150).
- All three authors represented (Marcus Aurelius, Seneca, Epictetus).
- Every `body` < 280 characters (fits a notification).
- Public-domain translations only: Long's *Meditations*, Stewart's *Letters from a Stoic* / *On the Shortness of Life*, Higginson's *Discourses*, Carter's *Enchiridion*.
- No duplicates (dedupe on `body`).

Starter rows (the executor expands this set to ≥120 from the named public-domain sources):
```sql
insert into stoic_quotes (body, author, source_work) values
('You have power over your mind — not outside events. Realize this, and you will find strength.', 'Marcus Aurelius', 'Meditations'),
('Waste no more time arguing what a good man should be. Be one.', 'Marcus Aurelius', 'Meditations'),
('The happiness of your life depends upon the quality of your thoughts.', 'Marcus Aurelius', 'Meditations'),
('When you arise in the morning, think of what a privilege it is to be alive, to think, to enjoy, to love.', 'Marcus Aurelius', 'Meditations'),
('Very little is needed to make a happy life; it is all within yourself, in your way of thinking.', 'Marcus Aurelius', 'Meditations'),
('We suffer more in imagination than in reality.', 'Seneca', 'Letters from a Stoic'),
('It is not that we have a short time to live, but that we waste a lot of it.', 'Seneca', 'On the Shortness of Life'),
('Luck is what happens when preparation meets opportunity.', 'Seneca', 'Letters from a Stoic'),
('He suffers more than necessary, who suffers before it is necessary.', 'Seneca', 'Letters from a Stoic'),
('Difficulties strengthen the mind, as labour does the body.', 'Seneca', 'Letters from a Stoic'),
('No man is free who is not master of himself.', 'Epictetus', 'Discourses'),
('It''s not what happens to you, but how you react to it that matters.', 'Epictetus', 'Enchiridion'),
('Make the best use of what is in your power, and take the rest as it happens.', 'Epictetus', 'Discourses'),
('First say to yourself what you would be; and then do what you have to do.', 'Epictetus', 'Discourses'),
('Wealth consists not in having great possessions, but in having few wants.', 'Epictetus', 'Discourses');
-- expand to >= 120 rows meeting the acceptance criteria above
```

- [ ] **Step 2: User action — run the seed**

Developer pastes `supabase/seed-stoic-quotes.sql` into SQL Editor → Run.

- [ ] **Step 3: Verify seed**

```sql
select count(*) as n,
       count(*) filter (where length(body) >= 280) as too_long,
       count(distinct author) as authors
from stoic_quotes;
```
Expected: `n >= 120`, `too_long = 0`, `authors = 3`.

- [ ] **Step 4: Commit**

```bash
git add supabase/seed-stoic-quotes.sql
git commit -m "feat(db): seed stoic quotes"
```

---

## Task 3: Supabase clients + env + DB types

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/database.types.ts`
- Create: `.env.local` (gitignored — developer fills real values)

- [ ] **Step 1: User action — capture Supabase credentials**

Developer copies Project URL + anon key from Supabase → Settings → API into `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

- [ ] **Step 2: Write the browser client**

Create `lib/supabase/client.ts`:
```ts
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 3: Write the server client**

Create `lib/supabase/server.ts`:
```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/database.types';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { /* called from a Server Component; middleware refreshes instead */ }
        },
      },
    },
  );
}
```

- [ ] **Step 4: Write DB types**

Create `lib/database.types.ts` with hand-written types matching the schema. Minimum needed by this slice (full set may be generated later with the Supabase type generator):
```ts
export type GoalType = 'habit' | 'project';
export type GoalStatus = 'active' | 'paused' | 'completed' | 'archived';
export type RecurrenceType = 'daily' | 'weekly_days' | 'weekly_count';
export type LogStatus = 'done' | 'skipped' | 'partial';

export interface Goal {
  id: string; user_id: string; title: string; description: string | null;
  category: string | null; goal_type: GoalType; period_month: string;
  status: GoalStatus; recurrence_type: RecurrenceType | null; weekdays: number[] | null;
  target_count: number | null; scheduled_time: string | null;
  target_value: number | null; current_value: number | null; unit: string | null;
  due_date: string | null; created_at: string; updated_at: string;
}
export interface Task {
  id: string; user_id: string; goal_id: string; title: string;
  recurrence_type: RecurrenceType; weekdays: number[] | null; target_count: number | null;
  scheduled_time: string | null; target_value: number | null; unit: string | null;
  is_active: boolean; created_at: string; updated_at: string;
}
export interface TaskLog {
  id: string; user_id: string; task_id: string; log_date: string;
  status: LogStatus; value: number | null; note: string | null; created_at: string;
}
export interface MoodLog {
  id: string; user_id: string; log_date: string; mood: number;
  energy: number | null; gratitude: string | null; note: string | null; created_at: string;
}
export interface StoicQuote {
  id: number; body: string; author: string; source_work: string | null; tags: string[] | null;
}
export interface DailyBrief {
  id: string; user_id: string; brief_date: string; motivation_text: string;
  stoic_quote_id: number | null; generated_by: string; generated_at: string;
}
export interface Profile {
  id: string; display_name: string | null; timezone: string;
  quiet_hours_start: string | null; quiet_hours_end: string | null;
  notif_prefs: Record<string, unknown>; created_at: string; updated_at: string;
}

// Minimal Database shape for the typed client.
export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile> & { id: string }; Update: Partial<Profile> };
      goals: { Row: Goal; Insert: Omit<Goal,'id'|'created_at'|'updated_at'|'current_value'> & { current_value?: number }; Update: Partial<Goal> };
      tasks: { Row: Task; Insert: Partial<Task>; Update: Partial<Task> };
      task_logs: { Row: TaskLog; Insert: Omit<TaskLog,'id'|'created_at'>; Update: Partial<TaskLog> };
      progress_logs: { Row: { id: string; user_id: string; goal_id: string; log_date: string; value_added: number; note: string | null; created_at: string }; Insert: { user_id: string; goal_id: string; log_date: string; value_added: number; note?: string | null }; Update: Partial<{ note: string }> };
      mood_logs: { Row: MoodLog; Insert: Omit<MoodLog,'id'|'created_at'>; Update: Partial<MoodLog> };
      stoic_quotes: { Row: StoicQuote; Insert: Omit<StoicQuote,'id'>; Update: Partial<StoicQuote> };
      daily_briefs: { Row: DailyBrief; Insert: Omit<DailyBrief,'id'|'generated_at'>; Update: Partial<DailyBrief> };
    };
  };
}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: typecheck + build succeed.

- [ ] **Step 6: Commit**

```bash
git add lib/supabase lib/database.types.ts
git commit -m "feat: typed supabase browser + server clients"
```

---

## Task 4: Recurrence helpers (TDD, pure)

**Files:**
- Create: `lib/recurrence.ts`, `lib/__tests__/recurrence.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/recurrence.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { weekdayOf, daysBetween, expectedSoFar, isHabitDueToday } from '@/lib/recurrence';

describe('weekdayOf', () => {
  it('returns 0..6 with Sunday=0 in the given tz', () => {
    // 2026-06-07 is a Sunday
    expect(weekdayOf(new Date('2026-06-07T12:00:00Z'), 'Asia/Kolkata')).toBe(0);
    // 2026-06-08 is a Monday
    expect(weekdayOf(new Date('2026-06-08T12:00:00Z'), 'Asia/Kolkata')).toBe(1);
  });
});

describe('daysBetween', () => {
  it('counts whole days between two ISO dates', () => {
    expect(daysBetween('2026-06-01', '2026-06-30')).toBe(29);
    expect(daysBetween('2026-06-01', '2026-06-01')).toBe(0);
  });
});

describe('expectedSoFar', () => {
  it('linearly prorates target across the period', () => {
    const goal = { period_month: '2026-06-01', due_date: '2026-06-30', target_value: 300 };
    // halfway: 2026-06-16 is ~15 days elapsed of 29
    const v = expectedSoFar(goal, new Date('2026-06-16T12:00:00+05:30'), 'Asia/Kolkata');
    expect(v).toBeGreaterThan(140);
    expect(v).toBeLessThan(170);
  });
});

describe('isHabitDueToday', () => {
  it('daily is always due', () => {
    expect(isHabitDueToday({ recurrence_type: 'daily', weekdays: null }, new Date('2026-06-08T12:00:00Z'), 'Asia/Kolkata')).toBe(true);
  });
  it('weekly_days due only on listed weekdays', () => {
    const t = { recurrence_type: 'weekly_days' as const, weekdays: [1, 3, 5] }; // Mon/Wed/Fri
    expect(isHabitDueToday(t, new Date('2026-06-08T12:00:00Z'), 'Asia/Kolkata')).toBe(true);  // Mon
    expect(isHabitDueToday(t, new Date('2026-06-07T12:00:00Z'), 'Asia/Kolkata')).toBe(false); // Sun
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL — `lib/recurrence` module/exports not found.

- [ ] **Step 3: Implement `lib/recurrence.ts`**

```ts
import { toZonedTime } from 'date-fns-tz';

/** Sunday=0 .. Saturday=6, in the user's timezone. */
export function weekdayOf(date: Date, tz: string): number {
  return toZonedTime(date, tz).getDay();
}

/** Whole days from ISO date `a` to ISO date `b` (b - a). */
export function daysBetween(a: string, b: string): number {
  const ms = new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime();
  return Math.round(ms / 86_400_000);
}

export function expectedSoFar(
  goal: { period_month: string; due_date: string | null; target_value: number | null },
  today: Date, tz: string,
): number {
  if (!goal.target_value || !goal.due_date) return 0;
  const todayIso = toZonedTime(today, tz).toISOString().slice(0, 10);
  const total = Math.max(1, daysBetween(goal.period_month, goal.due_date));
  const elapsed = Math.min(total, Math.max(0, daysBetween(goal.period_month, todayIso)));
  return goal.target_value * (elapsed / total);
}

export function isHabitDueToday(
  t: { recurrence_type: 'daily' | 'weekly_days' | 'weekly_count'; weekdays: number[] | null },
  today: Date, tz: string,
): boolean {
  if (t.recurrence_type === 'daily') return true;
  if (t.recurrence_type === 'weekly_days') return !!t.weekdays?.includes(weekdayOf(today, tz));
  return true; // weekly_count: due until quota met (quota checked by caller)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test`
Expected: PASS (4 suites).

- [ ] **Step 5: Commit**

```bash
git add lib/recurrence.ts lib/__tests__/recurrence.test.ts
git commit -m "feat(lib): recurrence + pace helpers with tests"
```

---

## Task 5: Stoic picker (TDD, pure)

**Files:**
- Create: `lib/stoic.ts`, `lib/__tests__/stoic.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/stoic.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { stoicIndexForDate } from '@/lib/stoic';

describe('stoicIndexForDate', () => {
  it('is deterministic per local calendar day', () => {
    const a = stoicIndexForDate(new Date('2026-06-08T01:00:00Z'), 'Asia/Kolkata', 150);
    const b = stoicIndexForDate(new Date('2026-06-08T18:00:00Z'), 'Asia/Kolkata', 150);
    expect(a).toBe(b);
  });
  it('changes across days and stays in range', () => {
    const d1 = stoicIndexForDate(new Date('2026-06-08T12:00:00Z'), 'Asia/Kolkata', 10);
    const d2 = stoicIndexForDate(new Date('2026-06-09T12:00:00Z'), 'Asia/Kolkata', 10);
    expect(d1).not.toBe(d2);
    expect(d1).toBeGreaterThanOrEqual(0);
    expect(d1).toBeLessThan(10);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test`
Expected: FAIL — `stoicIndexForDate` not found.

- [ ] **Step 3: Implement `lib/stoic.ts`**

```ts
import { toZonedTime } from 'date-fns-tz';
import { startOfYear } from 'date-fns';
import type { StoicQuote } from '@/lib/database.types';

export function stoicIndexForDate(date: Date, tz: string, count: number): number {
  const local = toZonedTime(date, tz);
  const dayOfYear = Math.floor((local.getTime() - startOfYear(local).getTime()) / 86_400_000);
  return count > 0 ? dayOfYear % count : 0;
}

export function pickStoicForDate(quotes: StoicQuote[], date: Date, tz: string): StoicQuote | null {
  if (quotes.length === 0) return null;
  return quotes[stoicIndexForDate(date, tz, quotes.length)];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/stoic.ts lib/__tests__/stoic.test.ts
git commit -m "feat(lib): deterministic stoic quote-of-day picker"
```

---

## Task 6: Auth (magic link) + protected shell

**Files:**
- Create: `app/(auth)/login/page.tsx`, `app/(auth)/callback/route.ts`, `app/(app)/layout.tsx`, `middleware.ts`
- Modify: `app/layout.tsx` (metadata only)

- [ ] **Step 1: User action — configure Supabase Auth**

In Supabase dashboard → Authentication → URL Configuration, add
`http://localhost:3000/**` to redirect allow-list. Email provider is on by
default (magic link).

- [ ] **Step 2: Write the session-refresh middleware**

Create `middleware.ts`:
```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    },
  );
  await supabase.auth.getUser();
  return res;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'] };
```

- [ ] **Step 3: Write the login page**

Create `app/(auth)/login/page.tsx` (client component). Use the UI skill for
styling; required behavior:
```tsx
'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/callback` },
    });
    if (error) setError(error.message); else setSent(true);
  }

  if (sent) return <main className="p-8"><p>Check your email for a sign-in link.</p></main>;
  return (
    <main className="p-8 max-w-sm mx-auto">
      <form onSubmit={sendLink} className="space-y-4">
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com" className="w-full border rounded p-2" />
        <button className="w-full rounded bg-black text-white p-2">Send magic link</button>
        {error && <p className="text-red-600 text-sm">{error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Write the auth callback route**

Create `app/(auth)/callback/route.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL('/', req.url));
}
```

- [ ] **Step 5: Write the protected app layout**

Create `app/(app)/layout.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return <div className="min-h-dvh">{children}</div>;
}
```

- [ ] **Step 6: Verify auth end to end**

Run: `npm run dev`. Visit `http://localhost:3000` → redirected to `/login`.
Enter a real email → receive magic link → click → land on `/` authenticated.
In Supabase → Table Editor → `profiles`: confirm exactly one row was created for
the new user (proves `handle_new_user`). Repeat with a second email → second
profile row.

- [ ] **Step 7: Commit**

```bash
git add app middleware.ts
git commit -m "feat(auth): magic-link sign-in + protected shell"
```

---

## Task 7: Routine engine

**Files:**
- Create: `lib/routine.ts`

- [ ] **Step 1: Implement `todayRoutine`**

Create `lib/routine.ts`. Reads run through the session-bound server client so RLS
scopes everything to the current user.
```ts
import { createClient } from '@/lib/supabase/server';
import { isHabitDueToday, expectedSoFar, daysBetween } from '@/lib/recurrence';
import { pickStoicForDate } from '@/lib/stoic';
import { toZonedTime } from 'date-fns-tz';
import { startOfWeek } from 'date-fns';
import type { Goal } from '@/lib/database.types';

export interface HabitItem {
  task_id: string; goal_id: string; title: string;
  recurrence_type: 'daily' | 'weekly_days' | 'weekly_count';
  unit: string | null; target_value: number | null;
  status: 'done' | 'skipped' | 'partial' | null;
  weekly_progress?: string;
}
export interface ProjectItem {
  goal_id: string; title: string; unit: string | null;
  current_value: number; target_value: number;
  weekly_target: number; on_track: boolean; progress: string;
}

function localDateIso(d: Date, tz: string): string {
  return toZonedTime(d, tz).toISOString().slice(0, 10);
}

export async function todayRoutine(today: Date) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');

  const { data: profile } = await supabase.from('profiles').select('timezone').eq('id', user.id).single();
  const tz = profile?.timezone ?? 'Asia/Kolkata';
  const todayIso = localDateIso(today, tz);

  // habit tasks joined to active goals
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, goal_id, title, recurrence_type, weekdays, target_count, target_value, unit, goals!inner(status)')
    .eq('is_active', true)
    .eq('goals.status', 'active');

  const { data: todayLogs } = await supabase
    .from('task_logs').select('task_id, status').eq('log_date', todayIso);
  const logByTask = new Map((todayLogs ?? []).map(l => [l.task_id, l.status]));

  // weekly_count progress (count 'done' this local week)
  const weekStartIso = localDateIso(startOfWeek(toZonedTime(today, tz), { weekStartsOn: 0 }), tz);

  const habit: HabitItem[] = [];
  for (const t of tasks ?? []) {
    const tt = t as unknown as {
      id: string; goal_id: string; title: string;
      recurrence_type: 'daily'|'weekly_days'|'weekly_count'; weekdays: number[]|null;
      target_count: number|null; target_value: number|null; unit: string|null;
    };
    let due = isHabitDueToday(tt, today, tz);
    let weekly_progress: string | undefined;
    if (tt.recurrence_type === 'weekly_count') {
      const { count } = await supabase.from('task_logs')
        .select('id', { count: 'exact', head: true })
        .eq('task_id', tt.id).eq('status', 'done').gte('log_date', weekStartIso);
      const done = count ?? 0;
      due = done < (tt.target_count ?? 0);
      weekly_progress = `${done}/${tt.target_count ?? 0}`;
    }
    if (!due) continue;
    habit.push({
      task_id: tt.id, goal_id: tt.goal_id, title: tt.title,
      recurrence_type: tt.recurrence_type, unit: tt.unit, target_value: tt.target_value,
      status: (logByTask.get(tt.id) as HabitItem['status']) ?? null, weekly_progress,
    });
  }

  // project pace tiles
  const { data: projects } = await supabase
    .from('goals').select('*').eq('goal_type', 'project').eq('status', 'active');
  const project: ProjectItem[] = (projects ?? []).map((g: Goal) => {
    const target = g.target_value ?? 0;
    const current = g.current_value ?? 0;
    const remaining = Math.max(0, target - current);
    const daysLeft = Math.max(1, daysBetween(todayIso, g.due_date ?? todayIso));
    const weeksLeft = Math.max(1, daysLeft / 7);
    return {
      goal_id: g.id, title: g.title, unit: g.unit,
      current_value: current, target_value: target,
      weekly_target: remaining / weeksLeft,
      on_track: current >= expectedSoFar(g, today, tz),
      progress: `${current} / ${target} ${g.unit ?? ''}`.trim(),
    };
  });

  const { data: mood } = await supabase
    .from('mood_logs').select('*').eq('log_date', todayIso).maybeSingle();
  const { data: quotes } = await supabase
    .from('stoic_quotes').select('*').order('id');
  const stoic = pickStoicForDate(quotes ?? [], today, tz);
  const { data: brief } = await supabase
    .from('daily_briefs').select('*').eq('brief_date', todayIso).maybeSingle();

  return { tz, todayIso, habit, project, mood, stoic, brief };
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run build`
Expected: typecheck passes (route consuming it added in Task 8).

- [ ] **Step 3: Commit**

```bash
git add lib/routine.ts
git commit -m "feat(lib): deterministic todayRoutine engine"
```

---

## Task 8: Home / routine view UI

**Files:**
- Create: `app/(app)/page.tsx`, `components/RoutineView.tsx`, `components/HabitItem.tsx`, `components/ProjectItem.tsx`, `components/StoicQuote.tsx`, `components/DailyBrief.tsx`

- [ ] **Step 1: Invoke the UI skill**

Use the `ui-ux-pro-max` (or `frontend-design`) skill to design a **mobile-first
home screen** with these exact data contracts and states. Requirements the UI
must satisfy:
- Receives the `todayRoutine()` payload: `{ habit[], project[], mood, stoic, brief }`.
- **Habit list:** each `HabitItem` shows title, optional unit/target, and a
  check state (`done`/`skipped`/`partial`/none). Tap toggles done; long-press (or
  an overflow control on desktop) offers skipped/partial. Wires to `logHabit`
  (Task 10).
- **Project tiles:** each `ProjectItem` shows `progress` string, an on-track /
  behind badge from `on_track`, the weekly target, and a `+ log progress` button
  (opens modal wired in Task 11).
- **Stoic quote card:** `body` + `author` + `source_work`; empty state if null.
- **Daily brief card:** shows `brief.motivation_text` if present, else a calm
  empty state ("Your daily brief will appear here once morning briefs are on.").
- **Mood entry:** a compact control linking to `/mood`; shows today's mood if set.
- **Empty state:** if `habit` and `project` are both empty, show a CTA to
  `/goals/new`.

- [ ] **Step 2: Wire the Server Component**

Create `app/(app)/page.tsx`:
```tsx
import { todayRoutine } from '@/lib/routine';
import { RoutineView } from '@/components/RoutineView';

export default async function HomePage() {
  const routine = await todayRoutine(new Date());
  return <RoutineView routine={routine} />;
}
```
`RoutineView` and child components are produced by the UI skill in Step 1,
typed against the `todayRoutine` return type and the action signatures from
Tasks 10–11.

- [ ] **Step 3: Verify render**

Run: `npm run dev`. With no goals yet, confirm the empty-state CTA shows and the
Stoic quote card renders the deterministic quote of the day.

- [ ] **Step 4: Commit**

```bash
git add app/(app)/page.tsx components
git commit -m "feat(ui): home routine view"
```

---

## Task 9: Goals CRUD

**Files:**
- Create: `lib/actions/goals.ts`, `app/(app)/goals/page.tsx`, `app/(app)/goals/new/page.tsx`, `app/(app)/goals/[id]/page.tsx`, `components/GoalForm.tsx`, `components/GoalCard.tsx`

- [ ] **Step 1: Write the goal Server Actions**

Create `lib/actions/goals.ts`:
```ts
'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { GoalType, GoalStatus, RecurrenceType } from '@/lib/database.types';

export interface GoalInput {
  title: string; description?: string; category?: string;
  goal_type: GoalType; period_month: string;
  recurrence_type?: RecurrenceType; weekdays?: number[]; target_count?: number;
  scheduled_time?: string; target_value?: number; unit?: string; due_date?: string;
}

function lastDayOfMonth(periodMonth: string): string {
  const d = new Date(periodMonth + 'T00:00:00Z');
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

export async function createGoal(input: GoalInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');
  const due_date = input.goal_type === 'project'
    ? (input.due_date ?? lastDayOfMonth(input.period_month)) : null;
  const { error } = await supabase.from('goals').insert({
    user_id: user.id, title: input.title, description: input.description ?? null,
    category: input.category ?? null, goal_type: input.goal_type,
    period_month: input.period_month, status: 'active',
    recurrence_type: input.recurrence_type ?? null, weekdays: input.weekdays ?? null,
    target_count: input.target_count ?? null, scheduled_time: input.scheduled_time ?? null,
    target_value: input.target_value ?? null, unit: input.unit ?? null, due_date,
  });
  if (error) throw error;
  revalidatePath('/'); revalidatePath('/goals');
  redirect('/goals');
}

export async function updateGoal(id: string, patch: Partial<GoalInput>) {
  const supabase = await createClient();
  const { error } = await supabase.from('goals').update(patch).eq('id', id);
  if (error) throw error;
  revalidatePath('/'); revalidatePath('/goals'); revalidatePath(`/goals/${id}`);
}

export async function setGoalStatus(id: string, status: GoalStatus) {
  const supabase = await createClient();
  const { error } = await supabase.from('goals').update({ status }).eq('id', id);
  if (error) throw error;
  revalidatePath('/'); revalidatePath('/goals');
}

export async function deleteGoal(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('goals').delete().eq('id', id);
  if (error) throw error;
  revalidatePath('/'); revalidatePath('/goals'); redirect('/goals');
}
```

- [ ] **Step 2: Build the goals list + form UI (UI skill)**

Use the UI skill for `components/GoalForm.tsx` (create/edit) and
`components/GoalCard.tsx`, plus the three pages. Form requirements:
- Fields: title, description, category, goal_type (habit/project), period_month
  (default current month, first day).
- If habit: recurrence_type select; if `weekly_days` show a Sun–Sat weekday
  multi-select (0–6); if `weekly_count` show target_count; optional scheduled_time;
  optional target_value + unit.
- If project: target_value, unit, due_date (placeholder = last day of period).
- `goals/page.tsx` lists goals via `GoalCard` with month switcher (default current
  month, query param `?month=YYYY-MM-01`) and archive/delete controls calling
  `setGoalStatus`/`deleteGoal`.
- `goals/new/page.tsx` renders `GoalForm` → `createGoal`.
- `goals/[id]/page.tsx` loads the goal, renders `GoalForm` prefilled → `updateGoal`,
  plus Archive and Delete buttons.

- [ ] **Step 3: Verify CRUD + habit→task trigger**

Run: `npm run dev`. Create a **habit** goal (daily). In Supabase Table Editor →
`tasks`: confirm a matching task row auto-created (proves `handle_new_habit_goal`).
Create a **project** goal with target_value/unit/due_date. Edit each; archive one;
confirm the list and home view reflect changes on next render. Confirm month
switcher filters by `period_month`.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/goals.ts app/(app)/goals components/GoalForm.tsx components/GoalCard.tsx
git commit -m "feat(goals): CRUD with habit-task trigger"
```

---

## Task 10: Habit check-offs + project progress logging

**Files:**
- Create: `lib/actions/logs.ts`
- Modify: `components/HabitItem.tsx`, `components/ProjectItem.tsx` (wire actions)

- [ ] **Step 1: Write the log Server Actions**

Create `lib/actions/logs.ts`:
```ts
'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { LogStatus } from '@/lib/database.types';

async function userTzToday(): Promise<{ userId: string; todayIso: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');
  const { data: p } = await supabase.from('profiles').select('timezone').eq('id', user.id).single();
  const tz = p?.timezone ?? 'Asia/Kolkata';
  const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()); // YYYY-MM-DD
  return { userId: user.id, todayIso };
}

export async function logHabit(taskId: string, status: LogStatus, value?: number) {
  const supabase = await createClient();
  const { userId, todayIso } = await userTzToday();
  const { error } = await supabase.from('task_logs').upsert(
    { user_id: userId, task_id: taskId, log_date: todayIso, status, value: value ?? null },
    { onConflict: 'task_id,log_date' },
  );
  if (error) throw error;
  revalidatePath('/');
}

export async function clearHabit(taskId: string) {
  const supabase = await createClient();
  const { todayIso } = await userTzToday();
  const { error } = await supabase.from('task_logs').delete()
    .eq('task_id', taskId).eq('log_date', todayIso);
  if (error) throw error;
  revalidatePath('/');
}

export async function logProgress(goalId: string, valueAdded: number, note?: string) {
  const supabase = await createClient();
  const { userId, todayIso } = await userTzToday();
  const { error } = await supabase.from('progress_logs').insert(
    { user_id: userId, goal_id: goalId, log_date: todayIso, value_added: valueAdded, note: note ?? null },
  );
  if (error) throw error;
  revalidatePath('/');
}
```

- [ ] **Step 2: Wire HabitItem + ProjectItem (UI skill)**

`HabitItem`: tap → `logHabit(task_id, 'done')`; if already done, tap → `clearHabit`.
Long-press / overflow → choose `skipped` / `partial` (+ optional value).
`ProjectItem`: `+ log progress` opens a modal with numeric `value_added` + optional
note → `logProgress(goal_id, value, note)`.

- [ ] **Step 3: Verify logging + idempotency + trigger**

Run: `npm run dev`. Check off a habit → `task_logs` gets one row; check again →
no duplicate (unique `(task_id, log_date)` upsert). Log project progress twice →
two `progress_logs` rows AND `goals.current_value` increased by the sum (proves
`bump_goal_progress`); home pace tile updates on revalidate.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/logs.ts components/HabitItem.tsx components/ProjectItem.tsx
git commit -m "feat(logs): habit check-offs + project progress logging"
```

---

## Task 11: Mood check-in

**Files:**
- Create: `app/(app)/mood/page.tsx`, `components/MoodCheckIn.tsx`
- Modify: `lib/actions/logs.ts` (add `logMood`)

- [ ] **Step 1: Add `logMood` action**

Append to `lib/actions/logs.ts`:
```ts
export async function logMood(input: { mood: number; energy?: number; gratitude?: string; note?: string }) {
  const supabase = await createClient();
  const { userId, todayIso } = await userTzToday();
  const { error } = await supabase.from('mood_logs').upsert(
    { user_id: userId, log_date: todayIso, mood: input.mood,
      energy: input.energy ?? null, gratitude: input.gratitude ?? null, note: input.note ?? null },
    { onConflict: 'user_id,log_date' },
  );
  if (error) throw error;
  revalidatePath('/'); revalidatePath('/mood');
}
```

- [ ] **Step 2: Build the mood UI (UI skill)**

`components/MoodCheckIn.tsx`: a 1–5 mood selector (emoji/scale), optional 1–5
energy, optional gratitude + note → calls `logMood`. `app/(app)/mood/page.tsx`
loads today's mood (if any) and prefills. Mood is idempotent on
`(user_id, log_date)` — re-submitting updates the same row.

- [ ] **Step 3: Verify**

Run: `npm run dev`. Submit a mood → one `mood_logs` row for today; submit again
with different values → same row updated, not duplicated. Home mood control shows
today's mood.

- [ ] **Step 4: Commit**

```bash
git add app/(app)/mood components/MoodCheckIn.tsx lib/actions/logs.ts
git commit -m "feat(mood): daily mood check-in"
```

---

## Task 12: RLS isolation verification, smoke test, push

**Files:** none (verification + release)

- [ ] **Step 1: Verify RLS across two accounts**

With two signed-up test accounts (A and B): as A, create a goal and log a habit.
Sign out, sign in as B. Confirm B's home view and `/goals` show **none of A's
data**. In SQL Editor, confirm RLS is enabled everywhere:
```sql
select tablename, rowsecurity from pg_tables
where schemaname='public' order by 1;
```
Expected: `rowsecurity = true` for all ten tables.

- [ ] **Step 2: Full local smoke test**

As one account: create a habit (weekly_days Mon/Wed/Fri) + a project goal →
verify the habit only appears on its weekdays and the project pace badge reads
correctly → check off the habit → log progress → record a mood → confirm the
Stoic quote matches `stoicIndexForDate` for today. Run `npm run test` (all unit
tests green) and `npm run build` (clean).

- [ ] **Step 3: Write README**

Create/replace `README.md` with: project summary, prerequisites, env setup
(`.env.local` from `.env.example`), how to run the two SQL files in the dashboard,
`npm run dev`, and a note that push/Edge/LLM are later slices.

- [ ] **Step 4: Commit and push**

```bash
git add README.md
git commit -m "docs: README + run instructions"
git push -u origin main
```
(Push only after confirming with the user.)

---

## Self-Review

**Spec coverage:** scaffold (Task 0) · full schema + triggers + RLS (Task 1) ·
~150 stoic seed (Task 2) · supabase clients/types (Task 3) · recurrence + pace
(Task 4) · deterministic quote pick (Task 5) · magic-link auth + profiles trigger
(Task 6) · routine engine (Task 7) · home view (Task 8) · goals CRUD + habit→task
trigger (Task 9) · habit check-offs + project progress + bump trigger (Task 10) ·
mood check-in (Task 11) · RLS two-JWT verification + smoke + push (Task 12).
Every spec §2 in-scope item and §10 DoD criterion maps to a task. Out-of-slice
items (push/Edge/LLM/PWA) are intentionally absent; their tables still exist.

**Type consistency:** `todayRoutine` returns `{ tz, todayIso, habit, project,
mood, stoic, brief }`; the home Server Component (Task 8) and UI components consume
that shape. Action signatures (`logHabit`, `clearHabit`, `logProgress`, `logMood`,
`createGoal`, `updateGoal`, `setGoalStatus`, `deleteGoal`) are defined once and
referenced consistently by the UI tasks. `HabitItem`/`ProjectItem` interfaces are
defined in `lib/routine.ts` and reused.

**Placeholders:** the only deferred content is the Stoic seed body text (Task 2),
which is a bounded content-generation task with explicit acceptance criteria, not
a code placeholder. UI tasks specify exact data contracts, props, states, and
which action each control calls — the UI skill supplies visual styling, not
undefined behavior.
