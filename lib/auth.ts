const MIN_PASSWORD_LENGTH = 8;

/** Minimal shape we read off a Supabase user for the password gate. */
interface UserLike {
  user_metadata?: { password_set?: boolean } | null;
}

/**
 * True when the user has not yet created a password (so the app should route
 * them through `/set-password`). Driven by the `password_set` flag we write to
 * user_metadata when a password is first set.
 */
export function needsPasswordSetup(user: UserLike): boolean {
  return user.user_metadata?.password_set !== true;
}

/** Minimal shape we read off a profile row for the onboarding gate. */
interface ProfileLike {
  notif_prefs?: Record<string, unknown> | null;
}

/**
 * True once the user has finished the onboarding flow. Driven by the
 * `onboarded` flag merged into `profiles.notif_prefs` by `completeOnboarding`.
 */
export function isOnboarded(profile: ProfileLike | null | undefined): boolean {
  return profile?.notif_prefs?.onboarded === true;
}

/**
 * Validate a new password and its confirmation. Returns an error message, or
 * `null` when the password is acceptable.
 */
export function validatePassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirm) {
    return 'Passwords do not match.';
  }
  return null;
}
