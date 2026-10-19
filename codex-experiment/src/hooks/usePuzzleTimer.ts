import { useEffect, useRef, useState } from 'react';

type PuzzleStatus = 'idle' | 'running' | 'solved' | 'revealed';
interface TimerState { status: PuzzleStatus; startedAt: number; elapsedMs: number; run: number }

export function formatElapsedTime(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function usePuzzleTimer(initiallyActive: boolean) {
  const [state, setState] = useState<TimerState>(() => ({
    status: initiallyActive ? 'running' : 'idle', startedAt: performance.now(), elapsedMs: 0, run: 0,
  }));
  const current = useRef(state);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTick() {
    if (interval.current !== null) clearInterval(interval.current);
    interval.current = null;
  }

  useEffect(() => {
    if (state.status !== 'running') return;
    interval.current = setInterval(() => {
      if (current.current.status !== 'running') return;
      const next = { ...current.current, elapsedMs: performance.now() - current.current.startedAt };
      if (Math.floor(next.elapsedMs / 1000) !== Math.floor(current.current.elapsedMs / 1000)) {
        current.current = next;
        setState(next);
      }
    }, 100);
    return clearTick;
  }, [state.status, state.run]);

  function start() {
    const next: TimerState = { status: 'running', startedAt: performance.now(), elapsedMs: 0, run: current.current.run + 1 };
    current.current = next;
    setState(next);
  }

  function stop(status: 'solved' | 'revealed') {
    if (current.current.status !== 'running') return;
    const next = { ...current.current, status, elapsedMs: performance.now() - current.current.startedAt };
    current.current = next;
    clearTick();
    setState(next);
  }

  return { status: state.status, elapsedMs: state.elapsedMs, display: formatElapsedTime(state.elapsedMs), start, stop };
}
