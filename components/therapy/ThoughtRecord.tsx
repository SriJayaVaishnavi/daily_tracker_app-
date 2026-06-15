'use client';

import { useState } from 'react';

interface Props {
  /** Called with a formatted summary when the user finishes the record. */
  onComplete: (summary: string) => void;
}

const fieldClass =
  'w-full rounded-xl border border-border bg-background px-3 py-3 text-base text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const labelClass = 'mb-1 block text-sm font-medium text-foreground';

/** Guided CBT thought record. Produces a summary the therapist can respond to. */
export default function ThoughtRecord({ onComplete }: Props) {
  const [situation, setSituation] = useState('');
  const [thought, setThought] = useState('');
  const [emotion, setEmotion] = useState('');
  const [intensity, setIntensity] = useState(50);
  const [evidenceFor, setEvidenceFor] = useState('');
  const [evidenceAgainst, setEvidenceAgainst] = useState('');
  const [balanced, setBalanced] = useState('');
  const [reRate, setReRate] = useState(50);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const summary = [
      'I filled in a thought record:',
      `• Situation: ${situation || '—'}`,
      `• Automatic thought: ${thought || '—'}`,
      `• Emotion: ${emotion || '—'} (${intensity}/100)`,
      `• Evidence for: ${evidenceFor || '—'}`,
      `• Evidence against: ${evidenceAgainst || '—'}`,
      `• Balanced thought: ${balanced || '—'}`,
      `• Emotion now: ${reRate}/100`,
    ].join('\n');
    onComplete(summary);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="tr-situation" className={labelClass}>
          What happened? (the situation)
        </label>
        <textarea id="tr-situation" rows={2} className={fieldClass} value={situation} onChange={(e) => setSituation(e.target.value)} />
      </div>
      <div>
        <label htmlFor="tr-thought" className={labelClass}>
          What went through your mind? (automatic thought)
        </label>
        <textarea id="tr-thought" rows={2} className={fieldClass} value={thought} onChange={(e) => setThought(e.target.value)} />
      </div>
      <div>
        <label htmlFor="tr-emotion" className={labelClass}>
          What did you feel?
        </label>
        <input id="tr-emotion" className={fieldClass} value={emotion} onChange={(e) => setEmotion(e.target.value)} placeholder="e.g. anxious, sad" />
        <label htmlFor="tr-intensity" className="mt-2 block text-xs text-muted-fg">
          Intensity: {intensity}/100
        </label>
        <input id="tr-intensity" type="range" min={0} max={100} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} className="w-full accent-primary" />
      </div>
      <div>
        <label htmlFor="tr-for" className={labelClass}>
          Evidence the thought is true
        </label>
        <textarea id="tr-for" rows={2} className={fieldClass} value={evidenceFor} onChange={(e) => setEvidenceFor(e.target.value)} />
      </div>
      <div>
        <label htmlFor="tr-against" className={labelClass}>
          Evidence it might not be (fully) true
        </label>
        <textarea id="tr-against" rows={2} className={fieldClass} value={evidenceAgainst} onChange={(e) => setEvidenceAgainst(e.target.value)} />
      </div>
      <div>
        <label htmlFor="tr-balanced" className={labelClass}>
          A more balanced thought
        </label>
        <textarea id="tr-balanced" rows={2} className={fieldClass} value={balanced} onChange={(e) => setBalanced(e.target.value)} />
        <label htmlFor="tr-rerate" className="mt-2 block text-xs text-muted-fg">
          Emotion intensity now: {reRate}/100
        </label>
        <input id="tr-rerate" type="range" min={0} max={100} value={reRate} onChange={(e) => setReRate(Number(e.target.value))} className="w-full accent-primary" />
      </div>

      <button
        type="submit"
        className="transition-calm min-h-[44px] w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Share with companion
      </button>
    </form>
  );
}
