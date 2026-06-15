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
