import { Quote } from 'lucide-react';
import type { StoicQuote as StoicQuoteType } from '@/lib/database.types';

/** Known philosopher portraits in /public/philosophers (real public-domain images). */
const PORTRAITS: Record<string, string> = {
  'marcus aurelius': '/philosophers/marcus-aurelius.jpg',
  seneca: '/philosophers/seneca.jpg',
  epictetus: '/philosophers/epictetus.jpg',
};

function portraitFor(author: string): string | null {
  return PORTRAITS[author.trim().toLowerCase()] ?? null;
}

export default function StoicQuote({ stoic }: { stoic: StoicQuoteType | null }) {
  const portrait = stoic ? portraitFor(stoic.author) : null;

  return (
    <section
      aria-labelledby="stoic-heading"
      className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
    >
      <div className="mb-3 flex items-center gap-2 text-muted-fg">
        <Quote aria-hidden="true" size={16} className="text-accent" />
        <h2 id="stoic-heading" className="text-xs font-semibold uppercase tracking-wide">
          Reflection
        </h2>
      </div>
      {stoic ? (
        <figure className="space-y-3">
          {portrait && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={portrait}
              alt={stoic.author}
              className="h-40 w-full rounded-lg object-cover object-top ring-1 ring-border"
            />
          )}
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
