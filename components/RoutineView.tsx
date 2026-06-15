'use client';

import Link from 'next/link';
import { Plus, HeartPulse, Pencil } from 'lucide-react';
import type { Routine } from '@/lib/routine';
import DailyBrief from '@/components/DailyBrief';
import StoicQuote from '@/components/StoicQuote';
import HabitItem from '@/components/HabitItem';
import ProjectItem from '@/components/ProjectItem';

export default function RoutineView({ routine }: { routine: Routine }) {
  const { habit, project, mood, stoic, brief } = routine;
  const noGoals = habit.length === 0 && project.length === 0;

  return (
    <div className="space-y-6">
      <DailyBrief brief={brief} />
      <StoicQuote stoic={stoic} />

      <section aria-labelledby="habits-heading" className="space-y-3">
        <h2 id="habits-heading" className="font-serif text-lg font-semibold text-foreground">
          Today
        </h2>
        {noGoals ? (
          <Link
            href="/goals/new"
            className="transition-calm flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface p-6 text-center shadow-sm hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus aria-hidden="true" size={22} className="text-primary" />
            <span className="font-medium text-foreground">
              No goals yet — create your first goal
            </span>
            <span className="text-sm text-muted-fg">
              Add a daily habit or a monthly project to begin.
            </span>
          </Link>
        ) : habit.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted-fg shadow-sm">
            No habits due today. Enjoy the calm.
          </p>
        ) : (
          <div className="space-y-2">
            {habit.map((h) => (
              <HabitItem key={h.task_id} item={h} />
            ))}
          </div>
        )}
      </section>

      {project.length > 0 && (
        <section aria-labelledby="projects-heading" className="space-y-3">
          <h2 id="projects-heading" className="font-serif text-lg font-semibold text-foreground">
            Projects
          </h2>
          <div className="space-y-3">
            {project.map((p) => (
              <ProjectItem key={p.goal_id} item={p} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="mood-heading" className="space-y-3">
        <h2 id="mood-heading" className="font-serif text-lg font-semibold text-foreground">
          Mood
        </h2>
        {mood ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <HeartPulse aria-hidden="true" size={20} className="text-accent" />
              <p className="text-base text-foreground">
                Today: <span className="font-semibold">{mood.mood}/5</span>
                {mood.energy != null && (
                  <span className="text-muted-fg"> · energy {mood.energy}/5</span>
                )}
              </p>
            </div>
            <Link
              href="/mood"
              className="transition-calm inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium text-foreground hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Pencil aria-hidden="true" size={16} /> Edit
            </Link>
          </div>
        ) : (
          <Link
            href="/mood"
            className="transition-calm flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface p-4 text-base font-medium text-foreground shadow-sm hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <HeartPulse aria-hidden="true" size={20} className="text-accent" />
            How are you feeling?
          </Link>
        )}
      </section>
    </div>
  );
}
