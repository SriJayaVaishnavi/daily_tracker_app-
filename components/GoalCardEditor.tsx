'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { Goal, GoalType, RecurrenceType } from '@/lib/database.types';
import type { ParsedGoal } from '@/lib/goal-parse';
import EditableChip from '@/components/EditableChip';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Field = 'title' | 'type' | 'recurrence' | 'time' | 'target' | 'due' | 'category' | 'month';

export interface Fields {
  goal_type: GoalType;
  title: string;
  category: string;
  recurrence_type: RecurrenceType;
  weekdays: number[];
  target_count: string;
  scheduled_time: string;
  target_value: string;
  unit: string;
  due_date: string;
  month: string; // YYYY-MM
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function emptyFields(): Fields {
  return {
    goal_type: 'habit',
    title: '',
    category: '',
    recurrence_type: 'daily',
    weekdays: [],
    target_count: '',
    scheduled_time: '',
    target_value: '',
    unit: '',
    due_date: '',
    month: currentMonth(),
  };
}

export function fromGoal(goal: Goal): Fields {
  return {
    goal_type: goal.goal_type,
    title: goal.title,
    category: goal.category ?? '',
    recurrence_type: goal.recurrence_type ?? 'daily',
    weekdays: goal.weekdays ?? [],
    target_count: goal.target_count != null ? String(goal.target_count) : '',
    scheduled_time: goal.scheduled_time ?? '',
    target_value: goal.target_value != null ? String(goal.target_value) : '',
    unit: goal.unit ?? '',
    due_date: goal.due_date ?? '',
    month: goal.period_month.slice(0, 7),
  };
}

/** Merge a parsed result onto the empty defaults, keeping the default month. */
export function fromParsed(p: ParsedGoal): Fields {
  const base = emptyFields();
  return {
    ...base,
    goal_type: p.goal_type,
    title: p.title,
    category: p.category ?? '',
    recurrence_type: p.recurrence_type ?? base.recurrence_type,
    weekdays: p.weekdays ?? [],
    target_count: p.target_count != null ? String(p.target_count) : '',
    scheduled_time: p.scheduled_time ?? '',
    target_value: p.target_value != null ? String(p.target_value) : '',
    unit: p.unit ?? '',
    due_date: p.due_date ?? '',
  };
}

function recurrenceLabel(f: Fields): string {
  if (f.recurrence_type === 'daily') return 'Daily';
  if (f.recurrence_type === 'weekly_days')
    return f.weekdays.length ? f.weekdays.map((d) => WEEKDAYS[d]).join(', ') : 'Pick days';
  return f.target_count ? `${f.target_count}×/week` : 'Times/week';
}

function targetLabel(f: Fields): string {
  if (!f.target_value) return '';
  return f.unit ? `${f.target_value} ${f.unit}` : f.target_value;
}

export function titleInvalid(f: Fields): boolean {
  return f.title.trim() === '';
}

export function projectInvalid(f: Fields): boolean {
  return (
    f.goal_type === 'project' &&
    (f.target_value.trim() === '' || Number.isNaN(Number(f.target_value)) || f.unit.trim() === '')
  );
}

const fieldClass =
  'w-full rounded-xl border border-border bg-background px-3 py-3 text-base text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Editable chip view of one goal. Controlled — reads `fields`, reports edits via
 * `onChange`. Optional `onRemove` shows an ✕ to drop the goal from a list.
 */
export default function GoalCardEditor({
  fields,
  onChange,
  onRemove,
  index,
}: {
  fields: Fields;
  onChange: (next: Fields) => void;
  onRemove?: () => void;
  index?: number;
}) {
  const [active, setActive] = useState<Field | null>(null);

  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
    onChange({ ...fields, [key]: value });
  }

  function toggleWeekday(d: number) {
    onChange({
      ...fields,
      weekdays: fields.weekdays.includes(d)
        ? fields.weekdays.filter((x) => x !== d)
        : [...fields.weekdays, d].sort((a, b) => a - b),
    });
  }

  const tInvalid = titleInvalid(fields);
  const pInvalid = projectInvalid(fields);

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      {onRemove && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-fg">
            {index != null ? `Goal ${index + 1}` : 'Goal'}
          </span>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove goal"
            className="transition-calm flex h-8 w-8 items-center justify-center rounded-full text-muted-fg hover:bg-background hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <EditableChip
          label="Goal"
          value={fields.title}
          placeholder="title"
          required
          invalid={tInvalid}
          active={active === 'title'}
          onClick={() => setActive(active === 'title' ? null : 'title')}
        />
        <EditableChip
          label="Type"
          value={fields.goal_type === 'habit' ? 'Habit' : 'Project'}
          active={active === 'type'}
          onClick={() => setActive(active === 'type' ? null : 'type')}
        />
        {fields.goal_type === 'habit' && (
          <>
            <EditableChip
              label="When"
              value={recurrenceLabel(fields)}
              active={active === 'recurrence'}
              onClick={() => setActive(active === 'recurrence' ? null : 'recurrence')}
            />
            <EditableChip
              label="Time"
              value={fields.scheduled_time}
              placeholder="add time"
              active={active === 'time'}
              onClick={() => setActive(active === 'time' ? null : 'time')}
            />
          </>
        )}
        <EditableChip
          label="Target"
          value={targetLabel(fields)}
          placeholder={fields.goal_type === 'project' ? 'value + unit' : 'add target'}
          required={fields.goal_type === 'project'}
          invalid={pInvalid}
          active={active === 'target'}
          onClick={() => setActive(active === 'target' ? null : 'target')}
        />
        {fields.goal_type === 'project' && (
          <EditableChip
            label="Due"
            value={fields.due_date}
            placeholder="add date"
            active={active === 'due'}
            onClick={() => setActive(active === 'due' ? null : 'due')}
          />
        )}
        <EditableChip
          label="Category"
          value={fields.category}
          placeholder="add"
          active={active === 'category'}
          onClick={() => setActive(active === 'category' ? null : 'category')}
        />
        <EditableChip
          label="Month"
          value={fields.month}
          active={active === 'month'}
          onClick={() => setActive(active === 'month' ? null : 'month')}
        />
      </div>

      {active && (
        <div className="rounded-2xl border border-border bg-background p-4">
          {active === 'title' && (
            <input
              autoFocus
              value={fields.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="What's the goal?"
              className={fieldClass}
            />
          )}

          {active === 'type' && (
            <div role="radiogroup" aria-label="Goal type" className="grid grid-cols-2 gap-2">
              {(['habit', 'project'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={fields.goal_type === t}
                  onClick={() => set('goal_type', t)}
                  className={`transition-calm min-h-[44px] rounded-xl border text-sm font-medium capitalize focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    fields.goal_type === t
                      ? 'border-primary bg-primary text-primary-fg'
                      : 'border-border text-muted-fg hover:text-foreground'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {active === 'recurrence' && (
            <div className="space-y-3">
              <select
                value={fields.recurrence_type}
                onChange={(e) => set('recurrence_type', e.target.value as RecurrenceType)}
                className={fieldClass}
              >
                <option value="daily">Daily</option>
                <option value="weekly_days">Specific weekdays</option>
                <option value="weekly_count">A number of times per week</option>
              </select>
              {fields.recurrence_type === 'weekly_days' && (
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((label, idx) => {
                    const on = fields.weekdays.includes(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleWeekday(idx)}
                        className={`transition-calm min-h-[44px] min-w-[44px] rounded-full border px-3 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          on
                            ? 'border-primary bg-primary text-primary-fg'
                            : 'border-border text-muted-fg hover:border-primary hover:text-primary'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
              {fields.recurrence_type === 'weekly_count' && (
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  value={fields.target_count}
                  onChange={(e) => set('target_count', e.target.value)}
                  placeholder="Times per week"
                  className={fieldClass}
                />
              )}
            </div>
          )}

          {active === 'time' && (
            <input
              type="time"
              value={fields.scheduled_time}
              onChange={(e) => set('scheduled_time', e.target.value)}
              className={fieldClass}
            />
          )}

          {active === 'target' && (
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={fields.target_value}
                onChange={(e) => set('target_value', e.target.value)}
                placeholder="Value"
                className={fieldClass}
              />
              <input
                value={fields.unit}
                onChange={(e) => set('unit', e.target.value)}
                placeholder="Unit (min, pages…)"
                className={fieldClass}
              />
            </div>
          )}

          {active === 'due' && (
            <input
              type="date"
              value={fields.due_date}
              onChange={(e) => set('due_date', e.target.value)}
              className={fieldClass}
            />
          )}

          {active === 'category' && (
            <input
              value={fields.category}
              onChange={(e) => set('category', e.target.value)}
              placeholder="e.g. Health, Learning"
              className={fieldClass}
            />
          )}

          {active === 'month' && (
            <input
              type="month"
              value={fields.month}
              onChange={(e) => set('month', e.target.value)}
              className={fieldClass}
            />
          )}

          <button
            type="button"
            onClick={() => setActive(null)}
            className="transition-calm mt-3 inline-flex min-h-[40px] items-center rounded-lg px-3 text-sm font-medium text-primary hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
