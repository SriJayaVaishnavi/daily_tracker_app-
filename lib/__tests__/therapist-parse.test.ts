import { describe, it, expect } from 'vitest';
import { parseModelOutput } from '@/lib/therapist/orchestrate';

describe('parseModelOutput', () => {
  it('parses clean JSON', () => {
    const r = parseModelOutput(
      '{"reply":"Hi there","action":{"type":"launch_tool","tool":"breathing"}}',
    );
    expect(r.reply).toBe('Hi there');
    expect(r.action).toEqual({ type: 'launch_tool', tool: 'breathing' });
  });

  it('extracts JSON embedded in code fences / prose', () => {
    const r = parseModelOutput('Sure!\n```json\n{"reply":"Let us breathe","action":null}\n```');
    expect(r.reply).toBe('Let us breathe');
    expect(r.action).toBeNull();
  });

  it('parses roleplay_start with persona', () => {
    const r = parseModelOutput('{"reply":"Ok, I am your manager.","action":{"type":"roleplay_start","persona":"manager"}}');
    expect(r.action).toEqual({ type: 'roleplay_start', persona: 'manager' });
  });

  it('falls back to raw text when not JSON', () => {
    const r = parseModelOutput('I hear you, that sounds really hard.');
    expect(r.reply).toBe('I hear you, that sounds really hard.');
    expect(r.action).toBeNull();
  });

  it('ignores unknown action types', () => {
    const r = parseModelOutput('{"reply":"ok","action":{"type":"nonsense"}}');
    expect(r.reply).toBe('ok');
    expect(r.action).toBeNull();
  });

  it('ignores launch_tool with invalid tool', () => {
    const r = parseModelOutput('{"reply":"ok","action":{"type":"launch_tool","tool":"hypnosis"}}');
    expect(r.action).toBeNull();
  });
});
