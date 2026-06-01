'use client';

import { useState, useTransition } from 'react';
import { CheckCircle, AlertCircle, Plus, Loader2 } from 'lucide-react';
import type { ProjectItem as ProjectItemType } from '@/lib/routine';
import { logProgress } from '@/lib/actions/logs';
import Modal from '@/components/Modal';

export default function ProjectItem({ item }: { item: ProjectItemType }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const pct =
    item.target_value > 0
      ? Math.min(100, Math.round((item.current_value / item.target_value) * 100))
      : 0;
  const weeklyTarget = Math.round(item.weekly_target);
  const unit = item.unit ?? '';

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(value);
    if (!value.trim() || Number.isNaN(n) || n <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    setError(null);
    startTransition(async () => {
      await logProgress(item.goal_id, n, note.trim() || undefined);
      setValue('');
      setNote('');
      setOpen(false);
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-medium text-foreground">{item.title}</h3>
          <p className="mt-0.5 text-sm text-muted-fg">{item.progress}</p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
            item.on_track ? 'text-accent' : 'text-primary'
          }`}
        >
          {item.on_track ? (
            <>
              <CheckCircle aria-hidden="true" size={14} /> On track
            </>
          ) : (
            <>
              <AlertCircle aria-hidden="true" size={14} /> Behind
            </>
          )}
        </span>
      </div>

      <div className="mt-3" aria-hidden="true">
        <div className="h-2 w-full overflow-hidden rounded-full bg-background">
          <div
            className="transition-calm h-full rounded-full bg-primary"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-fg">
          ~{weeklyTarget} {unit}/wk to stay on pace
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="transition-calm inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium text-foreground hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus aria-hidden="true" size={16} /> Log progress
        </button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={`Log progress · ${item.title}`}>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="value-added" className="mb-1 block text-sm font-medium text-foreground">
              Amount {unit && <span className="text-muted-fg">({unit})</span>}
            </label>
            <input
              id="value-added"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-3 text-base text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="progress-note" className="mb-1 block text-sm font-medium text-foreground">
              Note <span className="text-muted-fg">(optional)</span>
            </label>
            <textarea
              id="progress-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="transition-calm min-h-[44px] rounded-xl border border-border px-4 text-sm font-medium text-foreground hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="transition-calm inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-60"
            >
              {pending && <Loader2 aria-hidden="true" size={16} className="animate-spin" />}
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
