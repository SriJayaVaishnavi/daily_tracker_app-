'use client';

interface Props {
  label: string;
  value?: string | null;
  placeholder?: string;
  required?: boolean;
  invalid?: boolean;
  active?: boolean;
  onClick: () => void;
}

/**
 * A single editable goal field rendered as a pill. Presentational only — the
 * editor it opens lives in the parent (GoalComposer), keyed by field name.
 */
export default function EditableChip({
  label,
  value,
  placeholder = 'add',
  required = false,
  invalid = false,
  active = false,
  onClick,
}: Props) {
  const filled = value != null && value !== '';
  const tone = active
    ? 'border-primary ring-2 ring-ring bg-surface'
    : invalid
      ? 'border-destructive text-destructive'
      : filled
        ? 'border-border bg-surface text-foreground'
        : 'border-dashed border-border text-muted-fg';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${filled ? value : placeholder}`}
      className={`transition-calm inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tone}`}
    >
      <span className="text-xs font-medium text-muted-fg">{label}</span>
      <span className={filled ? 'font-medium' : 'italic'}>
        {filled ? value : placeholder}
        {required && !filled ? ' *' : ''}
      </span>
    </button>
  );
}
