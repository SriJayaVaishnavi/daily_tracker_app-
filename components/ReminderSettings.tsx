'use client';

import { useEffect, useState } from 'react';
import {
  getReminderSettings,
  setDailyBriefReminder,
  setMoodReminder,
  type ReminderRow,
} from '@/lib/actions/reminders';

function Row({
  label,
  value,
  busy,
  onChange,
}: {
  label: string;
  value: ReminderRow;
  busy: boolean;
  onChange: (next: ReminderRow) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <label className="flex items-center gap-3 text-sm text-foreground">
        <input
          type="checkbox"
          checked={value.enabled}
          disabled={busy}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
          className="h-5 w-5 rounded border-border accent-primary"
        />
        {label}
      </label>
      <input
        type="time"
        value={value.time}
        disabled={busy || !value.enabled}
        onChange={(e) => onChange({ ...value, time: e.target.value })}
        className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-foreground disabled:opacity-50"
      />
    </div>
  );
}

export default function ReminderSettings() {
  const [brief, setBrief] = useState<ReminderRow>({ enabled: false, time: '07:00' });
  const [mood, setMood] = useState<ReminderRow>({ enabled: false, time: '07:00' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getReminderSettings()
      .then((s) => {
        setBrief(s.dailyBrief);
        setMood(s.mood);
      })
      .catch(() => {});
  }, []);

  async function saveBrief(next: ReminderRow) {
    setBrief(next);
    setBusy(true);
    try {
      await setDailyBriefReminder(next.enabled, next.time);
    } finally {
      setBusy(false);
    }
  }

  async function saveMood(next: ReminderRow) {
    setMood(next);
    setBusy(true);
    try {
      await setMoodReminder(next.enabled, next.time);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="divide-y divide-border">
      <Row label="Daily brief" value={brief} busy={busy} onChange={saveBrief} />
      <Row label="Mood check-in" value={mood} busy={busy} onChange={saveMood} />
    </div>
  );
}
