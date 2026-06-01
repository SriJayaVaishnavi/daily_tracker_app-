'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { Check, Minus, MoreHorizontal, Circle, Loader2 } from 'lucide-react';
import type { HabitItem as HabitItemType } from '@/lib/routine';
import { logHabit, clearHabit } from '@/lib/actions/logs';

export default function HabitItem({ item }: { item: HabitItemType }) {
  const [pending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const status = item.status;
  const done = status === 'done';
  const skipped = status === 'skipped';
  const partial = status === 'partial';

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  function toggleDone() {
    startTransition(async () => {
      if (done) await clearHabit(item.task_id);
      else await logHabit(item.task_id, 'done');
    });
  }

  function setStatus(s: 'skipped' | 'partial') {
    setMenuOpen(false);
    startTransition(async () => {
      await logHabit(item.task_id, s);
    });
  }

  const checkLabel = done ? `Mark "${item.title}" not done` : `Mark "${item.title}" done`;

  const target =
    item.target_value != null
      ? `${item.target_value}${item.unit ? ` ${item.unit}` : ''}`
      : item.unit ?? null;

  return (
    <div className="transition-calm flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-sm">
      <button
        type="button"
        onClick={toggleDone}
        disabled={pending}
        aria-pressed={done}
        aria-label={checkLabel}
        className={`transition-calm flex h-11 w-11 shrink-0 items-center justify-center rounded-full border focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-60 ${
          done
            ? 'border-accent bg-accent text-accent-fg'
            : skipped
              ? 'border-border bg-background text-muted-fg'
              : partial
                ? 'border-primary text-primary'
                : 'border-border text-muted-fg hover:border-primary hover:text-primary'
        }`}
      >
        {pending ? (
          <Loader2 aria-hidden="true" size={20} className="animate-spin" />
        ) : done ? (
          <Check aria-hidden="true" size={20} />
        ) : skipped ? (
          <Minus aria-hidden="true" size={20} />
        ) : partial ? (
          <Circle aria-hidden="true" size={20} className="fill-current" />
        ) : (
          <Circle aria-hidden="true" size={20} />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-base font-medium ${
            done ? 'text-muted-fg line-through' : skipped ? 'text-muted-fg' : 'text-foreground'
          }`}
        >
          {item.title}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-fg">
          {target && <span>{target}</span>}
          {item.weekly_progress && (
            <span className="rounded-full border border-border px-2 py-0.5">
              {item.weekly_progress} this week
            </span>
          )}
          {skipped && <span className="font-medium">Skipped</span>}
          {partial && <span className="font-medium text-primary">Partial</span>}
        </div>
      </div>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          disabled={pending}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`More options for "${item.title}"`}
          className="transition-calm flex h-11 w-11 items-center justify-center rounded-full text-muted-fg hover:bg-background hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          <MoreHorizontal aria-hidden="true" size={20} />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-12 z-20 w-40 overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => setStatus('skipped')}
              className="transition-calm flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-foreground hover:bg-background focus:outline-none focus-visible:bg-background"
            >
              <Minus aria-hidden="true" size={16} /> Skip
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => setStatus('partial')}
              className="transition-calm flex w-full items-center gap-2 border-t border-border px-4 py-3 text-left text-sm text-foreground hover:bg-background focus:outline-none focus-visible:bg-background"
            >
              <Circle aria-hidden="true" size={16} /> Partial
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
