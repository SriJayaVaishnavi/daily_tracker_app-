-- Routine Tracker — initial schema, triggers, RLS
-- Run this in the Supabase dashboard SQL Editor (one shot).

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
