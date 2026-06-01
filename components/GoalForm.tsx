'use client';

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { createGoal, updateGoal, type GoalInput } from '@/lib/actions/goals';
import type { Goal, GoalType, RecurrenceType } from '@/lib/database.types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function currentPeriodMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/** `YYYY-MM-01` -> `YYYY-MM` for the month input. */
function toMonthInput(periodMonth: string): string {
  return periodMonth.slice(0, 7);
}

type Props =
  | { mode: 'create'; goal?: undefined }
  | { mode: 'edit'; goal: Goal };

export default function GoalForm({ mode, goal }: Props) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const [title, setTitle] = useState(goal?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [category, setCategory] = useState(goal?.category ?? '');
  const [goalType, setGoalType] = useState<GoalType>(goal?.goal_type ?? 'habit');
  const [month, setMonth] = useState(
    goal ? toMonthInput(goal.period_month) : toMonthInput(currentPeriodMonth()),
  );

  // habit fields
  const [recurrence, setRecurrence] = useState<RecurrenceType>(
    goal?.recurrence_type ?? 'daily',
  );
  const [weekdays, setWeekdays] = useState<number[]>(goal?.weekdays ?? []);
  const [targetCount, setTargetCount] = useState(
    goal?.target_count != null ? String(goal.target_count) : '',
  );
  const [scheduledTime, setScheduledTime] = useState(goal?.scheduled_time ?? '');
  const [habitTargetValue, setHabitTargetValue] = useState(
    goal?.goal_type === 'habit' && goal.target_value != null ? String(goal.target_value) : '',
  );
  const [habitUnit, setHabitUnit] = useState(
    goal?.goal_type === 'habit' ? goal.unit ?? '' : '',
  );

  // project fields
  const [projectTargetValue, setProjectTargetValue] = useState(
    goal?.goal_type === 'project' && goal.target_value != null
      ? String(goal.target_value)
      : '',
  );
  const [projectUnit, setProjectUnit] = useState(
    goal?.goal_type === 'project' ? goal.unit ?? '' : '',
  );
  const [dueDate, setDueDate] = useState(goal?.due_date ?? '');

  function toggleWeekday(d: number) {
    setWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b),
    );
  }

  const titleInvalid = title.trim().length === 0;
  const projectInvalid =
    goalType === 'project' &&
    (projectTargetValue.trim() === '' ||
      Number.isNaN(Number(projectTargetValue)) ||
      projectUnit.trim() === '');

  function buildInput(): GoalInput {
    const periodMonth = `${month}-01`;
    if (goalType === 'habit') {
      return {
        title: title.trim(),
        description: description.trim() || undefined,
        category: category.trim() || undefined,
        goal_type: 'habit',
        period_month: periodMonth,
        recurrence_type: recurrence,
        weekdays: recurrence === 'weekly_days' ? weekdays : undefined,
        target_count:
          recurrence === 'weekly_count' && targetCount.trim()
            ? Number(targetCount)
            : undefined,
        scheduled_time: scheduledTime.trim() || undefined,
        target_value: habitTargetValue.trim() ? Number(habitTargetValue) : undefined,
        unit: habitUnit.trim() || undefined,
      };
    }
    return {
      title: title.trim(),
      description: description.trim() || undefined,
      category: category.trim() || undefined,
      goal_type: 'project',
      period_month: periodMonth,
      target_value: Number(projectTargetValue),
      unit: projectUnit.trim(),
      due_date: dueDate.trim() || undefined,
    };
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (titleInvalid) {
      setFormError('Please enter a title.');
      return;
    }
    if (projectInvalid) {
      setFormError('Projects need a numeric target value and a unit.');
      return;
    }
    const input = buildInput();
    startTransition(async () => {
      try {
        if (mode === 'create') {
          await createGoal(input);
        } else {
          await updateGoal(goal.id, input);
          window.location.href = '/goals';
        }
      } catch (err) {
        // redirect() throws NEXT_REDIRECT; let it propagate.
        if (err && typeof err === 'object' && 'digest' in err) throw err;
        setFormError('Something went wrong. Please try again.');
      }
    });
  }

  const fieldClass =
    'w-full rounded-xl border border-border bg-background px-3 py-3 text-base text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  const labelClass = 'mb-1 block text-sm font-medium text-foreground';

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label htmlFor="title" className={labelClass}>
          Title <span className="text-destructive">*</span>
        </label>
        <input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={fieldClass}
          aria-invalid={titleInvalid}
        />
      </div>

      <div>
        <label htmlFor="description" className={labelClass}>
          Description <span className="text-muted-fg">(optional)</span>
        </label>
        <textarea
          id="description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={fieldClass}
        />
      </div>

      <div>
        <label htmlFor="category" className={labelClass}>
          Category <span className="text-muted-fg">(optional)</span>
        </label>
        <input
          id="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={fieldClass}
          placeholder="e.g. Health, Learning"
        />
      </div>

      <fieldset>
        <legend className={labelClass}>Type</legend>
        <div
          role="radiogroup"
          aria-label="Goal type"
          className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-background p-1"
        >
          {(['habit', 'project'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={goalType === t}
              onClick={() => setGoalType(t)}
              className={`transition-calm min-h-[44px] rounded-lg text-sm font-medium capitalize focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                goalType === t
                  ? 'bg-primary text-primary-fg shadow-sm'
                  : 'text-muted-fg hover:text-foreground'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="period_month" className={labelClass}>
          Month
        </label>
        <input
          id="period_month"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className={fieldClass}
        />
      </div>

      {goalType === 'habit' ? (
        <div className="space-y-5">
          <div>
            <label htmlFor="recurrence" className={labelClass}>
              Recurrence
            </label>
            <select
              id="recurrence"
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as RecurrenceType)}
              className={fieldClass}
            >
              <option value="daily">Daily</option>
              <option value="weekly_days">Specific weekdays</option>
              <option value="weekly_count">A number of times per week</option>
            </select>
          </div>

          {recurrence === 'weekly_days' && (
            <div>
              <span className={labelClass}>Days</span>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((label, idx) => {
                  const on = weekdays.includes(idx);
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
            </div>
          )}

          {recurrence === 'weekly_count' && (
            <div>
              <label htmlFor="target_count" className={labelClass}>
                Times per week
              </label>
              <input
                id="target_count"
                type="number"
                min="1"
                inputMode="numeric"
                value={targetCount}
                onChange={(e) => setTargetCount(e.target.value)}
                className={fieldClass}
              />
            </div>
          )}

          <div>
            <label htmlFor="scheduled_time" className={labelClass}>
              Scheduled time <span className="text-muted-fg">(optional)</span>
            </label>
            <input
              id="scheduled_time"
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className={fieldClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="habit_target" className={labelClass}>
                Target <span className="text-muted-fg">(optional)</span>
              </label>
              <input
                id="habit_target"
                type="number"
                inputMode="decimal"
                step="any"
                value={habitTargetValue}
                onChange={(e) => setHabitTargetValue(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="habit_unit" className={labelClass}>
                Unit <span className="text-muted-fg">(optional)</span>
              </label>
              <input
                id="habit_unit"
                value={habitUnit}
                onChange={(e) => setHabitUnit(e.target.value)}
                className={fieldClass}
                placeholder="e.g. min, pages"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="project_target" className={labelClass}>
                Target value <span className="text-destructive">*</span>
              </label>
              <input
                id="project_target"
                type="number"
                inputMode="decimal"
                step="any"
                value={projectTargetValue}
                onChange={(e) => setProjectTargetValue(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="project_unit" className={labelClass}>
                Unit <span className="text-destructive">*</span>
              </label>
              <input
                id="project_unit"
                value={projectUnit}
                onChange={(e) => setProjectUnit(e.target.value)}
                className={fieldClass}
                placeholder="e.g. pages, km"
              />
            </div>
          </div>
          <div>
            <label htmlFor="due_date" className={labelClass}>
              Due date <span className="text-muted-fg">(optional)</span>
            </label>
            <input
              id="due_date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={fieldClass}
            />
            <p className="mt-1 text-xs text-muted-fg">
              Defaults to the last day of the month.
            </p>
          </div>
        </div>
      )}

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="transition-calm inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-primary-fg hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
      >
        {pending && <Loader2 aria-hidden="true" size={18} className="animate-spin" />}
        {pending
          ? 'Saving…'
          : mode === 'create'
            ? 'Create goal'
            : 'Save changes'}
      </button>
    </form>
  );
}
