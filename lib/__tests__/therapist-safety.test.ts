import { describe, it, expect } from 'vitest';
import { classifyRisk, CRISIS_RESPONSE } from '@/lib/therapist/safety';

describe('classifyRisk', () => {
  it('flags explicit self-harm as crisis', () => {
    expect(classifyRisk('I want to kill myself').level).toBe('crisis');
    expect(classifyRisk('thinking about suicide tonight').level).toBe('crisis');
    expect(classifyRisk('i want to end my life').level).toBe('crisis');
    expect(classifyRisk('I keep thinking about cutting myself').level).toBe('crisis');
  });

  it('flags serious distress as concern', () => {
    expect(classifyRisk("I can't cope anymore, everything is hopeless").level).toBe('concern');
    expect(classifyRisk('I feel so numb and empty inside').level).toBe('concern');
  });

  it('returns none for ordinary venting', () => {
    expect(classifyRisk('work was stressful and I feel tired').level).toBe('none');
    expect(classifyRisk('I had an argument with a friend today').level).toBe('none');
  });

  it('is case-insensitive', () => {
    expect(classifyRisk('KILL MYSELF').level).toBe('crisis');
    expect(classifyRisk('HOPELESS').level).toBe('concern');
  });

  it('crisis response includes India helplines', () => {
    expect(CRISIS_RESPONSE).toContain('14416');
    expect(CRISIS_RESPONSE).toContain('1800-599-0019');
    expect(CRISIS_RESPONSE).toContain('112');
  });
});
