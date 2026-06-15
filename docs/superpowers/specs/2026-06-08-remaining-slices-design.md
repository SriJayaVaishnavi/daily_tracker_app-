# Remaining Slices — Daily Brief, Quiet Hours, Onboarding, Offline Shell — Design

**Date:** 2026-06-08
**Status:** Approved (design)
**Depends on:** Slice 2 (reminders) for the daily-brief reminder; Slice 1 (push) for onboarding's enable step.
**Canonical spec:** `docs/PRD.md` §6 (phasing), §7.6 (brief), §4 (Funtouch), §7.8 (PWA), §5.2 (`profiles.quiet_hours_*`).

Four independent features completing the v1 local-first feature set. Each is
buildable and verifiable on localhost. No new DB migrations.

---

## A. Daily brief generator (Slice 3)

**Decision:** lazy-on-load generation (chosen by user).

- `lib/brief.ts` (pure + LLM):
  - `BriefContext` = `{ displayName, activeGoals, doneYesterday }`.
  - `templateBrief(ctx)` — deterministic motivation line, no I/O (unit-tested).
  - `generateBrief(ctx)` — Groq call (plain-text completion) returning
    `{ text, source: 'llm' | 'template' }`; falls back to `templateBrief` on a
    missing key, network error, or empty response. Mirrors `parseGoalText`.
- `lib/actions/brief.ts` — `ensureTodayBrief()`: for the current user + today's
  local date, if no `daily_briefs` row exists, gather context, call
  `generateBrief`, pick today's stoic quote id, and **upsert** the row
  (`onConflict: 'user_id,brief_date'`). Idempotent — one row per day, no
  regeneration. (Relies on the existing `unique(user_id, brief_date)`.)
- `app/(app)/page.tsx` — call `ensureTodayBrief()` before `todayRoutine()`, so
  the brief exists when the routine reads it. `RoutineView` already renders
  `<DailyBrief>`.
- The Slice 2 `daily_brief` reminder already reads `motivation_text`, so the
  morning push now carries the real line.

**Insert shape:** `daily_briefs` Insert is `Omit<DailyBrief,'id'|'generated_at'>`
→ `{ user_id, brief_date, motivation_text, stoic_quote_id, generated_by }`.

---

## B. Quiet hours

- `lib/quiet-hours.ts` (pure): `isWithinQuietHours(nowHHMM, start, end)` →
  boolean. Handles same-day windows (`13:00`–`14:00`) and overnight wrap
  (`22:00`–`07:00`). Returns false when either bound is null. Unit-tested.
- `lib/actions/profile.ts` — `setQuietHours(start, end)` (null clears),
  `getProfileSettings()` returns `{ timezone, quietStart, quietEnd }`.
- Processor (`app/api/reminders/process/route.ts`): it already fetches the
  user's `timezone`; also select `quiet_hours_start/end`. Compute
  `nowHHMM = formatInTimeZone(now, tz, 'HH:mm')`. If
  `isWithinQuietHours(nowHHMM, start, end)` → **skip**: do not send, do not
  advance `next_fire_at`, do not set `last_sent_at`. The reminder stays due and
  fires on the first run after the window ends.
- `components/QuietHoursSettings.tsx` (client) — two `<input type="time">` +
  a clear toggle, calling `setQuietHours`. Rendered in the Settings Reminders
  section.

---

## C. Onboarding (Slice 4)

- One-time gated flow at a **top-level** `/onboarding` route (own auth guard, so
  it never redirect-loops with the `(app)` layout).
- Gate flag: `profiles.notif_prefs.onboarded === true` (jsonb — no migration).
  `isOnboarded(profile)` helper.
- `app/onboarding/page.tsx` (server): if `!user` → `/login`; if
  `needsPasswordSetup` → `/set-password`; if already onboarded → `/`. Else
  render `OnboardingFlow`.
- `components/OnboardingFlow.tsx` (client): three steps in one calm card —
  1. **Timezone** select (default from profile / `Asia/Kolkata`).
  2. **Enable reminders** — reuses the Slice 1 subscribe logic (a compact
     enable button).
  3. **Funtouch battery nudge** — the PRD §4 copy + a `dontkillmyapp.com` link.
  "Finish" → `completeOnboarding(timezone)` → `router.replace('/')`.
- `lib/actions/profile.ts` — `completeOnboarding(timezone)`: update
  `profiles.timezone` and merge `{ onboarded: true }` into `notif_prefs`.
- Gate redirect added to `app/(app)/layout.tsx` only (after the password check):
  fetch the profile; if not onboarded → `redirect('/onboarding')`. Layout-only
  is sufficient (onboarding isn't write-critical like the auth race was).

---

## D. Offline shell

- `public/sw.js`: it already pre-caches `/` on install but has **no `fetch`
  handler**, so nothing is served offline. Add a `fetch` listener:
  network-first for `navigate` requests, falling back to the cached `/` shell
  when offline; ignore non-GET and cross-origin. Bump `CACHE` to
  `routine-shell-v2` (the activate handler already prunes old caches).

---

## Testing

- Unit (Vitest): `templateBrief` (deterministic output), `generateBrief`
  no-key path → template, `isWithinQuietHours` (same-day in/out, overnight wrap,
  null bounds).
- Static: `tsc`, `vitest`, `next lint`, `next build` all green.
- Manual: open home with no Groq key → template brief shows; with a key → LLM
  line. Set quiet hours covering "now", force a due reminder, run processor →
  skipped (not sent, stays due). Fresh account → `/onboarding` appears once,
  Finish lands home and doesn't reappear. DevTools offline → app shell still
  loads.

---

## File summary

| File | Action |
|---|---|
| `lib/brief.ts` | Create — `templateBrief`, `generateBrief`, `BriefContext` |
| `lib/actions/brief.ts` | Create — `ensureTodayBrief` |
| `lib/quiet-hours.ts` | Create — `isWithinQuietHours` |
| `lib/actions/profile.ts` | Create — quiet hours + onboarding + getter |
| `lib/__tests__/brief.test.ts` | Create — template + no-key tests |
| `lib/__tests__/quiet-hours.test.ts` | Create — window tests |
| `lib/auth.ts` | Modify — `isOnboarded(profile)` helper |
| `app/(app)/page.tsx` | Modify — call `ensureTodayBrief()` |
| `app/(app)/layout.tsx` | Modify — onboarding gate redirect |
| `app/api/reminders/process/route.ts` | Modify — quiet-hours skip |
| `app/onboarding/page.tsx` | Create — gated onboarding route |
| `components/OnboardingFlow.tsx` | Create — onboarding UI |
| `components/QuietHoursSettings.tsx` | Create — quiet hours UI |
| `app/(app)/settings/page.tsx` | Modify — render quiet hours |
| `public/sw.js` | Modify — offline fetch handler + cache v2 |
