/**
 * Convert a base64url-encoded VAPID public key into the `Uint8Array` that
 * `PushManager.subscribe({ applicationServerKey })` expects.
 *
 * Pure and isomorphic (uses `atob`, available in modern browsers and Node 18+),
 * so it is unit-testable without a DOM.
 */
export function vapidKeyToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}
