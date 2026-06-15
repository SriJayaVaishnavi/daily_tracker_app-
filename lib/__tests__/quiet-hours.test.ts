import { describe, it, expect } from 'vitest';
import { isWithinQuietHours } from '@/lib/quiet-hours';

describe('isWithinQuietHours', () => {
  it('same-day window: inside is true, outside is false', () => {
    expect(isWithinQuietHours('13:30', '13:00', '14:00')).toBe(true);
    expect(isWithinQuietHours('12:00', '13:00', '14:00')).toBe(false);
  });

  it('same-day window: start is inclusive, end is exclusive', () => {
    expect(isWithinQuietHours('13:00', '13:00', '14:00')).toBe(true);
    expect(isWithinQuietHours('14:00', '13:00', '14:00')).toBe(false);
  });

  it('overnight window wraps midnight', () => {
    expect(isWithinQuietHours('23:00', '22:00', '07:00')).toBe(true);
    expect(isWithinQuietHours('06:00', '22:00', '07:00')).toBe(true);
    expect(isWithinQuietHours('08:00', '22:00', '07:00')).toBe(false);
  });

  it('accepts HH:MM:SS for the now value', () => {
    expect(isWithinQuietHours('23:30:00', '22:00', '07:00')).toBe(true);
  });

  it('returns false when either bound is null (quiet hours off)', () => {
    expect(isWithinQuietHours('05:00', null, '07:00')).toBe(false);
    expect(isWithinQuietHours('05:00', '22:00', null)).toBe(false);
    expect(isWithinQuietHours('05:00', null, null)).toBe(false);
  });

  it('returns false for a zero-length window', () => {
    expect(isWithinQuietHours('07:00', '07:00', '07:00')).toBe(false);
  });
});
