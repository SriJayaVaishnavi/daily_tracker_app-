'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Pencil, Archive, Trash2, RotateCcw, Loader2, Repeat, Target } from 'lucide-react';
import type { Goal } from '@/lib/database.types';
import { setGoalStatus, deleteGoal } from '@/lib/actions/goals';
import Modal from '@/components/Modal';

export default function GoalCard({ goal }: { goal: Goal }) {
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const archived = goal.status === 'archived';
  const isProject = goal.goal_type === 'project';
  const pct =
    isProject && goal.target_value && goal.target_value > 0
      ? Math.min(100, Math.round(((goal.current_value ?? 0) / goal.target_value) * 100))
      : 0;

  function archive() {
    startTransition(async () => {
      await setGoalStatus(goal.id, 'archived');
    });
  }

  function activate() {
    startTransition(async () => {
      await setGoalStatus(goal.id, 'active');
    });
  }

  function remove() {
    startTransition(async () => {
      try {
        await deleteGoal(goal.id);
      } catch (err) {
        if (err && typeof err === 'object' && 'digest' in err) throw err;
      }
    });
  }

  const actionBtn =
    'transition-calm inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

  return (
    <div
      className={`rounded-2xl border border-border bg-surface p-4 shadow-sm transition-calm ${
        archived ? 'opacity-70' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-medium text-foreground">{goal.title}</h3>
            {archived && (
              <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-fg">
                Archived
              </span>
            )}
          </div>
          {goal.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-fg">{goal.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-xs font-medium text-muted-fg">
              {isProject ? (
                <Target aria-hidden="true" size={12} />
              ) : (
                <Repeat aria-hidden="true" size={12} />
              )}
              {isProject ? 'Project' : 'Habit'}
            </span>
            {goal.category && (
              <span className="rounded-full bg-background px-2.5 py-1 text-xs font-medium text-muted-fg">
                {goal.category}
              </span>
            )}
          </div>
        </div>
      </div>

      {isProject && goal.target_value != null && (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-background" aria-hidden="true">
            <div
              className="transition-calm h-full rounded-full bg-primary"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-fg">
            {goal.current_value ?? 0} / {goal.target_value} {goal.unit ?? ''}
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/goals/${goal.id}`} className={`${actionBtn} text-foreground hover:border-primary hover:text-primary`}>
          <Pencil aria-hidden="true" size={16} /> Edit
        </Link>
        {archived ? (
          <button type="button" onClick={activate} disabled={pending} className={`${actionBtn} text-foreground hover:border-accent hover:text-accent`}>
            {pending ? (
              <Loader2 aria-hidden="true" size={16} className="animate-spin" />
            ) : (
              <RotateCcw aria-hidden="true" size={16} />
            )}
            Activate
          </button>
        ) : (
          <button type="button" onClick={archive} disabled={pending} className={`${actionBtn} text-foreground hover:border-primary hover:text-primary`}>
            {pending ? (
              <Loader2 aria-hidden="true" size={16} className="animate-spin" />
            ) : (
              <Archive aria-hidden="true" size={16} />
            )}
            Archive
          </button>
        )}
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={pending}
          className={`${actionBtn} text-destructive hover:border-destructive`}
        >
          <Trash2 aria-hidden="true" size={16} /> Delete
        </button>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Delete goal?">
        <p className="text-sm text-muted-fg">
          This permanently deletes <span className="font-medium text-foreground">{goal.title}</span>{' '}
          and its history. This cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            className="transition-calm min-h-[44px] rounded-xl border border-border px-4 text-sm font-medium text-foreground hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="transition-calm inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-destructive px-4 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-60"
          >
            {pending && <Loader2 aria-hidden="true" size={16} className="animate-spin" />}
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}
