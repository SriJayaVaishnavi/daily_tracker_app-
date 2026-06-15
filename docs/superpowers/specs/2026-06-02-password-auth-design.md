# Password Auth with Magic-Link Onboarding & Recovery — Design

**Date:** 2026-06-02
**Status:** Approved (design), pending spec review
**Parent spec:** [`docs/PRD.md`](../../PRD.md) — refines the auth approach.

Today the app uses **magic-link only** (`signInWithOtp`). This feature adds
**password sign-in** for returning users while keeping magic link for first-time
onboarding and forgot-password recovery.

---

## 1. Goal

- **New user:** signs in via magic link the first time, then is **required** to
  create a password before reaching the app.
- **Returning user:** signs in with **email + password**.
- **Forgot password:** requests a magic link that lands on a screen to set a new
  password.

Magic link remains available to everyone as a fallback ("Email me a link instead").

---

## 2. How "has a password" is tracked

When a user sets a password we write `password_set: true` into their Supabase
**`user_metadata`** via `updateUser({ password, data: { password_set: true } })`.
The flag travels with the session, so the forced-setup gate needs no extra DB
query. It is a UI flag only (not security-critical): it is set exactly when a
password is created, so it is always accurate.

---

## 3. Flows

```
NEW USER
  /login → "Email me a link instead" → signInWithOtp → email link → /callback
  → (app)/layout sees user_metadata.password_set ≠ true → redirect /set-password
  → updateUser({ password, data:{ password_set:true } }) → /

RETURNING USER
  /login → email + password → signInWithPassword → /

FORGOT PASSWORD
  /login → "Forgot password?" → resetPasswordForEmail(email,
       { redirectTo: origin + '/callback?next=/set-password' })
  → email link → /callback exchanges code, redirects to next (/set-password)
  → updateUser({ password }) → /
```

---

## 4. Files & changes

| File | Change |
|---|---|
| `app/(auth)/login/page.tsx` | **Rewrite.** Email + password primary (`signInWithPassword`); "Email me a link instead" (`signInWithOtp`); "Forgot password?" (`resetPasswordForEmail`). Restyled with the app's design tokens (`bg-surface`, `border-border`, `text-foreground`, `bg-primary`, `transition-calm`, `font-serif`) — the current screen predates them. |
| `app/(auth)/set-password/page.tsx` | **New**, session-guarded. New-password + confirm → `updateUser`. Serves both first-time setup and forgot-password recovery. Lives in `(auth)`, not `(app)`. |
| `app/(auth)/callback/route.ts` | Honor a `next` query param (sanitized to a local path, default `/`) so recovery lands on `/set-password`. |
| `app/(app)/layout.tsx` | After the existing `if (!user) redirect('/login')`, add `if (!user.user_metadata?.password_set) redirect('/set-password')`. |
| `lib/auth.ts` | **New, pure, unit-tested**: `needsPasswordSetup(user)` and `validatePassword(pw, confirm)` → `string \| null` error. |

### Why `/set-password` lives in `(auth)`, not `(app)`

The forced-setup redirect lives in the `(app)` layout. If `/set-password` were
inside `(app)`, that layout would fire on it and redirect forever. Placing it in
`(auth)` — which has no forced gate, only its own session check — breaks the loop
and keeps the screen chrome-free, matching `/login`.

---

## 5. Module boundaries

- **`lib/auth.ts`** *(pure, no I/O)* —
  - `needsPasswordSetup(user)`: `true` when `user.user_metadata?.password_set` is
    not `true`. *Used by:* `(app)/layout.tsx`.
  - `validatePassword(password, confirm)`: returns an error string (too short
    `< 8`, or mismatch) or `null` when valid. *Used by:* set-password form.
  *Unit-testable in isolation.*
- **`/login`** *(client)* — three actions against the browser Supabase client.
- **`/set-password`** *(server guard + client form)* — server component redirects
  to `/login` if no session; renders the client form that calls `updateUser` then
  navigates to `/`.
- **`/callback`** *(route handler)* — exchanges the code, redirects to a validated
  `next`.

---

## 6. Error handling & edge cases

- **Wrong password** → "Incorrect email or password." with a nudge to use the
  magic-link or forgot-password options.
- **Password too short (< 8) or mismatch** → inline error, validated client-side
  before calling Supabase.
- **No session on `/set-password`** → redirect `/login`.
- **`next` param** → only honored if it is a local path beginning with `/` and not
  `//` (open-redirect guard); otherwise `/`.
- **Magic link / reset email sent** → "Check your email" confirmation state.
- **New users are already email-confirmed** (they clicked a magic link), so
  password sign-in works for them once a password is set.

---

## 7. Testing / verification

- **Unit (`lib/auth.ts`):** `validatePassword` (too short, mismatch, valid) and
  `needsPasswordSetup` (flag `true`, `false`, absent).
- **Manual:**
  1. New email → "Email me a link instead" → click link → forced to
     `/set-password` → set password → reach home.
  2. Sign out → sign in with email + password → reach home.
  3. Wrong password → error shown.
  4. "Forgot password?" → email link → `/set-password` → new password → home →
     sign in again with the new password.

---

## 8. Definition of Done

- Returning users sign in with email + password.
- First-time magic-link users are forced through `/set-password` before the app.
- Forgot-password sends a magic link that lands on `/set-password`.
- Magic-link fallback still works from `/login`.
- `lib/auth.ts` has passing unit tests; existing tests still pass; lint + `tsc`
  clean.

---

## 9. Required from the user / Supabase config

- Email/password sign-in enabled in Supabase (default on).
- `http://localhost:3000/callback` in the Auth redirect allowlist (the Site URL
  set earlier should cover the origin; query params like `?next=` are allowed).
