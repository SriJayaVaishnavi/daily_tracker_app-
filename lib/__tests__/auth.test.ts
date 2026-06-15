import { describe, it, expect } from 'vitest';
import { needsPasswordSetup, validatePassword } from '@/lib/auth';

describe('needsPasswordSetup', () => {
  it('is true when the password_set flag is absent', () => {
    expect(needsPasswordSetup({ user_metadata: {} })).toBe(true);
  });

  it('is true when the password_set flag is false', () => {
    expect(needsPasswordSetup({ user_metadata: { password_set: false } })).toBe(true);
  });

  it('is false when the password_set flag is true', () => {
    expect(needsPasswordSetup({ user_metadata: { password_set: true } })).toBe(false);
  });

  it('is true for a user with no metadata', () => {
    expect(needsPasswordSetup({})).toBe(true);
  });
});

describe('validatePassword', () => {
  it('returns null for a valid matching password', () => {
    expect(validatePassword('hunter2!', 'hunter2!')).toBeNull();
  });

  it('rejects passwords shorter than 8 characters', () => {
    expect(validatePassword('short', 'short')).toMatch(/8/);
  });

  it('rejects a mismatched confirmation', () => {
    expect(validatePassword('hunter2!', 'hunter3!')).toMatch(/match/i);
  });
});
