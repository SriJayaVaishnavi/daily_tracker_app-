-- Journal uploads for Talk — storage bucket + RLS + message attachment column.
-- Run this in the Supabase dashboard SQL Editor (one shot), after 0002_therapy.sql.

-- ── attachment metadata on therapy messages ──────────────────
-- Shape: { "path": "<user_id>/<session_id>/<uuid>-<name>", "kind": "image" | "pdf", "name": "<original filename>" }
alter table therapy_messages add column if not exists attachment jsonb;

-- ── private bucket for uploaded journals ─────────────────────
insert into storage.buckets (id, name, public)
values ('journals', 'journals', false)
on conflict (id) do nothing;

-- ── Row Level Security on the stored objects ─────────────────
-- Files live under a "<user_id>/..." prefix; users may only touch their own.
create policy "journals read own"
  on storage.objects for select
  using (bucket_id = 'journals' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "journals insert own"
  on storage.objects for insert
  with check (bucket_id = 'journals' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "journals delete own"
  on storage.objects for delete
  using (bucket_id = 'journals' and (storage.foldername(name))[1] = auth.uid()::text);
