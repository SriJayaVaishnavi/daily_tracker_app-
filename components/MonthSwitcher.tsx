'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Shift a `YYYY-MM-01` string by `delta` months. */
function shiftMonth(periodMonth: string, delta: number): string {
  const d = new Date(periodMonth + 'T00:00:00Z');
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1));
  return next.toISOString().slice(0, 10);
}

function label(periodMonth: string): string {
  const d = new Date(periodMonth + 'T00:00:00Z');
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

export default function MonthSwitcher({ month }: { month: string }) {
  const router = useRouter();

  function go(delta: number) {
    router.push(`/goals?month=${shiftMonth(month, delta)}`);
  }

  const btn =
    'transition-calm flex h-11 w-11 items-center justify-center rounded-full border border-border text-muted-fg hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="flex items-center justify-between gap-2">
      <button type="button" onClick={() => go(-1)} aria-label="Previous month" className={btn}>
        <ChevronLeft aria-hidden="true" size={20} />
      </button>
      <span className="font-serif text-base font-semibold text-foreground" aria-live="polite">
        {label(month)}
      </span>
      <button type="button" onClick={() => go(1)} aria-label="Next month" className={btn}>
        <ChevronRight aria-hidden="true" size={20} />
      </button>
    </div>
  );
}
