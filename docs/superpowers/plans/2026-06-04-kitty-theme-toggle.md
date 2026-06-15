# Kitty Theme + Theme Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a baby-pink "kitty" theme (the new default) plus a Settings toggle to switch between kitty and the existing amber theme, persisted with no flash on load.

**Architecture:** A `data-theme` attribute on `<html>` selects the theme. Kitty lives in `:root` (default); `[data-theme="amber"]` overrides. A pure helper resolves the stored choice; an inline pre-paint script applies it; a client toggle in Settings writes it. CSS variables + Tailwind tokens already route all color/font, so this is a token swap + a small toggle — no logic changes to existing features.

**Tech Stack:** Next.js 14 (App Router, TS), Tailwind, `next/font/google`, Vitest, pure-Node PNG generation (no image deps).

**Spec:** `docs/superpowers/specs/2026-06-04-kitty-theme-toggle-design.md`

> **Commit note:** This repo follows a standing rule — *never change git state without explicit user approval.* The `Commit` steps below are the intended commit boundaries; during execution, confirm with the user before each commit (or batch them at the end if the user prefers).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `lib/theme.ts` | Pure theme constants + `resolveTheme(stored)` | Create |
| `lib/__tests__/theme.test.ts` | Unit tests for the helper | Create |
| `app/globals.css` | Both palettes, semantic font vars, mascot visibility | Modify |
| `app/layout.tsx` | Load 4 fonts, expose vars, inline pre-paint script | Modify |
| `tailwind.config.ts` | Repoint `serif`/`sans` to `--font-display`/`--font-body` | Modify |
| `components/KittyMark.tsx` | Presentational cat-mascot SVG | Create |
| `components/ThemeToggle.tsx` | Client theme switcher | Create |
| `app/(app)/layout.tsx` | Mascot in header brand | Modify |
| `app/(auth)/login/page.tsx` | Mascot in landing hero | Modify |
| `app/(app)/settings/page.tsx` | Render the toggle | Modify |
| `scripts/generate-icons.mjs` | Draw kitty PNG icons | Rewrite |
| `app/manifest.ts` | Kitty `theme_color`/`background_color` | Modify |
| `public/icon-192.png`, `icon-512.png` | Regenerated icons | Regenerate |

---

## Task 1: Pure theme helper + tests

**Files:**
- Create: `lib/theme.ts`
- Test: `lib/__tests__/theme.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/theme.test.ts
import { describe, it, expect } from 'vitest';
import { resolveTheme, THEME_STORAGE_KEY, type Theme } from '@/lib/theme';

describe('resolveTheme', () => {
  it('returns amber only when stored value is exactly "amber"', () => {
    expect(resolveTheme('amber')).toBe<Theme>('amber');
  });
  it('returns kitty (default) for "kitty"', () => {
    expect(resolveTheme('kitty')).toBe<Theme>('kitty');
  });
  it('returns kitty (default) for null', () => {
    expect(resolveTheme(null)).toBe<Theme>('kitty');
  });
  it('returns kitty (default) for an unknown value', () => {
    expect(resolveTheme('rainbow')).toBe<Theme>('kitty');
  });
});

it('exposes the storage key', () => {
  expect(THEME_STORAGE_KEY).toBe('routine-theme');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/theme.test.ts`
Expected: FAIL — cannot resolve module `@/lib/theme`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/theme.ts
/** The two selectable themes. Kitty is the default. */
export type Theme = 'kitty' | 'amber';

/** localStorage key holding the user's theme choice. */
export const THEME_STORAGE_KEY = 'routine-theme';

/**
 * Resolve a stored value to a concrete theme. Anything other than the exact
 * string "amber" resolves to the default, "kitty" (so null / garbage / "kitty"
 * all mean kitty). Pure — safe to use in the inline pre-paint script logic and
 * the toggle alike.
 */
export function resolveTheme(stored: string | null | undefined): Theme {
  return stored === 'amber' ? 'amber' : 'kitty';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/theme.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/theme.ts lib/__tests__/theme.test.ts
git commit -m "feat(theme): pure theme resolver + storage key"
```

---

## Task 2: Both palettes + mascot visibility in globals.css

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Replace the `:root` block and the dark-mode block**

Replace the existing `:root { ... }` block AND the entire `@media (prefers-color-scheme: dark) { ... }` block (lines ~5–34) with:

```css
/* Default theme: kitty (baby pink). Light-only. */
:root {
  --background: #fff5f9;
  --surface: #ffffff;
  --foreground: #4a2c3a;
  --muted-fg: #a9788b;
  --border: #ffe0ec;
  --primary: #ff8cc0;
  --primary-fg: #5b2138;
  --accent: #59c7bd;
  --accent-fg: #0b3b37;
  --destructive: #b91c1c;
  --ring: #ec6aaa;

  --font-display: var(--font-baloo);
  --font-body: var(--font-nunito);
}

/* Alternative theme: amber (warm wellness). Light-only. */
[data-theme='amber'] {
  --background: #faf7f2;
  --surface: #ffffff;
  --foreground: #1a1714;
  --muted-fg: #6b6258;
  --border: #ece4d8;
  --primary: #b45309;
  --primary-fg: #ffffff;
  --accent: #047857;
  --accent-fg: #ffffff;
  --destructive: #b91c1c;
  --ring: #b45309;

  --font-display: var(--font-lora);
  --font-body: var(--font-raleway);
}
```

- [ ] **Step 2: Repoint the body and heading font-families**

Change the `body` rule's `font-family` and the `h1, h2, h3, h4` rule:

```css
body {
  color: var(--foreground);
  background: var(--background);
  font-family: var(--font-body), ui-sans-serif, system-ui, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

h1, h2, h3, h4 {
  font-family: var(--font-display), ui-serif, Georgia, serif;
}
```

- [ ] **Step 3: Add the mascot-visibility rule**

Append near the bottom of the file (before `@layer utilities`):

```css
/* The kitty mascot only appears in the kitty theme. */
[data-theme='amber'] .kitty-mark {
  display: none;
}
```

- [ ] **Step 4: Verify existing tests + build are unaffected**

Run: `npx vitest run`
Expected: all existing tests PASS (no logic changed).
Run: `npx tsc --noEmit`
Expected: exit 0.

(The fonts referenced here — `--font-baloo` etc. — are wired in Task 3; CSS tolerates undefined vars by falling back, so the build stays green meanwhile.)

- [ ] **Step 5: Commit**

```bash
git add app/globals.css
git commit -m "feat(theme): kitty :root palette + amber override, drop dark mode"
```

---

## Task 3: Load four fonts + inline pre-paint script + Tailwind tokens

**Files:**
- Modify: `app/layout.tsx`
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Rewrite `app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Baloo_2, Nunito, Lora, Raleway } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

const baloo = Baloo_2({ subsets: ["latin"], variable: "--font-baloo", display: "swap" });
const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito", display: "swap" });
const lora = Lora({ subsets: ["latin"], variable: "--font-lora", display: "swap" });
const raleway = Raleway({ subsets: ["latin"], variable: "--font-raleway", display: "swap" });

export const metadata: Metadata = {
  title: "Routine",
  description: "A calm, minimal daily routine and habit tracker.",
};

// Applied before first paint so a stored "amber" choice never flashes the
// default kitty theme. Mirrors lib/theme.ts resolveTheme(): only the exact
// string "amber" switches away from the kitty default. Wrapped so a storage
// exception (private mode) can never block render.
const themeScript = `(function(){try{if(localStorage.getItem('routine-theme')==='amber'){document.documentElement.dataset.theme='amber';}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${baloo.variable} ${nunito.variable} ${lora.variable} ${raleway.variable} antialiased`}
      >
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Repoint Tailwind `serif`/`sans` to the semantic vars**

In `tailwind.config.ts`, replace the `fontFamily` block:

```ts
      fontFamily: {
        serif: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
```

- [ ] **Step 3: Verify build + types**

Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx tailwind.config.ts
git commit -m "feat(theme): load kitty+amber fonts, pre-paint theme script, semantic font tokens"
```

---

## Task 4: Kitty mascot component + placements

**Files:**
- Create: `components/KittyMark.tsx`
- Modify: `app/(app)/layout.tsx`
- Modify: `app/(auth)/login/page.tsx`

- [ ] **Step 1: Create the mascot component**

```tsx
// components/KittyMark.tsx
// Original cat mascot (gold bow) — NOT Sanrio's Hello Kitty. Presentational only.
// Add the `kitty-mark` class at the call site so the amber theme can hide it.
export default function KittyMark({
  size = 30,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={className}
    >
      <path d="M14 16 L8 4 L24 12 Z" fill="#fff" stroke="#ffd4e7" strokeWidth="2" />
      <path d="M50 16 L56 4 L40 12 Z" fill="#fff" stroke="#ffd4e7" strokeWidth="2" />
      <ellipse cx="32" cy="34" rx="24" ry="21" fill="#fff" stroke="#ffd4e7" strokeWidth="2" />
      <circle cx="23" cy="33" r="2.6" fill="#4a2c3a" />
      <circle cx="41" cy="33" r="2.6" fill="#4a2c3a" />
      <ellipse cx="32" cy="38" rx="3" ry="2" fill="#ffce4a" />
      <path d="M6 33 H17 M6 38 H17 M58 33 H47 M58 38 H47" stroke="#e7b9cb" strokeWidth="1.6" fill="none" />
      <path d="M44 16 l8 -5 0 10 z M52 16 l8 -5 0 10 z" fill="#ffce4a" stroke="#e3a93f" strokeWidth="1" />
      <circle cx="52" cy="16" r="2.4" fill="#ffdd77" />
    </svg>
  );
}
```

- [ ] **Step 2: Add the mascot to the app header brand**

In `app/(app)/layout.tsx`, add the import at the top:

```tsx
import KittyMark from '@/components/KittyMark';
```

Then change the brand `<Link>` to include the mascot before the "Routine" text:

```tsx
          <Link
            href="/"
            className="flex items-center gap-2 font-serif text-xl font-semibold tracking-tight text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            <KittyMark size={26} className="kitty-mark" />
            Routine
          </Link>
```

- [ ] **Step 3: Add the mascot to the login landing hero**

In `app/(auth)/login/page.tsx`, add the import:

```tsx
import KittyMark from '@/components/KittyMark';
```

In the `mode === 'landing'` branch, place the mascot above the `<h1>Routine</h1>`:

```tsx
        <div className="space-y-6 text-center">
          <div className="flex justify-center">
            <KittyMark size={56} className="kitty-mark" />
          </div>
          <h1 className="font-serif text-3xl font-semibold text-foreground">Routine</h1>
```

- [ ] **Step 4: Verify types + tests**

Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/KittyMark.tsx "app/(app)/layout.tsx" "app/(auth)/login/page.tsx"
git commit -m "feat(theme): kitty mascot in header + login (hidden in amber)"
```

---

## Task 5: Theme toggle in Settings

**Files:**
- Create: `components/ThemeToggle.tsx`
- Modify: `app/(app)/settings/page.tsx`

- [ ] **Step 1: Create the toggle component**

```tsx
// components/ThemeToggle.tsx
'use client';

import { useEffect, useState } from 'react';
import { resolveTheme, THEME_STORAGE_KEY, type Theme } from '@/lib/theme';

const OPTIONS: { value: Theme; label: string }[] = [
  { value: 'kitty', label: 'Kitty 🎀' },
  { value: 'amber', label: 'Amber' },
];

export default function ThemeToggle() {
  // Default to kitty for SSR; correct on mount from the live attribute/storage.
  const [theme, setTheme] = useState<Theme>('kitty');

  useEffect(() => {
    const fromAttr = document.documentElement.dataset.theme;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      /* storage unavailable — fall back to attribute/default */
    }
    setTheme(resolveTheme(fromAttr ?? stored));
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* not persisted this session — still applied live */
    }
  }

  return (
    <div role="group" aria-label="Theme" className="flex gap-2">
      {OPTIONS.map((opt) => {
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => choose(opt.value)}
            className={`transition-calm min-h-[44px] flex-1 rounded-xl border px-4 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active
                ? 'border-primary bg-primary text-primary-fg'
                : 'border-border bg-surface text-foreground hover:border-primary'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Render the toggle in Settings**

Open `app/(app)/settings/page.tsx`, add the import:

```tsx
import ThemeToggle from '@/components/ThemeToggle';
```

Add an "Appearance" card section to the page body (match the existing section/card markup in that file; place it after the notifications section):

```tsx
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="font-serif text-lg font-semibold text-foreground">Appearance</h2>
          <p className="mt-1 mb-3 text-sm text-muted-fg">Choose your theme.</p>
          <ThemeToggle />
        </section>
```

- [ ] **Step 3: Verify types + tests**

Run: `npx tsc --noEmit`
Expected: exit 0.
Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add components/ThemeToggle.tsx "app/(app)/settings/page.tsx"
git commit -m "feat(theme): theme toggle in settings"
```

---

## Task 6: Kitty app icons + manifest chrome

**Files:**
- Rewrite: `scripts/generate-icons.mjs`
- Modify: `app/manifest.ts`
- Regenerate: `public/icon-192.png`, `public/icon-512.png`

- [ ] **Step 1: Rewrite the icon generator**

```js
// Generates the app's PWA icons as PNGs with no image-library dependency.
// Kitty mark: white cat head + ears + plum eyes + gold bow on a pink (#ff8cc0)
// tile. Run: `node scripts/generate-icons.mjs`.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const PINK = [0xff, 0x8c, 0xc0];  // --primary
const WHITE = [0xff, 0xff, 0xff];
const PLUM = [0x4a, 0x2c, 0x3a];  // eyes
const GOLD = [0xff, 0xce, 0x4a];  // bow + nose

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// Point-in-triangle via consistent edge sign.
function inTri(px, py, a, b, c) {
  const d1 = (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]);
  const d2 = (px - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (py - c[1]);
  const d3 = (px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (py - a[1]);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function makePng(size) {
  const S = size;
  const stride = S * 4 + 1; // +1 filter byte per row
  const raw = Buffer.alloc(stride * S);

  const head = { cx: 0.5 * S, cy: 0.55 * S, rx: 0.3 * S, ry: 0.27 * S };
  const earL = [[0.2 * S, 0.34 * S], [0.28 * S, 0.08 * S], [0.44 * S, 0.28 * S]];
  const earR = [[0.8 * S, 0.34 * S], [0.72 * S, 0.08 * S], [0.56 * S, 0.28 * S]];
  const eyeL = { cx: 0.4 * S, cy: 0.55 * S, r: 0.035 * S };
  const eyeR = { cx: 0.6 * S, cy: 0.55 * S, r: 0.035 * S };
  const nose = { cx: 0.5 * S, cy: 0.63 * S, rx: 0.03 * S, ry: 0.02 * S };
  const bowL = [[0.72 * S, 0.1 * S], [0.62 * S, 0.04 * S], [0.62 * S, 0.16 * S]];
  const bowR = [[0.72 * S, 0.1 * S], [0.82 * S, 0.04 * S], [0.82 * S, 0.16 * S]];
  const knot = { cx: 0.72 * S, cy: 0.1 * S, r: 0.028 * S };

  for (let y = 0; y < S; y++) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < S; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let c = PINK;
      // ears (white) — drawn first so the head overlaps their base
      if (inTri(px, py, earL[0], earL[1], earL[2]) || inTri(px, py, earR[0], earR[1], earR[2])) c = WHITE;
      // head (white)
      const hx = (px - head.cx) / head.rx;
      const hy = (py - head.cy) / head.ry;
      if (Math.sqrt(hx * hx + hy * hy) <= 1) c = WHITE;
      // bow (gold) over the top-right
      if (inTri(px, py, bowL[0], bowL[1], bowL[2]) || inTri(px, py, bowR[0], bowR[1], bowR[2])) c = GOLD;
      if (Math.hypot(px - knot.cx, py - knot.cy) <= knot.r) c = GOLD;
      // eyes (plum)
      if (Math.hypot(px - eyeL.cx, py - eyeL.cy) <= eyeL.r || Math.hypot(px - eyeR.cx, py - eyeR.cy) <= eyeR.r) c = PLUM;
      // nose (gold)
      const nx = (px - nose.cx) / nose.rx;
      const ny = (py - nose.cy) / nose.ry;
      if (Math.sqrt(nx * nx + ny * ny) <= 1) c = GOLD;

      const o = y * stride + 1 + x * 4;
      raw[o] = c[0];
      raw[o + 1] = c[1];
      raw[o + 2] = c[2];
      raw[o + 3] = 255;
    }
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

for (const size of [192, 512]) {
  const out = new URL(`../public/icon-${size}.png`, import.meta.url);
  writeFileSync(out, makePng(size));
  console.log(`wrote public/icon-${size}.png`);
}
```

- [ ] **Step 2: Regenerate the icons**

Run: `node scripts/generate-icons.mjs`
Expected output:
```
wrote public/icon-192.png
wrote public/icon-512.png
```

- [ ] **Step 3: Update manifest chrome colors**

In `app/manifest.ts`, change:

```ts
    background_color: '#fff5f9',
    theme_color: '#ff8cc0',
```

- [ ] **Step 4: Verify the icons are valid PNGs**

Run: `node -e "const fs=require('fs');for(const s of [192,512]){const b=fs.readFileSync('public/icon-'+s+'.png');console.log(s, b.length>0 && b[1]===0x50 && b[2]===0x4e && b[3]===0x47 ? 'valid PNG' : 'BAD');}"`
Expected: `192 valid PNG` and `512 valid PNG`.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-icons.mjs app/manifest.ts public/icon-192.png public/icon-512.png
git commit -m "feat(theme): kitty app icons + pink manifest chrome"
```

---

## Task 7: Full runtime verification (both themes)

**Files:** none (verification only)

- [ ] **Step 1: Confirm the full static suite is green**

Run: `npx vitest run` → Expected: all tests PASS (39 existing + 5 from Task 1 = 44).
Run: `npx tsc --noEmit` → Expected: exit 0.
Run: `npx next lint` → Expected: no errors.

- [ ] **Step 2: Build succeeds**

Run: `npm run build`
Expected: build completes, `/manifest.webmanifest` and `/settings` compile without error.

- [ ] **Step 3: Manual browser check (record results)**

With `npm run dev` running at http://localhost:3000, log in and confirm:
1. Fresh load → **kitty** (pink bg, Baloo headings, cat mascot in header + login landing).
2. Settings → **Appearance** → tap **Amber** → recolors to warm amber, Lora headings, mascot disappears, no reload.
3. Reload → still **Amber**, no pink flash on load.
4. Tap **Kitty**, reload → **Kitty** persists.
5. DevTools → Application → Manifest: `theme_color` is `#ff8cc0`; icons preview shows the kitty face.

- [ ] **Step 4: Final commit (if any tracked changes remain)**

```bash
git add -A
git commit -m "chore(theme): verification pass for kitty/amber toggle"
```

---

## Self-Review (completed)

- **Spec coverage:** §2 mechanism → Tasks 2–3; §3 colors → Task 2; §4 fonts → Tasks 2–3; §5 persistence+toggle → Tasks 3 (inline script) + 5 (toggle); §6 mascot → Task 4; §7 icons/manifest → Task 6; §9 buttons-stay-body-font → respected (no button font changes); §11 verification → Task 7. No gaps.
- **Placeholders:** none — every code step has complete code; the one "match existing card markup" note (Task 5 Step 2) provides ready-to-paste JSX and only asks the engineer to place it consistently.
- **Type consistency:** `Theme`, `THEME_STORAGE_KEY`, `resolveTheme` are defined in Task 1 and used identically in Tasks 3 (mirrored in the inline string) and 5. Font CSS-var names (`--font-baloo/-nunito/-lora/-raleway`) defined in Task 3 match their consumers in Task 2's `--font-display/--font-body` remap.
