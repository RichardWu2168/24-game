// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatElapsedTime, usePuzzleTimer } from './usePuzzleTimer';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('puzzle timer', () => {
  it('starts with a puzzle and displays elapsed minutes and seconds', () => {
    const { result } = renderHook(() => usePuzzleTimer(true));
    expect(result.current.display).toBe('00:00');
    act(() => vi.advanceTimersByTime(65000));
    expect(result.current.display).toBe('01:05');
    expect(result.current.status).toBe('running');
  });

  it('captures the exact stop time between ticks and stays stopped', () => {
    const { result } = renderHook(() => usePuzzleTimer(true));
    act(() => vi.advanceTimersByTime(1234));
    act(() => result.current.stop('solved'));
    expect(result.current.elapsedMs).toBe(1234);
    expect(result.current.display).toBe('00:01');
    expect(result.current.status).toBe('solved');
    expect(vi.getTimerCount()).toBe(0);
    act(() => { vi.advanceTimersByTime(60000); result.current.stop('revealed'); });
    expect(result.current.elapsedMs).toBe(1234);
    expect(result.current.status).toBe('solved');
  });

  it('keeps revealed status when a subsequent solved stop is attempted', () => {
    const { result } = renderHook(() => usePuzzleTimer(true));
    act(() => vi.advanceTimersByTime(4321));
    act(() => { result.current.stop('revealed'); result.current.stop('solved'); });
    expect(result.current.status).toBe('revealed');
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.elapsedMs).toBe(4321);
  });

  it.each(['running', 'solved', 'revealed'] as const)('resets and starts a new puzzle from %s', status => {
    const { result } = renderHook(() => usePuzzleTimer(true));
    act(() => vi.advanceTimersByTime(9000));
    if (status !== 'running') act(() => result.current.stop(status));
    act(() => result.current.start());
    expect(result.current.status).toBe('running');
    expect(result.current.display).toBe('00:00');
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.display).toBe('00:02');
    expect(vi.getTimerCount()).toBe(1);
  });

  it('waits for an actual puzzle before starting', () => {
    const { result } = renderHook(() => usePuzzleTimer(false));
    act(() => { vi.advanceTimersByTime(5000); result.current.stop('solved'); });
    expect(result.current.status).toBe('idle');
    expect(result.current.display).toBe('00:00');
    expect(vi.getTimerCount()).toBe(0);
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.display).toBe('00:01');
  });

  it('cleans up intervals on unmount and during Strict Mode effect replay', () => {
    const { unmount } = renderHook(() => usePuzzleTimer(true), { wrapper: StrictMode });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restarts its interval when stop and start are batched together', () => {
    const { result } = renderHook(() => usePuzzleTimer(true));
    act(() => vi.advanceTimersByTime(3000));
    act(() => { result.current.stop('solved'); result.current.start(); });
    expect(result.current.display).toBe('00:00');
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.status).toBe('running');
    expect(result.current.display).toBe('00:02');
  });

  it('formats full minutes without wrapping at an hour', () => {
    expect(formatElapsedTime(999)).toBe('00:00');
    expect(formatElapsedTime(60000)).toBe('01:00');
    expect(formatElapsedTime(3600000)).toBe('60:00');
  });
});
