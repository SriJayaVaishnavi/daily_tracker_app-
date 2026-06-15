'use client';

import { useEffect, useState } from 'react';
import { getProfileSettings, setQuietHours } from '@/lib/actions/profile';

const DEFAULT_START = '22:00';
const DEFAULT_END = '07:00';

export default function QuietHoursSettings() {
  const [enabled, setEnabled] = useState(false);
  const [start, setStart] = useState(DEFAULT_START);
  const [end, setEnd] = useState(DEFAULT_END);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getProfileSettings()
      .then((s) => {
        if (s.quietStart && s.quietEnd) {
          setEnabled(true);
          setStart(s.quietStart);
          setEnd(s.quietEnd);
        }
      })
      .catch(() => {});
  }, []);

  async function save(nextEnabled: boolean, nextStart: string, nextEnd: string) {
    setBusy(true);
    try {
      await setQuietHours(nextEnabled ? nextStart : null, nextEnabled ? nextEnd : null);
    } finally {
      setBusy(false);
    }
  }

  function toggle(on: boolean) {
    setEnabled(on);
    void save(on, start, end);
  }

  function changeStart(v: string) {
    setStart(v);
    void save(enabled, v, end);
  }

  function changeEnd(v: string) {
    setEnd(v);
    void save(enabled, start, v);
  }

  return (
    <div className="mt-4 border-t border-border pt-3">
      <label className="flex items-center gap-3 text-sm text-foreground">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(e) => toggle(e.target.checked)}
          className="h-5 w-5 rounded border-border accent-primary"
        />
        Quiet hours — pause reminders overnight
      </label>
      {enabled && (
        <div className="mt-2 flex items-center gap-2 text-sm text-muted-fg">
          <span>From</span>
          <input
            type="time"
            value={start}
            disabled={busy}
            onChange={(e) => changeStart(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-foreground"
          />
          <span>to</span>
          <input
            type="time"
            value={end}
            disabled={busy}
            onChange={(e) => changeEnd(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-foreground"
          />
        </div>
      )}
    </div>
  );
}
