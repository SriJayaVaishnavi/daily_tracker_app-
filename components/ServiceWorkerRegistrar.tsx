'use client';

import { useEffect } from 'react';

/**
 * Registers the push/offline service worker once, after load. Renders nothing.
 * No-op where service workers are unavailable (e.g. unsupported browsers).
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failures are non-fatal — the app still works without push.
    });
  }, []);

  return null;
}
