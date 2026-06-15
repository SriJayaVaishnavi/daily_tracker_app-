import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import GoalComposer from '@/components/GoalComposer';

export default function NewGoalPage() {
  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/goals"
          className="transition-calm inline-flex items-center gap-1 text-sm font-medium text-muted-fg hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <ChevronLeft aria-hidden="true" size={16} /> Goals
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-foreground">New goal</h1>
      </div>
      <GoalComposer mode="create" />
    </div>
  );
}
