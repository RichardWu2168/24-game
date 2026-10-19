// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App';

vi.mock('./game/puzzles', () => ({
  dealSolvableCards: () => [{ value: 1, suit: '♣' }, { value: 2, suit: '♦' }, { value: 3, suit: '♥' }, { value: 4, suit: '♠' }],
}));

const contexts: FakeAudioContext[] = [];
class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  oscillator = { type: '', frequency: { setValueAtTime: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null };
  gain = { gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn() };
  createOscillator = () => this.oscillator;
  createGain = () => this.gain;
  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockImplementation(() => { this.state = 'closed'; return Promise.resolve(); });
  constructor() { contexts.push(this); }
}

beforeEach(() => { contexts.length = 0; vi.stubGlobal('AudioContext', FakeAudioContext); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function check(expression: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Your expression' }), { target: { value: expression } });
  fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
}

describe('success sound', () => {
  it('plays a short chime only for a validated correct answer', () => {
    render(<App />);
    expect(contexts).toHaveLength(0);
    check('1+2+3+4');
    fireEvent.click(screen.getByRole('button', { name: 'Got It' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show solutions' }));
    expect(contexts).toHaveLength(0);
    check('(1+2+3)*4');
    expect(contexts).toHaveLength(1);
    expect(contexts[0].oscillator.start).toHaveBeenCalledWith(0);
    expect(contexts[0].oscillator.stop).toHaveBeenCalledWith(0.4);
    expect(screen.getByRole('status').textContent).toContain('Correct!');
    contexts[0].oscillator.onended?.();
    expect(contexts[0].close).toHaveBeenCalledOnce();
  });

  it('toggles off and back on, stopping active audio and retaining mute across puzzles', () => {
    render(<App />);
    const toggle = screen.getByRole('button', { name: 'Success sound' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    check('(1+2+3)*4');
    fireEvent.click(toggle);
    expect(toggle.textContent).toBe('Sound: Off');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(contexts[0].close).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'New puzzle' }));
    check('(1+2+3)*4');
    expect(contexts).toHaveLength(1);
    fireEvent.click(toggle);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(contexts).toHaveLength(2);
  });

  it('releases audio on a repeated correct answer and on unmount', () => {
    const { unmount } = render(<App />);
    check('(1+2+3)*4');
    check('(1+2+3)*4');
    expect(contexts[0].close).toHaveBeenCalledOnce();
    unmount();
    expect(contexts[1].close).toHaveBeenCalledOnce();
  });

  it('keeps validation working if browser audio is unsupported or fails', () => {
    vi.stubGlobal('AudioContext', undefined);
    render(<App />);
    check('(1+2+3)*4');
    expect(screen.getByRole('status').textContent).toContain('Correct!');
    vi.stubGlobal('AudioContext', class { constructor() { throw new Error('Audio unavailable'); } });
    check('(1+2+3)*4');
    expect(screen.getByRole('status').textContent).toContain('Correct!');
  });

  it('handles rejected resume promises without losing correct-answer feedback', async () => {
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      resume = vi.fn().mockRejectedValue(new Error('Audio blocked'));
    });
    render(<App />);
    await act(async () => check('(1+2+3)*4'));
    expect(contexts[0].close).toHaveBeenCalledOnce();
    expect(screen.getByRole('status').textContent).toContain('Correct!');
  });

  it('keeps sound muted when a pending resume resolves after muting', async () => {
    let resolveResume!: () => void;
    const pending = new Promise<void>(resolve => { resolveResume = resolve; });
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      resume = vi.fn().mockReturnValue(pending);
    });
    render(<App />);
    check('(1+2+3)*4');
    fireEvent.click(screen.getByRole('button', { name: 'Success sound' }));
    await act(async () => resolveResume());
    check('(1+2+3)*4');
    expect(contexts).toHaveLength(1);
    expect(contexts[0].close).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Success sound' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('does not close a newer chime when an older pending resume fails', async () => {
    let rejectResume!: (error: Error) => void;
    const pending = new Promise<void>((_, reject) => { rejectResume = reject; });
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      resume = vi.fn().mockImplementation(() => contexts.length === 1 ? pending : Promise.resolve());
    });
    render(<App />);
    check('(1+2+3)*4');
    check('(1+2+3)*4');
    await act(async () => rejectResume(new Error('Old context closed')));
    expect(contexts[0].close).toHaveBeenCalledOnce();
    expect(contexts[1].close).not.toHaveBeenCalled();
  });
});
