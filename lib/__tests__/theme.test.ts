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
