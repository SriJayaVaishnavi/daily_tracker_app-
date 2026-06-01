import Link from 'next/link';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import type { Goal } from '@/lib/database.types';
import GoalCard from '@/components/GoalCard';
import MonthSwitcher from '@/components/MonthSwitcher';

export const dynamic = 'force-dynamic';

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function normalizeMonth(raw: string | undefined): string {
  if (raw && /^\d{4}-\d{2}-01$/.test(raw)) return raw;
  return currentMonth();
}

export default async function GoalsPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const month = normalizeMonth(searchParams.month);
  const supabase = await createClient();
  const { data } = await supabase
    .from('goals')
    .select('*')
    .eq('period_month', month)
    .order('created_at', { ascending: true });
  const goals: Goal[] = data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Goals</h1>
        <Link
          href="/goals/new"
          className="transition-calm inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-fg hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Plus aria-hidden="true" size={18} /> New goal
        </Link>
      </div>

      <MonthSwitcher month={month} />

      {goals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center shadow-sm">
          <p className="font-medium text-foreground">No goals this month</p>
          <p className="mt-1 text-sm text-muted-fg">
            Create a goal to start tracking your routine.
          </p>
          <Link
            href="/goals/new"
            className="transition-calm mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border px-4 text-sm font-medium text-foreground hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus aria-hidden="true" size={16} /> New goal
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} />
          ))}
        </div>
      )}
    </div>
  );
}
