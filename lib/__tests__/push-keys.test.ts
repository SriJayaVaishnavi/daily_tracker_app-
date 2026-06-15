import { describe, it, expect } from 'vitest';
import { vapidKeyToUint8Array } from '@/lib/push-keys';

// A real VAPID public key is a base64url-encoded, uncompressed P-256 point:
// 65 bytes, first byte 0x04.
const VAPID_PUBLIC =
  'BH12F-hWGy_OuQTSX6H65TKNJHWBVNflocmmkrIVnGqo7wsaM4RycOZNJ5O1fcFHWCRCzv_rmwXVqyd5j0BUcO8';

describe('vapidKeyToUint8Array', () => {
  it('decodes a VAPID public key to 65 bytes starting with 0x04', () => {
    const bytes = vapidKeyToUint8Array(VAPID_PUBLIC);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(0x04);
  });

  it('handles base64url chars (- and _) without throwing', () => {
    expect(() => vapidKeyToUint8Array(VAPID_PUBLIC)).not.toThrow();
  });

  it('round-trips a known short value with required padding', () => {
    // 'AAAA' base64url → 3 zero bytes
    expect(Array.from(vapidKeyToUint8Array('AAAA'))).toEqual([0, 0, 0]);
  });
});
