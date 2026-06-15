# Kitty Theme + Theme Toggle — Design

**Date:** 2026-06-04
**Status:** Approved (design), pending spec review
**Parent spec:** [`docs/PRD.md`](../../PRD.md) — adds a selectable visual theme.
**Visual reference:** [`kitty-theme-mockup.html`](./kitty-theme-mockup.html) — the target kitty look (palette, fonts, mascot).

Today the app ships a single **warm-amber "wellness"** theme with an automatic
light/dark switch driven by `prefers-color-scheme`. This feature adds a second
theme — a **baby-pink "kitty"** look — and a user-facing **toggle** to switch
between the two. Kitty becomes the default.

---

## 1. Goals

- **Two light themes:** `kitty` (default) and `amber` (the existing look).
- **User toggle** in Settings that switches the theme live and **persists** the
  choice across reloads and sessions.
- **No flash of the wrong theme** on first paint (no FOUC).
- **No automatic dark mode** — the previous `prefers-color-scheme: dark` block is
  removed; both themes are light-only.
- **No logic changes** — this is a pure presentation reskin + a small client
  toggle. Existing tests, `tsc`, and lint stay green.

Non-goals (YAGNI): dark variants, a system/"auto" option, per-route theming,
animated theme transitions, more than two themes.

---

## 2. Mechanism

A `data-theme` attribute on the `<html>` element selects the active theme. Because
**kitty is the default**, the kitty palette/fonts live in `:root` (so a no-JS first
paint renders kitty correctly), and `[data-theme="amber"]` overrides with the amber
set.

```
<html>                       → kitty (default, :root)
<html data-theme="kitty">    → kitty (explicit)
<html data-theme="amber">    → amber (override block)
```

The choice is stored in `localStorage["routine-theme"]` (`"kitty"` | `"amber"`).
An inline script in `<head>` applies it before first paint to avoid FOUC. The
Settings toggle updates both `localStorage` and the live attribute.

**Decision — hand-rolled, no `next-themes` dependency.** The project deliberately
hand-rolls its platform layer (e.g. the service worker / PWA rather than
`next-pwa`). A two-theme toggle needs only a ~15-line inline script plus a small
client component, so we keep it dependency-free and transparent. `next-themes`
was considered and rejected as unnecessary weight for two light themes.

---

## 3. Colors — `app/globals.css`

Move the existing amber values into a `[data-theme="amber"]` block, put the kitty
palette in `:root`, and delete the `@media (prefers-color-scheme: dark)` block.

| Token | `:root` (kitty) | `[data-theme="amber"]` (current values) |
|---|---|---|
| `--background` | `#fff5f9` | `#faf7f2` |
| `--surface` | `#ffffff` | `#ffffff` |
| `--foreground` | `#4a2c3a` | `#1a1714` |
| `--muted-fg` | `#a9788b` | `#6b6258` |
| `--border` | `#ffe0ec` | `#ece4d8` |
| `--primary` | `#ff8cc0` | `#b45309` |
| `--primary-fg` | `#5b2138` | `#ffffff` |
| `--accent` | `#59c7bd` | `#047857` |
| `--accent-fg` | `#0b3b37` | `#ffffff` |
| `--destructive` | `#b91c1c` | `#b91c1c` |
| `--ring` | `#ec6aaa` | `#b45309` |

Notes:
- `--primary-fg` is plum `#5b2138` on pink (the "pastel + plum text" button choice).
- `--ring` is the richer pink `#ec6aaa` so focus rings stay visible against the
  pastel primary (accessibility).

---

## 4. Fonts — `app/layout.tsx`, `globals.css`, `tailwind.config.ts`

Load **all four** Google fonts via `next/font` and expose their CSS variables on
`<body>`:

| Theme | Display (headings, brand) | Body |
|---|---|---|
| kitty | **Baloo 2** (`--font-baloo`) | **Nunito** (`--font-nunito`) |
| amber | **Lora** (`--font-lora`) | **Raleway** (`--font-raleway`) |

Introduce two **semantic** font vars that each theme remaps:

```css
:root                  { --font-display: var(--font-baloo);  --font-body: var(--font-nunito);  }
[data-theme="amber"]   { --font-display: var(--font-lora);   --font-body: var(--font-raleway); }
```

`globals.css` `body`/`h1–h4` and `tailwind.config.ts` `serif`/`sans` are repointed
from `--font-lora`/`--font-raleway` to `--font-display`/`--font-body`. The Tailwind
key names `serif`/`sans` are kept (used across components); only their values
change. Headings and body re-flow automatically when the attribute flips.

Loading four families adds some font weight to first load; acceptable for a
single-user PWA, and `display: 'swap'` keeps text visible during load.

---

## 5. Persistence + toggle

- **Inline pre-paint script** (in `app/layout.tsx` `<head>`, dangerouslySetInnerHTML):
  reads `localStorage["routine-theme"]`; if it is `"amber"`, sets
  `document.documentElement.dataset.theme = "amber"`. Any other/absent value leaves
  the default (kitty). Wrapped in `try/catch` so a storage exception can never block
  render.
- **`components/ThemeToggle.tsx`** (client): shows the two options (Kitty / Amber),
  reflects the current choice (read on mount from the attribute/localStorage),
  and on change writes `localStorage` and sets `document.documentElement.dataset.theme`
  immediately (no reload).
- **Placement:** rendered in `app/(app)/settings/page.tsx` as a "Appearance" /
  "Theme" section.

---

## 6. Mascot — `components/KittyMark.tsx`

Extract the original cat SVG (white head, ears, eyes, gold bow — **not** Sanrio's
Hello Kitty) from the mockup into a presentational component. Render it:
- in the app header brand (`app/(app)/layout.tsx`), beside "Routine";
- in the `/login` hero.

It is **shown only under the kitty theme** via CSS, so amber keeps its clean
text-only brand:

```css
[data-theme="amber"] .kitty-mark { display: none; }
```

Both elements are always in the DOM; CSS handles visibility — no client JS, no
layout shift on toggle beyond the mascot appearing/disappearing.

---

## 7. App icons + PWA chrome (fixed at install — flagged)

PWA install icons, the manifest `theme_color`/`background_color`, and the
`theme-color` meta are **global** and fixed when the app is installed; they cannot
follow a per-user in-app toggle. Since kitty is the default, set all to kitty:

- `scripts/generate-icons.mjs`: rewrite to draw a **kitty face** (white head + ears
  + eyes + gold bow on pink `#ff8cc0`) using the existing pure-Node PNG encoder (no
  `sharp`/`canvas` dependency). Regenerate `public/icon-192.png`, `public/icon-512.png`.
  Icon fidelity is intentionally simple-cute (math-drawn shapes), not the detailed
  header SVG.
- `app/manifest.ts`: `background_color` → `#fff5f9`, `theme_color` → `#ff8cc0`.

**Known limitation:** a user who switches to amber in-app still has the kitty
install icon and pink OS chrome. Accepted.

---

## 8. Module boundaries

- **`app/globals.css`** *(no logic)* — `:root` (kitty) + `[data-theme="amber"]`
  token blocks; semantic `--font-display`/`--font-body` remap; the `.kitty-mark`
  visibility rule.
- **`components/KittyMark.tsx`** *(pure presentational)* — the SVG mascot. *Used by:*
  header, login hero. No props beyond optional `size`/`className`.
- **`components/ThemeToggle.tsx`** *(client)* — reads/writes the theme; the only
  stateful piece. *Used by:* settings page.
- **Inline head script** *(layout)* — one job: apply the stored theme pre-paint.
- **`scripts/generate-icons.mjs`** *(build-time, standalone)* — emits the two PNGs.

The default-theme contract (`:root` = kitty, `localStorage` key `routine-theme`,
attribute values `kitty`/`amber`) is the single shared interface between the inline
script, the toggle, and the CSS.

---

## 9. Buttons stay in body font (scope call)

The mockup shows buttons in Baloo 2, but there is **no shared `Button` component** —
button styling is inline `className` strings spread across many files. Restyling
every button to the display font is out of scope; buttons use `--font-body` in both
themes. The kitty character still reads clearly through palette, mascot, and
headings. Revisit if a shared Button component is introduced later.

---

## 10. Error handling & edge cases

- **`localStorage` unavailable / throws** (private mode, disabled): inline script and
  toggle are wrapped in `try/catch`; the app falls back to the default kitty theme
  and the toggle is still operable for the session (just not persisted).
- **Unknown stored value:** treated as default (kitty).
- **SSR/first paint:** server renders `:root` (kitty); the inline script may switch
  to amber before paint. No mismatch warning because the attribute is set
  imperatively, not rendered by React.
- **Reduced motion:** unaffected; there is no theme-transition animation.

---

## 11. Testing / verification

- **Unit:** no new pure logic to unit-test (the toggle is DOM/storage I/O). Existing
  39 tests must still pass unchanged.
- **Static:** `tsc --noEmit` and `next lint` clean.
- **Manual / runtime:**
  1. Fresh load (no stored value) → renders **kitty** (pink, Baloo headings, mascot
     in header + login).
  2. Settings → switch to **Amber** → UI recolors to warm amber, Lora headings, mascot
     disappears — immediately, no reload.
  3. Reload → still **Amber** (persisted), no flash of pink on load.
  4. Switch back to **Kitty**, reload → **Kitty** persists.
  5. Icons: `public/icon-192.png` / `icon-512.png` show the kitty face; manifest
     `theme_color` is pink.

---

## 12. Definition of Done

- Kitty is the default theme; amber is selectable; both are light-only.
- Toggle in Settings switches live and persists across reload/session.
- No FOUC on first paint for either stored choice.
- Mascot appears only under kitty; amber brand is text-only.
- App icons + manifest chrome are kitty.
- The `prefers-color-scheme: dark` block is removed.
- Existing 39 tests pass; `tsc` + lint clean.

---

## 13. Required from the user

- None for config. (No Supabase or env changes.)
- Manual visual confirmation of both themes (step 11) since theming is observed in
  the browser.
