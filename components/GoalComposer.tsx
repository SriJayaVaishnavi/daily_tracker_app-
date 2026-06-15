'use client';

import { useState, useTransition } from 'react';
import { Loader2, Sparkles, Info, Plus, CalendarClock } from 'lucide-react';
import {
  parseGoalsAction,
  createGoals,
  updateGoal,
  type GoalInput,
} from '@/lib/actions/goals';
import { recommendSchedulesAction } from '@/lib/actions/schedule';
import type { Goal } from '@/lib/database.types';
import type { ParsedGoal } from '@/lib/goal-parse';
import type { SchedulePlan } from '@/lib/schedule';
import GoalCardEditor, {
  emptyFields,
  fromGoal,
  fromParsed,
  titleInvalid,
  projectInvalid,
  type Fields,
} from '@/components/GoalCardEditor';
import SchedulePicker from '@/components/SchedulePicker';

type Props = { mode: 'create' } | { mode: 'edit'; goal: Goal };

type Step = 'describe' | 'edit' | 'schedule';

/** Build a GoalInput from one card's fields. */
function buildInput(fields: Fields): GoalInput {
  const period_month = `${fields.month}-01`;
  if (fields.goal_type === 'habit') {
    return {
      title: fields.title.trim(),
      category: fields.category.trim() || undefined,
      goal_type: 'habit',
      period_month,
      recurrence_type: fields.recurrence_type,
      weekdays: fields.recurrence_type === 'weekly_days' ? fields.weekdays : undefined,
      target_count:
        fields.recurrence_type === 'weekly_count' && fields.target_count.trim()
          ? Number(fields.target_count)
          : undefined,
      scheduled_time: fields.scheduled_time.trim() || undefined,
      target_value: fields.target_value.trim() ? Number(fields.target_value) : undefined,
      unit: fields.unit.trim() || undefined,
    };
  }
  return {
    title: fields.title.trim(),
    category: fields.category.trim() || undefined,
    goal_type: 'project',
    period_month,
    target_value: Number(fields.target_value),
    unit: fields.unit.trim(),
    due_date: fields.due_date.trim() || undefined,
  };
}

/** A draft Fields back into a ParsedGoal, for the schedule recommender. */
function toParsed(f: Fields): ParsedGoal {
  return {
    goal_type: f.goal_type,
    title: f.title.trim(),
    recurrence_type: f.recurrence_type,
    weekdays: f.recurrence_type === 'weekly_days' ? f.weekdays : undefined,
    scheduled_time: f.scheduled_time.trim() || undefined,
  };
}

const fieldClass =
  'w-full rounded-xl border border-border bg-background px-3 py-3 text-base text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export default function GoalComposer(props: Props) {
  // ---- Edit mode: a single existing goal -----------------------------------
  if (props.mode === 'edit') {
    return <EditOne goal={props.goal} />;
  }
  return <CreateMany />;
}

function EditOne({ goal }: { goal: Goal }) {
  const [fields, setFields] = useState<Fields>(fromGoal(goal));
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canSave = !titleInvalid(fields) && !projectInvalid(fields);

  function save() {
    setError(null);
    if (!canSave) {
      setError(titleInvalid(fields) ? 'Add a title.' : 'Projects need a target value and a unit.');
      return;
    }
    startSave(async () => {
      try {
        await updateGoal(goal.id, buildInput(fields));
        window.location.href = '/goals';
      } catch (err) {
        if (err && typeof err === 'object' && 'digest' in err) throw err; // NEXT_REDIRECT
        setError('Something went wrong. Please try again.');
      }
    });
  }

  return (
    <div className="space-y-5">
      <GoalCardEditor fields={fields} onChange={setFields} />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <SaveButton saving={saving} label="Save changes" onClick={save} />
    </div>
  );
}

function CreateMany() {
  const [step, setStep] = useState<Step>('describe');
  const [text, setText] = useState('');
  const [goals, setGoals] = useState<Fields[]>([]);
  const [source, setSource] = useState<'llm' | 'fallback' | null>(null);
  const [plans, setPlans] = useState<SchedulePlan[]>([]);
  const [planSource, setPlanSource] = useState<'llm' | 'fallback'>('fallback');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [parsing, startParse] = useTransition();
  const [recommending, startRecommend] = useTransition();
  const [saving, startSave] = useTransition();

  function runParse() {
    if (!text.trim()) return;
    setError(null);
    startParse(async () => {
      try {
        const res = await parseGoalsAction(text.trim());
        setGoals(res.goals.length ? res.goals.map(fromParsed) : [emptyFields()]);
        setSource(res.source);
        setStep('edit');
      } catch {
        setError('Could not parse that. Try rephrasing, or add goals manually.');
        setGoals([emptyFields()]);
        setStep('edit');
      }
    });
  }

  function updateGoalAt(i: number, next: Fields) {
    setGoals((gs) => gs.map((g, idx) => (idx === i ? next : g)));
  }

  function removeGoalAt(i: number) {
    setGoals((gs) => gs.filter((_, idx) => idx !== i));
  }

  function suggestSchedule() {
    setInfo(null);
    setError(null);
    startRecommend(async () => {
      try {
        const res = await recommendSchedulesAction(goals.map(toParsed));
        if (res.plans.length === 0) {
          setInfo('No habit goals to schedule — add a habit or set times yourself.');
          return;
        }
        setPlans(res.plans);
        setPlanSource(res.source);
        setStep('schedule');
      } catch {
        setError('Could not suggest a schedule. Set times yourself, or try again.');
      }
    });
  }

  function applyPlan(plan: SchedulePlan) {
    setGoals((gs) =>
      gs.map((g, i) => {
        const a = plan.assignments.find((x) => x.goalIndex === i);
        return a
          ? {
              ...g,
              scheduled_time: a.scheduled_time,
              recurrence_type: a.recurrence_type,
              weekdays: a.weekdays ?? g.weekdays,
            }
          : g;
      }),
    );
    setStep('edit');
  }

  const canSave =
    goals.length > 0 && goals.every((g) => !titleInvalid(g) && !projectInvalid(g));

  function save() {
    setError(null);
    if (!canSave) {
      setError('Each goal needs a title; projects also need a target value and unit.');
      return;
    }
    startSave(async () => {
      try {
        await createGoals(goals.map(buildInput));
      } catch (err) {
        if (err && typeof err === 'object' && 'digest' in err) throw err; // NEXT_REDIRECT
        setError('Something went wrong. Please try again.');
      }
    });
  }

  if (step === 'schedule') {
    return (
      <SchedulePicker
        plans={plans}
        source={planSource}
        goalTitles={goals.map((g) => g.title)}
        onUse={applyPlan}
        onSkip={() => setStep('edit')}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="nl" className="mb-1 block text-sm font-medium text-foreground">
          Describe your goals
        </label>
        <textarea
          id="nl"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              runParse();
            }
          }}
          placeholder="e.g. aws course, take pills, spearmint tea every evening"
          className={fieldClass}
        />
        <button
          type="button"
          onClick={runParse}
          disabled={parsing || !text.trim()}
          className="transition-calm mt-2 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-foreground hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {parsing ? (
            <Loader2 aria-hidden="true" size={16} className="animate-spin" />
          ) : (
            <Sparkles aria-hidden="true" size={16} />
          )}
          {goals.length ? 'Re-parse' : 'Parse'}
        </button>
      </div>

      {step === 'edit' && (
        <>
          {source === 'fallback' && (
            <p className="flex items-start gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-fg">
              <Info aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
              Guessed from keywords — check each goal below.
            </p>
          )}

          <div className="space-y-3">
            {goals.map((g, i) => (
              <GoalCardEditor
                key={i}
                index={i}
                fields={g}
                onChange={(next) => updateGoalAt(i, next)}
                onRemove={goals.length > 1 ? () => removeGoalAt(i) : undefined}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setGoals((gs) => [...gs, emptyFields()])}
              className="transition-calm inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-foreground hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus aria-hidden="true" size={16} /> Add a goal
            </button>
            <button
              type="button"
              onClick={suggestSchedule}
              disabled={recommending}
              className="transition-calm inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-foreground hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {recommending ? (
                <Loader2 aria-hidden="true" size={16} className="animate-spin" />
              ) : (
                <CalendarClock aria-hidden="true" size={16} />
              )}
              Suggest schedule
            </button>
          </div>

          {info && (
            <p className="text-sm text-muted-fg" aria-live="polite">
              {info}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <SaveButton saving={saving} label={`Save ${goals.length > 1 ? 'all' : 'goal'}`} onClick={save} />
        </>
      )}
    </div>
  );
}

function SaveButton({
  saving,
  label,
  onClick,
}: {
  saving: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      className="transition-calm inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-primary-fg hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
    >
      {saving && <Loader2 aria-hidden="true" size={18} className="animate-spin" />}
      {saving ? 'Saving…' : label}
    </button>
  );
}
