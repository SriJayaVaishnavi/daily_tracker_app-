import { describe, it, expect } from 'vitest';
import { computeNextFireAt, buildReminderPayload, DEFAULT_BRIEF_TEXT } from '@/lib/reminders';

const TZ = 'Asia/Kolkata'; // UTC+5:30, no DST

describe('computeNextFireAt', () => {
  it('daily: fires later today when the time is still ahead', () => {
    // 05:30 IST = 00:00Z; 07:00 IST = 01:30Z, which is ahead.
    const after = new Date('2026-06-08T00:00:00Z');
    const next = computeNextFireAt('07:00', 'daily', null, TZ, after);
    expect(next?.toISOString()).toBe('2026-06-08T01:30:00.000Z');
  });

  it('daily: rolls to tomorrow when the time already passed today', () => {
    // 10:30 IST = 05:00Z; today 07:00 IST (01:30Z) is behind → tomorrow.
    const after = new Date('2026-06-08T05:00:00Z');
    const next = computeNextFireAt('07:00', 'daily', null, TZ, after);
    expect(next?.toISOString()).toBe('2026-06-09T01:30:00.000Z');
  });

  it('weekly_days: picks the next matching weekday', () => {
    // 2026-06-10 is a Wednesday (3). Target Friday (5) → 2026-06-12.
    const after = new Date('2026-06-10T00:00:00Z');
    const next = computeNextFireAt('09:00', 'weekly_days', [5], TZ, after);
    expect(next?.toISOString()).toBe('2026-06-12T03:30:00.000Z'); // 09:00 IST
  });

  it('weekly_days: wraps to next week when today matches but time passed', () => {
    // Wed 10:30 IST (05:00Z); target Wed (3) at 09:00 IST (03:30Z) already past → +7 days.
    const after = new Date('2026-06-10T05:00:00Z');
    const next = computeNextFireAt('09:00', 'weekly_days', [3], TZ, after);
    expect(next?.toISOString()).toBe('2026-06-17T03:30:00.000Z');
  });

  it('weekly_count: never fires (returns null)', () => {
    const after = new Date('2026-06-08T00:00:00Z');
    expect(computeNextFireAt('07:00', 'weekly_count', null, TZ, after)).toBeNull();
  });

  it('accepts HH:MM:SS as well as HH:MM', () => {
    const after = new Date('2026-06-08T00:00:00Z');
    const next = computeNextFireAt('07:00:00', 'daily', null, TZ, after);
    expect(next?.toISOString()).toBe('2026-06-08T01:30:00.000Z');
  });
});

describe('buildReminderPayload', () => {
  it('task: prompts for the task by title', () => {
    expect(buildReminderPayload('task', { title: 'Meditate', briefText: null })).toEqual({
      title: 'Meditate',
      body: 'Time for Meditate',
      url: '/',
      tag: 'reminder-task',
    });
  });

  it('daily_brief: uses the generated text when present', () => {
    const p = buildReminderPayload('daily_brief', {
      title: null,
      briefText: 'You showed up 5 days running.',
    });
    expect(p.body).toBe('You showed up 5 days running.');
    expect(p.title).toBe('Your daily brief');
  });

  it('daily_brief: falls back to the template line when no brief exists', () => {
    const p = buildReminderPayload('daily_brief', { title: null, briefText: null });
    expect(p.body).toBe(DEFAULT_BRIEF_TEXT);
  });

  it('mood_checkin: asks how you feel', () => {
    const p = buildReminderPayload('mood_checkin', { title: null, briefText: null });
    expect(p).toEqual({
      title: 'Mood check-in',
      body: 'How are you feeling today?',
      url: '/',
      tag: 'reminder-mood',
    });
  });
});
