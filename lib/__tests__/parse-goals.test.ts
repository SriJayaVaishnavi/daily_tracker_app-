import { describe, it, expect } from 'vitest';
import { splitGoals } from '@/lib/parse-goal-fallback';
import { parseGoals } from '@/lib/llm';

describe('splitGoals', () => {
  it('splits a comma list and strips trailing filler', () => {
    expect(splitGoals('aws course, take pills, spearmint tea all that')).toEqual([
      'aws course',
      'take pills',
      'spearmint tea',
    ]);
  });
  it('splits on the word "and"', () => {
    expect(splitGoals('meditate and journal')).toEqual(['meditate', 'journal']);
  });
  it('splits on newlines', () => {
    expect(splitGoals('run 5km\nread 20 pages')).toEqual(['run 5km', 'read 20 pages']);
  });
  it('keeps a single goal intact', () => {
    expect(splitGoals('learn the aws course')).toEqual(['learn the aws course']);
  });
  it('drops pure-filler segments', () => {
    expect(splitGoals('yoga, all that')).toEqual(['yoga']);
  });
  it('returns [] for empty input', () => {
    expect(splitGoals('   ')).toEqual([]);
  });
});

describe('parseGoals (no key → fallback)', () => {
  it('returns one parsed goal per segment', async () => {
    const prev = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    try {
      const { goals, source } = await parseGoals('take pills, run 5km');
      expect(source).toBe('fallback');
      expect(goals).toHaveLength(2);
      expect(goals[0].title.toLowerCase()).toContain('pills');
      expect(goals[1].title.toLowerCase()).toContain('run');
    } finally {
      if (prev !== undefined) process.env.GROQ_API_KEY = prev;
    }
  });
  it('falls back to the whole text when nothing splits', async () => {
    const prev = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    try {
      const { goals } = await parseGoals('meditate every morning');
      expect(goals).toHaveLength(1);
    } finally {
      if (prev !== undefined) process.env.GROQ_API_KEY = prev;
    }
  });
});
