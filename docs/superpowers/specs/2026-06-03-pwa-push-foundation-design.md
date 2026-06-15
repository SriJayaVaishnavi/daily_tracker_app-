# PWA Shell + Web Push Subscription (Slice 1) — Design

**Date:** 2026-06-03
**Status:** Approved (design), pending spec review
**Parent spec:** [`docs/PRD.md`](../../PRD.md) — begins the push / PWA layer the
foundation slice deferred (PRD "what this unblocks next", item **A**).

This document scopes the **first** push slice only. The full push layer is four
subsystems — (A) PWA shell + push subscription, (B) reminder scheduling +
delivery, (C) LLM daily-brief generator, (D) onboarding/battery polish. They
will be built one at a time; this spec covers **(A)** plus a manual test-send so
delivery is verifiable end to end. Where it differs from the PRD, this slice
wins for the current session.

---

## 1. Goal of this slice

Make the app an installable PWA that can receive a Web Push notification, and
let a logged-in user grant permission, register a push subscription, and fire a
**test notification to their own device** — all running and verifiable on
`localhost`, with no paid services.

When this slice is done:
- The app is installable (valid manifest + icons + registered service worker).
- A user can enable notifications; their subscription is stored in
  `push_subscriptions` (RLS-protected).
- A "Send test notification" action delivers a real OS notification via
  `web-push` + VAPID; clicking it focuses/opens the app.
- Stale subscriptions (push endpoint returns 404/410) are pruned automatically.

---

## 2. Key decision: local-first delivery

The PRD's production delivery path is a Supabase Edge Function invoked by
pg_cron. Neither runs locally, so neither can be built-and-verified here. This
slice therefore delivers pushes from a **Next.js route handler using the
`web-push` library** with our own VAPID keys. This is fully local, fully free,
and the send logic lives in `lib/push.ts` (`sendPushToUser`) so the later
Edge-Function port reuses the same payload contract. No rework to the data model
or the subscribe flow when we port.

---

## 3. In scope

1. **Web app manifest** — `app/manifest.ts` (Next.js metadata route): name
   "Routine", `display: standalone`, `start_url: /`, theme/background colors from
   the existing design tokens, 192px + 512px icons (`512` marked `purpose: any`).
2. **App icons** — `public/icon-192.png`, `public/icon-512.png`, generated
   on-brand (calm palette). A maskable variant is out of scope (YAGNI for v1).
3. **Service worker** — `public/sw.js`, plain JS, no build step:
   - `install` → pre-cache a minimal offline shell; `skipWaiting`.
   - `activate` → clean old caches; `clients.claim`.
   - `push` → parse JSON payload `{ title, body, url, tag }`, `showNotification`.
   - `notificationclick` → focus an existing client or `openWindow(url ?? '/')`.
4. **SW registration** — `components/ServiceWorkerRegistrar.tsx` (client),
   registers `/sw.js` after load; rendered once in the root `app/layout.tsx`.
   No-op when `serviceWorker` is unavailable.
5. **Subscription flow** — `components/NotificationManager.tsx` (client):
   detects support + current `Notification.permission`; "Enable notifications"
   requests permission then `registration.pushManager.subscribe({
   userVisibleOnly: true, applicationServerKey: <VAPID public> })`; posts the
   subscription to the `savePushSubscription` action; "Send test notification"
   calls the test route. Reflects states: unsupported, default, granted, denied.
   Uses `vapidKeyToUint8Array` from `lib/push-keys.ts` (pure, unit-tested) to
   convert the VAPID public key into the `applicationServerKey` byte array.
6. **Persist subscription** — `lib/actions/push.ts` →
   `savePushSubscription(sub)` (`'use server'`, auth-gated): extracts
   `endpoint`, `keys.p256dh`, `keys.auth`, `navigator.userAgent`; upserts into
   `push_subscriptions` on `endpoint` (`onConflict: 'endpoint'`), sets
   `last_seen_at`. RLS enforces `user_id = auth.uid()`.
7. **Send helper** — `lib/push.ts` (server-only): configures `web-push` with
   `VAPID_PUBLIC`/`VAPID_PRIVATE` + a `mailto:` subject; `sendPushToUser(userId,
   payload)` loads that user's subscriptions and sends to each; on a `404`/`410`
   response deletes that subscription row. Returns a `{ sent, pruned }` summary.
8. **Test route** — `app/api/push/test/route.ts` (`POST`, auth-gated): resolves
   the current user and calls `sendPushToUser(user.id, <test payload>)`.
9. **Types** — add `PushSubscription` type and the `push_subscriptions` entry to
   the hand-written `lib/database.types.ts` (currently absent).
10. **Settings surface** — `app/(app)/settings/page.tsx` hosting
    `NotificationManager`, plus a "Settings" item in `components/BottomNav.tsx`.
11. **Config** — add `web-push` (and `@types/web-push`) to `package.json`;
    generate a VAPID keypair; document `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and
    `VAPID_PRIVATE_KEY` in `.env.example`; set both in `.env.local`.

## 4. Out of scope (later slices / YAGNI)

- `reminders` table writes, `next_fire_at` computation, and any "process due
  reminders" route (Slice B).
- The LLM `daily-brief` generator and brief push (Slice C).
- Funtouch battery-optimization onboarding nudge and enable/disable management
  UI beyond the basic subscribe/test (Slice D).
- The Supabase Edge Function + pg_cron production delivery port.
- Maskable/adaptive icons, push payload encryption beyond what `web-push`
  provides by default, multi-device subscription management UI.

---

## 5. Architecture (this slice)

```
Browser (installed PWA / Chrome)
  app/manifest.ts ──► installability
  public/sw.js    ──► push receiver + notificationclick + offline shell
        ▲  push event (Web Push / VAPID)
        │
  NotificationManager (client)
    permission → pushManager.subscribe(VAPID_PUBLIC)
        │ savePushSubscription(sub)  [server action]
        ▼
  Supabase push_subscriptions  (RLS: user_id = auth.uid())
        ▲ read
        │
  POST /api/push/test ──► lib/push.sendPushToUser(userId, payload)
                            └─ web-push + VAPID_PRIVATE → push service
                               404/410 → delete stale subscription
```

No Edge Function, no pg_cron, no reminders in this slice.

---

## 6. Module boundaries

- **`app/manifest.ts`** — static metadata. *Depends on:* icon files. *Used by:*
  the browser.
- **`public/sw.js`** — pure browser worker; no app imports. *Interface:* listens
  for `install`/`activate`/`push`/`notificationclick`. *Contract:* push payload
  is JSON `{ title, body, url?, tag? }`.
- **`components/ServiceWorkerRegistrar.tsx`** *(client)* — side-effect only,
  renders nothing. *Depends on:* `/sw.js`.
- **`components/NotificationManager.tsx`** *(client)* — owns permission +
  subscription UI state. *Depends on:* `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
  `savePushSubscription`, `/api/push/test`.
- **`lib/push.ts`** *(server-only)* — `sendPushToUser(userId, payload)` and the
  web-push config. *Depends on:* `web-push`, VAPID env, a Supabase server client.
  *Used by:* the test route now; reminders + brief later.
- **`lib/actions/push.ts`** *(server action)* — `savePushSubscription(sub)`.
  *Depends on:* Supabase server client. RLS-gated.
- **`app/api/push/test/route.ts`** *(route handler)* — auth gate + one call to
  `sendPushToUser`.
- **`lib/database.types.ts`** — add the `push_subscriptions` row + type.

A pure helper `vapidKeyToUint8Array(base64Url)` (used client-side to convert the
VAPID public key for `applicationServerKey`) is small and **unit-testable**; it
lives in `lib/push-keys.ts` so it can be tested without a browser.

---

## 7. Data: `push_subscriptions` (already exists)

```
id uuid pk · user_id uuid → auth.users · endpoint text unique
p256dh text · auth_key text · user_agent text
created_at timestamptz · last_seen_at timestamptz
RLS "own rows": user_id = auth.uid()  (using + with check)
```

No schema change. The browser `PushSubscription.toJSON()` gives `endpoint` and
`keys.{p256dh, auth}` → mapped to `endpoint`, `p256dh`, `auth_key`.

---

## 8. Error handling & edge cases

- **No `serviceWorker` / `PushManager`** (e.g. some browsers) → manager renders a
  short "not supported on this browser" note; no buttons.
- **Permission `denied`** → inline message explaining how to re-enable in browser
  settings; no subscribe attempt.
- **Permission dismissed (`default` again)** → button stays available to retry.
- **Duplicate endpoint** → upsert on `endpoint` (re-subscribing is idempotent).
- **Stale subscription** → `web-push` throws with `statusCode` 404/410 → that row
  is deleted; `sendPushToUser` continues to the rest.
- **Missing VAPID env** → `lib/push.ts` throws a clear server error; the manager
  hides the test button when `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is absent.
- **Auth** → both `savePushSubscription` and the test route require a session;
  RLS independently guarantees a user only ever reads/writes their own subs.
- **localhost over http** → Web Push + service workers are allowed on
  `http://localhost` by browsers, so local verification works without TLS.

---

## 9. Testing / verification

- **Unit (`lib/push-keys.ts`):** `vapidKeyToUint8Array` — known base64url input →
  expected byte length (65) and first byte `0x04`; padding handled.
- **Build:** `npm run build` succeeds; `tsc --noEmit` and `next lint` clean; the
  existing 36 tests still pass.
- **Manual (localhost, Chrome):**
  1. Load app → DevTools ▸ Application shows the manifest, an installed/registered
     service worker, and "installable".
  2. Settings → Enable notifications → grant → a `push_subscriptions` row appears
     for the user (verify in Supabase).
  3. Send test notification → a real OS notification appears; clicking it focuses
     the app at `/`.
  4. Revoke the subscription in DevTools, send again → the stale row is pruned and
     the call reports `pruned: 1`.

---

## 10. Definition of Done

- App is installable locally with a valid manifest, icons, and a registered
  service worker.
- A logged-in user can enable notifications; the subscription persists in
  `push_subscriptions` under RLS.
- The test route delivers a real Web Push notification via `web-push` + VAPID;
  clicking it focuses the app.
- Stale subscriptions are pruned on send failure.
- `lib/push-keys.ts` has a passing unit test; `tsc` + lint clean; existing tests
  still green.
- `web-push` added; VAPID keys documented in `.env.example` and set in
  `.env.local`; all source committed.

---

## 11. Required from the user

- Nothing paid. VAPID keys are generated locally during the build.
- To test on the **phone** (vs. desktop Chrome), the dev server must be reachable
  over HTTPS or via `localhost` forwarding — deferred; desktop Chrome on
  `http://localhost:3000` is the verification target for this slice.

---

## 12. What this unblocks next

`lib/push.sendPushToUser` becomes the shared delivery primitive for **Slice B**
(reminder scheduling + a local "process due reminders" route) and **Slice C**
(the LLM daily-brief push), and the same subscription data is what a future
Supabase Edge Function will read when the production delivery path is deployed.
