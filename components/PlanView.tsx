import Link from 'next/link';
import { Pencil } from 'lucide-react';
import type { Goal } from '@/lib/database.types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function recurrenceLabel(g: Goal): string {
  if (g.recurrence_type === 'daily') return 'Daily';
  if (g.recurrence_type === 'weekly_days')
    return (g.weekdays ?? []).map((d) => WEEKDAYS[d]).join(', ') || 'Weekly';
  if (g.recurrence_type === 'weekly_count') return `${g.target_count ?? '?'}×/week`;
  return '';
}

export default function PlanView({ goals }: { goals: Goal[] }) {
  if (goals.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted-fg shadow-sm">
        No scheduled habits yet. Create goals and pick a schedule to see your plan here.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {goals.map((g) => (
        <li
          key={g.id}
          className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <span className="tabular-nums text-sm font-semibold text-foreground">
              {g.scheduled_time ? g.scheduled_time.slice(0, 5) : '—'}
            </span>
            <div>
              <p className="text-base text-foreground">{g.title}</p>
              <p className="text-xs text-muted-fg">{recurrenceLabel(g)}</p>
            </div>
          </div>
          <Link
            href={`/goals/${g.id}`}
            aria-label={`Edit ${g.title}`}
            className="transition-calm flex h-10 w-10 items-center justify-center rounded-full text-muted-fg hover:bg-background hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Pencil aria-hidden="true" size={16} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
