-- Virtual Therapist — sessions + messages, RLS
-- Run this in the Supabase dashboard SQL Editor (one shot), after 0001_init.sql.

-- ── therapy_sessions ─────────────────────────────────────────
create table therapy_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  persona text not null default 'warm',            -- 'warm' | 'stoic'
  risk_flag text not null default 'none',          -- 'none' | 'concern' | 'crisis'
  mode text not null default 'chat',               -- 'chat' | 'roleplay'
  roleplay_persona text,                           -- e.g. 'manager' when mode='roleplay'
  summary text,                                    -- rolling memory of this session
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index therapy_sessions_user_idx on therapy_sessions (user_id, started_at desc);

-- ── therapy_messages ─────────────────────────────────────────
create table therapy_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references therapy_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,                              -- 'user' | 'assistant' | 'coach'
  content text not null,
  action jsonb,                                    -- launch_tool / roleplay_* / null
  created_at timestamptz not null default now()
);
create index therapy_messages_session_idx on therapy_messages (session_id, created_at);

-- ── Row Level Security ───────────────────────────────────────
alter table therapy_sessions enable row level security;
create policy "own rows" on therapy_sessions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table therapy_messages enable row level security;
create policy "own rows" on therapy_messages for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
