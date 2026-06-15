'use client';

import type { SchedulePlan } from '@/lib/schedule';

export default function SchedulePicker({
  plans,
  goalTitles,
  source,
  onUse,
  onSkip,
}: {
  plans: SchedulePlan[];
  goalTitles: string[];
  source: 'llm' | 'fallback';
  onUse: (plan: SchedulePlan) => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-fg">
        Pick a plan — you can tweak times after.
        {source === 'fallback' && ' (Suggested from sensible defaults.)'}
      </p>
      <div className="grid gap-3">
        {plans.map((plan) => (
          <div key={plan.id} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <h3 className="font-serif text-base font-semibold text-foreground">
              {plan.emoji} {plan.name}
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-muted-fg">
              {[...plan.assignments]
                .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))
                .map((a) => (
                  <li key={`${plan.id}-${a.goalIndex}`}>
                    <span className="tabular-nums text-foreground">{a.scheduled_time}</span>{' '}
                    {goalTitles[a.goalIndex] ?? `Goal ${a.goalIndex + 1}`}
                  </li>
                ))}
            </ul>
            <button
              type="button"
              onClick={() => onUse(plan)}
              className="transition-calm mt-3 inline-flex min-h-[44px] items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Use this plan
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onSkip}
        className="transition-calm rounded text-sm font-medium text-muted-fg hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Skip — set times myself
      </button>
    </div>
  );
}
