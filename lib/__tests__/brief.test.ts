import { describe, it, expect } from 'vitest';
import { templateBrief, generateBrief, type BriefContext } from '@/lib/brief';

const BASE: BriefContext = { displayName: null, activeGoals: 0, doneYesterday: 0 };

describe('templateBrief', () => {
  it('is deterministic for the same context', () => {
    const ctx: BriefContext = { displayName: 'Sri', activeGoals: 3, doneYesterday: 2 };
    expect(templateBrief(ctx)).toBe(templateBrief(ctx));
  });

  it('returns a non-empty motivation line', () => {
    expect(templateBrief(BASE).length).toBeGreaterThan(10);
  });

  it('greets by display name when present', () => {
    expect(templateBrief({ ...BASE, displayName: 'Sri' })).toContain('Sri');
  });

  it('acknowledges yesterday when something was logged', () => {
    const line = templateBrief({ ...BASE, doneYesterday: 4 });
    expect(line).toMatch(/4/);
  });
});

describe('generateBrief', () => {
  it('falls back to the template when no Groq key is configured', async () => {
    const prev = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    try {
      const result = await generateBrief({ ...BASE, activeGoals: 2 });
      expect(result.source).toBe('template');
      expect(result.text).toBe(templateBrief({ ...BASE, activeGoals: 2 }));
    } finally {
      if (prev !== undefined) process.env.GROQ_API_KEY = prev;
    }
  });
});
