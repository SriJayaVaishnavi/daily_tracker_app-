'use client';

import { useEffect, useRef, useState } from 'react';

type Phase = 'inhale' | 'hold1' | 'exhale' | 'hold2';

const SEQUENCE: { phase: Phase; label: string; seconds: number }[] = [
  { phase: 'inhale', label: 'Breathe in', seconds: 4 },
  { phase: 'hold1', label: 'Hold', seconds: 4 },
  { phase: 'exhale', label: 'Breathe out', seconds: 4 },
  { phase: 'hold2', label: 'Hold', seconds: 4 },
];

/** Animated 4-4-4-4 box-breathing guide. */
export default function BoxBreathing() {
  const [running, setRunning] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [count, setCount] = useState(4);
  const [cycles, setCycles] = useState(0);
  const tick = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    tick.current = window.setInterval(() => {
      setCount((c) => {
        if (c > 1) return c - 1;
        // advance to next phase
        setStepIdx((i) => {
          const next = (i + 1) % SEQUENCE.length;
          if (next === 0) setCycles((n) => n + 1);
          return next;
        });
        return SEQUENCE[(stepIdxRef.current + 1) % SEQUENCE.length].seconds;
      });
    }, 1000);
    return () => {
      if (tick.current) window.clearInterval(tick.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  // Keep a ref of stepIdx for use inside the interval closure.
  const stepIdxRef = useRef(0);
  useEffect(() => {
    stepIdxRef.current = stepIdx;
  }, [stepIdx]);

  const step = SEQUENCE[stepIdx];
  const expanded = step.phase === 'inhale' || step.phase === 'hold1';

  function start() {
    setStepIdx(0);
    setCount(SEQUENCE[0].seconds);
    setCycles(0);
    setRunning(true);
  }
  function stop() {
    setRunning(false);
  }

  return (
    <div className="flex flex-col items-center gap-5 py-2">
      <div className="flex h-56 w-56 items-center justify-center">
        <div
          className="flex items-center justify-center rounded-full bg-primary/10 text-primary"
          style={{
            width: expanded ? 208 : 120,
            height: expanded ? 208 : 120,
            transition: `width ${step.seconds}s ease-in-out, height ${step.seconds}s ease-in-out`,
          }}
        >
          <div className="text-center">
            <div className="font-serif text-lg font-semibold">{running ? step.label : 'Ready'}</div>
            {running && <div className="text-3xl font-bold tabular-nums">{count}</div>}
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-fg">
        {running ? `Cycle ${cycles + 1}` : 'Four counts in, hold, out, hold. Follow the circle.'}
      </p>

      {running ? (
        <button
          type="button"
          onClick={stop}
          className="transition-calm min-h-[44px] rounded-xl border border-border px-6 text-sm font-medium text-foreground hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Stop
        </button>
      ) : (
        <button
          type="button"
          onClick={start}
          className="transition-calm min-h-[44px] rounded-xl bg-primary px-6 text-sm font-semibold text-primary-fg hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Start
        </button>
      )}
    </div>
  );
}
