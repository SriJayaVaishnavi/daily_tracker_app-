import { Sparkles } from 'lucide-react';
import type { DailyBrief as DailyBriefType } from '@/lib/database.types';

export default function DailyBrief({ brief }: { brief: DailyBriefType | null }) {
  return (
    <section
      aria-labelledby="brief-heading"
      className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
    >
      <div className="mb-2 flex items-center gap-2 text-muted-fg">
        <Sparkles aria-hidden="true" size={16} className="text-primary" />
        <h2 id="brief-heading" className="text-xs font-semibold uppercase tracking-wide">
          Daily brief
        </h2>
      </div>
      {brief ? (
        <p className="font-serif text-lg leading-relaxed text-foreground">
          {brief.motivation_text}
        </p>
      ) : (
        <p className="text-sm leading-relaxed text-muted-fg">
          Your daily brief will appear here once morning briefs are on.
        </p>
      )}
    </section>
  );
}
