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
    // Stored preference is authoritative; the attribute is just the live
    // painting state set by the pre-paint script (absent on the kitty default).
    setTheme(resolveTheme(stored ?? fromAttr));
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    // Mirror the pre-paint script: only amber carries an explicit attribute;
    // kitty (default) leaves the attribute absent.
    if (next === 'amber') {
      document.documentElement.dataset.theme = 'amber';
    } else {
      delete document.documentElement.dataset.theme;
    }
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
