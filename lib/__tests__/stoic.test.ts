import { describe, it, expect } from 'vitest';
import { stoicIndexForDate, pickStoicForDate } from '@/lib/stoic';
import type { StoicQuote } from '@/lib/database.types';

describe('stoicIndexForDate', () => {
  it('is deterministic across instants within the same local day', () => {
    const a = stoicIndexForDate(new Date('2026-06-08T01:00:00Z'), 'Asia/Kolkata', 150);
    const b = stoicIndexForDate(new Date('2026-06-08T18:00:00Z'), 'Asia/Kolkata', 150);
    expect(a).toBe(b);
  });

  it('changes across days and stays in range', () => {
    const d1 = stoicIndexForDate(new Date('2026-06-08T12:00:00Z'), 'Asia/Kolkata', 10);
    const d2 = stoicIndexForDate(new Date('2026-06-09T12:00:00Z'), 'Asia/Kolkata', 10);
    expect(d1).not.toBe(d2);
    expect(d1).toBeGreaterThanOrEqual(0);
    expect(d1).toBeLessThan(10);
  });
});

describe('pickStoicForDate', () => {
  const quotes: StoicQuote[] = [
    { id: 1, body: 'a', author: 'Seneca', source_work: null, tags: null },
    { id: 2, body: 'b', author: 'Epictetus', source_work: null, tags: null },
  ];

  it('returns null for an empty list', () => {
    expect(pickStoicForDate([], new Date(), 'Asia/Kolkata')).toBeNull();
  });

  it('returns a quote from the list', () => {
    const q = pickStoicForDate(quotes, new Date('2026-06-08T12:00:00Z'), 'Asia/Kolkata');
    expect(quotes).toContain(q);
  });
});
