import { describe, it, expect } from 'vitest';
import { buildContextBlock } from '@/lib/therapist/memory';

describe('buildContextBlock', () => {
  it('summarizes mood, goals, and prior session summary', () => {
    const block = buildContextBlock({
      moods: [{ log_date: '2026-06-08', mood: 2, energy: 2, note: 'rough day' }],
      goals: [{ title: 'Meditate daily', category: 'Health' }],
      priorSummaries: ['User has been anxious about work deadlines.'],
    });
    expect(block).toContain('rough day');
    expect(block).toContain('2/5');
    expect(block).toContain('Meditate daily');
    expect(block).toContain('Health');
    expect(block).toContain('anxious about work');
  });

  it('handles empty data gracefully', () => {
    const block = buildContextBlock({ moods: [], goals: [], priorSummaries: [] });
    expect(block).toContain('No recent mood data.');
    expect(block).toContain('No goals set.');
    expect(block).toContain('No prior sessions.');
  });
});
