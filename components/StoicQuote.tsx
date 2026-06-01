import { Quote } from 'lucide-react';
import type { StoicQuote as StoicQuoteType } from '@/lib/database.types';

export default function StoicQuote({ stoic }: { stoic: StoicQuoteType | null }) {
  return (
    <section
      aria-labelledby="stoic-heading"
      className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
    >
      <div className="mb-2 flex items-center gap-2 text-muted-fg">
        <Quote aria-hidden="true" size={16} className="text-accent" />
        <h2 id="stoic-heading" className="text-xs font-semibold uppercase tracking-wide">
          Reflection
        </h2>
      </div>
      {stoic ? (
        <figure className="space-y-2">
          <blockquote className="font-serif text-lg italic leading-relaxed text-foreground">
            {stoic.body}
          </blockquote>
          <figcaption className="text-sm text-muted-fg">
            — {stoic.author}
            {stoic.source_work ? `, ${stoic.source_work}` : ''}
          </figcaption>
        </figure>
      ) : (
        <p className="text-sm leading-relaxed text-muted-fg">
          A reflection for the day will appear here.
        </p>
      )}
    </section>
  );
}
