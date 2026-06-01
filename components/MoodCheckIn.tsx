'use client';

import { useState, useTransition } from 'react';
import { Frown, Meh, Smile, Check, Loader2 } from 'lucide-react';
import type { MoodLog } from '@/lib/database.types';
import { logMood } from '@/lib/actions/logs';

const MOODS = [
  { value: 1, label: 'Very low', Icon: Frown },
  { value: 2, label: 'Low', Icon: Frown },
  { value: 3, label: 'Okay', Icon: Meh },
  { value: 4, label: 'Good', Icon: Smile },
  { value: 5, label: 'Great', Icon: Smile },
] as const;

export default function MoodCheckIn({ initial }: { initial: MoodLog | null }) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mood, setMood] = useState<number | null>(initial?.mood ?? null);
  const [energy, setEnergy] = useState<number | null>(initial?.energy ?? null);
  const [gratitude, setGratitude] = useState(initial?.gratitude ?? '');
  const [note, setNote] = useState(initial?.note ?? '');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mood == null) {
      setError('Please choose how you feel.');
      return;
    }
    setSaved(false);
    startTransition(async () => {
      await logMood({
        mood,
        energy: energy ?? undefined,
        gratitude: gratitude.trim() || undefined,
        note: note.trim() || undefined,
      });
      setSaved(true);
    });
  }

  const fieldClass =
    'w-full rounded-xl border border-border bg-background px-3 py-3 text-base text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const labelClass = 'mb-2 block text-sm font-medium text-foreground';

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset>
        <legend className={labelClass}>How do you feel?</legend>
        <div role="radiogroup" aria-label="Mood" className="flex justify-between gap-1">
          {MOODS.map(({ value, label, Icon }) => {
            const on = mood === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`${value} – ${label}`}
                onClick={() => {
                  setMood(value);
                  setSaved(false);
                }}
                className={`transition-calm flex min-h-[64px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl border py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  on
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-fg hover:border-primary hover:text-primary'
                }`}
              >
                <Icon aria-hidden="true" size={24} />
                <span className="text-xs font-medium">{value}</span>
              </button>
            );
          })}
        </div>
        {mood != null && (
          <p className="mt-2 text-center text-sm text-muted-fg">
            {MOODS.find((m) => m.value === mood)?.label}
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend className={labelClass}>
          Energy <span className="font-normal text-muted-fg">(optional)</span>
        </legend>
        <div role="radiogroup" aria-label="Energy" className="flex justify-between gap-2">
          {[1, 2, 3, 4, 5].map((v) => {
            const on = energy === v;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`Energy ${v} of 5`}
                onClick={() => setEnergy(on ? null : v)}
                className={`transition-calm h-12 flex-1 rounded-xl border text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  on
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border text-muted-fg hover:border-accent hover:text-accent'
                }`}
              >
                {v}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="gratitude" className={labelClass}>
          Gratitude <span className="font-normal text-muted-fg">(optional)</span>
        </label>
        <textarea
          id="gratitude"
          rows={2}
          value={gratitude}
          onChange={(e) => setGratitude(e.target.value)}
          className={fieldClass}
          placeholder="One thing you&rsquo;re grateful for…"
        />
      </div>

      <div>
        <label htmlFor="mood-note" className={labelClass}>
          Note <span className="font-normal text-muted-fg">(optional)</span>
        </label>
        <textarea
          id="mood-note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={fieldClass}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {saved && !pending && (
        <p role="status" className="flex items-center gap-2 text-sm font-medium text-accent">
          <Check aria-hidden="true" size={16} /> Saved
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="transition-calm inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-primary-fg hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
      >
        {pending && <Loader2 aria-hidden="true" size={18} className="animate-spin" />}
        {pending ? 'Saving…' : initial ? 'Update check-in' : 'Save check-in'}
      </button>
    </form>
  );
}
