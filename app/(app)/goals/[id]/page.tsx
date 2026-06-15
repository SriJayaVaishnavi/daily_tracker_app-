import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import type { Goal } from '@/lib/database.types';
import GoalComposer from '@/components/GoalComposer';

export const dynamic = 'force-dynamic';

export default async function EditGoalPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('goals')
    .select('*')
    .eq('id', params.id)
    .single();
  const goal = data as Goal | null;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/goals"
          className="transition-calm inline-flex items-center gap-1 text-sm font-medium text-muted-fg hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <ChevronLeft aria-hidden="true" size={16} /> Goals
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-foreground">Edit goal</h1>
      </div>
      {goal ? (
        <GoalComposer mode="edit" goal={goal} />
      ) : (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
          <p className="font-medium text-foreground">Goal not found</p>
          <p className="mt-1 text-sm text-muted-fg">
            It may have been deleted or you don&rsquo;t have access.
          </p>
          <Link
            href="/goals"
            className="transition-calm mt-4 inline-flex min-h-[44px] items-center rounded-xl border border-border px-4 text-sm font-medium text-foreground hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Back to goals
          </Link>
        </div>
      )}
    </div>
  );
}
