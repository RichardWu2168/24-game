// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { dealSolvableCards } from './game/puzzles';

vi.mock('./game/puzzles', () => ({ dealSolvableCards: vi.fn() }));
const deal = vi.mocked(dealSolvableCards);
beforeEach(() => {
  deal.mockReset();
  deal.mockReturnValue([{ value: 1, suit: '♣' }, { value: 2, suit: '♦' }, { value: 3, suit: '♥' }, { value: 4, suit: '♠' }]);
});

describe('puzzle timing in the UI', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  const clock = () => screen.getByRole('timer', { name: 'Puzzle timer' }).textContent;
  const puzzleState = () => screen.getByLabelText('Puzzle state').textContent;

  it('stops with Got It without an expression and preserves the time when solutions are shown', () => {
    render(<App />);
    act(() => vi.advanceTimersByTime(65000));
    expect(clock()).toBe('01:05');
    expect(input().value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Got It' }));
    expect(puzzleState()).toBe('Solved');
    expect((screen.getByRole('button', { name: 'Got It' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Show solutions' }));
    act(() => vi.advanceTimersByTime(10000));
    expect(clock()).toBe('01:05');
    expect(puzzleState()).toBe('Solved');
  });

  it('keeps running after incorrect answers and preserves revealed status after correct answers', () => {
    render(<App />);
    fireEvent.change(input(), { target: { value: '1+2+3+4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(screen.getByRole('status').textContent).toContain('not 24');
    act(() => vi.advanceTimersByTime(3000));
    expect(clock()).toBe('00:03');
    expect(puzzleState()).toBe('Solving');
    fireEvent.click(screen.getByRole('button', { name: 'Show solutions' }));
    expect(puzzleState()).toBe('Revealed');
    fireEvent.change(input(), { target: { value: '(1+2+3)*4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(screen.getByRole('status').textContent).toContain('Correct!');
    expect(puzzleState()).toBe('Revealed');
    fireEvent.click(screen.getByRole('button', { name: 'Got It' }));
    act(() => vi.advanceTimersByTime(5000));
    expect(clock()).toBe('00:03');
    expect(puzzleState()).toBe('Revealed');
    fireEvent.click(screen.getByRole('button', { name: /New puzzle/ }));
    expect(clock()).toBe('00:00');
    expect(puzzleState()).toBe('Solving');
    act(() => vi.advanceTimersByTime(1000));
    expect(clock()).toBe('00:01');
  });

  it('stops on a correct checked answer without Got It and preserves the final time', () => {
    render(<App />);
    act(() => vi.advanceTimersByTime(12340));
    fireEvent.change(input(), { target: { value: '(1+2+3)*4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(clock()).toBe('00:12');
    expect(puzzleState()).toBe('Solved');
    expect((screen.getByRole('button', { name: 'Got It' }) as HTMLButtonElement).disabled).toBe(true);
    act(() => vi.advanceTimersByTime(5000));
    fireEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show solutions' }));
    expect(clock()).toBe('00:12');
    expect(puzzleState()).toBe('Solved');
    fireEvent.click(screen.getByRole('button', { name: 'New puzzle' }));
    expect(clock()).toBe('00:00');
    expect(puzzleState()).toBe('Solving');
  });

  it('does not reset the timer if dealing a new puzzle fails', () => {
    render(<App />);
    act(() => vi.advanceTimersByTime(4000));
    deal.mockImplementationOnce(() => { throw new Error('Please retry.'); });
    fireEvent.click(screen.getByRole('button', { name: /New puzzle/ }));
    act(() => vi.advanceTimersByTime(1000));
    expect(clock()).toBe('00:05');
    expect(puzzleState()).toBe('Solving');
  });
});
afterEach(cleanup);
const input = () => screen.getByRole('textbox', { name: 'Your expression' }) as HTMLInputElement;

describe('keyboard shortcuts', () => {
  it('uses Space for Got It, S for solutions, and N for a fresh running puzzle', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard(' ');
    expect(screen.getByLabelText('Puzzle state').textContent).toBe('Solved');
    expect(input().value).toBe('');
    await user.keyboard('s');
    expect(screen.getByRole('region', { name: 'Solutions' })).toBeTruthy();
    expect(screen.getByLabelText('Puzzle state').textContent).toBe('Solved');
    await user.keyboard('n');
    expect(deal).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('Puzzle state').textContent).toBe('Solving');
    expect(screen.getByRole('timer').textContent).toBe('00:00');
    expect(screen.queryByRole('region', { name: 'Solutions' })).toBeNull();
    await user.keyboard('S');
    expect(screen.getByLabelText('Puzzle state').textContent).toBe('Revealed');
    await user.keyboard(' ');
    expect(screen.getByLabelText('Puzzle state').textContent).toBe('Revealed');
  });

  it('checks the latest expression with Enter both in the input and outside it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(input(), '(1+2+3)*4{Enter}');
    expect(screen.getByRole('status').textContent).toContain('Correct!');
    fireEvent.change(input(), { target: { value: '1+2+3+4' } });
    input().blur();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('status').textContent).toContain('not 24');
    expect(screen.getByLabelText('Puzzle state').textContent).toBe('Solved');
  });

  it('preserves spaces and does not trigger letter shortcuts while editing', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(input(), '1 + 2');
    expect(input().value).toBe('1 + 2');
    await user.keyboard('sn');
    expect(deal).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('region', { name: 'Solutions' })).toBeNull();
    expect(screen.getByLabelText('Puzzle state').textContent).toBe('Solving');
  });

  it('ignores held keys, composition events, and modifier combinations', () => {
    render(<App />);
    fireEvent.keyDown(window, { key: 'n', repeat: true });
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'n', metaKey: true });
    fireEvent.keyDown(window, { key: 's', altKey: true });
    fireEvent.keyDown(window, { key: ' ', isComposing: true });
    expect(deal).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Puzzle state').textContent).toBe('Solving');
    expect(screen.queryByRole('region', { name: 'Solutions' })).toBeNull();
  });

  it('preserves native Enter on other buttons and reserves Space for Got It', async () => {
    const user = userEvent.setup();
    render(<App />);
    screen.getByRole('button', { name: 'Show solutions' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Puzzle state').textContent).toBe('Revealed');
    await user.keyboard('n');
    screen.getByRole('button', { name: 'New puzzle' }).focus();
    await user.keyboard(' ');
    expect(screen.getByLabelText('Puzzle state').textContent).toBe('Solved');
    expect(deal).toHaveBeenCalledTimes(2);
  });

  it('uses Space for Got It when sound is focused, while Enter still toggles sound', async () => {
    const user = userEvent.setup();
    render(<App />);
    const toggle = screen.getByRole('button', { name: 'Success sound' });
    toggle.focus();
    await user.keyboard(' ');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Puzzle state').textContent).toBe('Solved');
    await user.keyboard(' ');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    await user.keyboard('{Enter}');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('checks instead of selecting a focused number card with Enter', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(input(), '1+2+3');
    const card = screen.getByRole('button', { name: '4 of spades' }) as HTMLButtonElement;
    card.focus();
    await user.keyboard('{Enter}');
    expect(input().value).toBe('1+2+3');
    expect(card.disabled).toBe(false);
    expect(document.activeElement).toBe(card);
    expect(screen.getByRole('status').textContent).toContain('all four');
    expect(screen.getByLabelText('Puzzle state').textContent).toBe('Solving');
    await user.click(card);
    expect(input().value).toBe('1+2+3 4');
    expect(card.disabled).toBe(true);
  });

  it('does not select a focused card with Space and keeps the stopped time frozen', async () => {
    const user = userEvent.setup();
    render(<App />);
    const card = screen.getByRole('button', { name: '1 of clubs' }) as HTMLButtonElement;
    card.focus();
    await user.keyboard(' ');
    expect(input().value).toBe('');
    expect(card.disabled).toBe(false);
    expect(screen.getByLabelText('Puzzle state').textContent).toBe('Solved');
    await user.keyboard(' ');
    expect(input().value).toBe('');
    expect(screen.getByLabelText('Puzzle state').textContent).toBe('Solved');
  });

  it('blocks native card selection and other Space actions with shortcuts off', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    const card = screen.getByRole('button', { name: '1 of clubs' }) as HTMLButtonElement;
    card.focus();
    await user.keyboard('{Enter} ');
    expect(input().value).toBe('');
    expect(card.disabled).toBe(false);
    expect(screen.getByLabelText('Puzzle state').textContent).toBe('Solving');
    const sound = screen.getByRole('button', { name: 'Success sound' });
    sound.focus();
    await user.keyboard(' ');
    expect(sound.getAttribute('aria-pressed')).toBe('true');
    await user.keyboard('{Enter}');
    expect(sound.getAttribute('aria-pressed')).toBe('false');
    screen.getByRole('button', { name: 'Got It' }).focus();
    await user.keyboard(' ');
    expect(screen.getByLabelText('Puzzle state').textContent).toBe('Solved');
  });

  it.each([true, false])('Space clicks only Got It with shortcuts enabled=%s', async enabled => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    if (!enabled) fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    const clicked = vi.fn();
    const gotIt = screen.getByRole('button', { name: 'Got It' });
    container.addEventListener('click', clicked);
    for (const button of screen.getAllByRole('button')) {
      button.focus();
      await user.keyboard(' ');
    }
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(clicked.mock.calls[0][0].target).toBe(gotIt);
    expect(input().value).toBe('');
    expect(screen.getByRole('button', { name: 'Success sound' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Puzzle state').textContent).toBe('Solved');
    container.removeEventListener('click', clicked);
  });

  it('can disable shortcuts while keeping native controls and form submission working', async () => {
    const user = userEvent.setup();
    render(<App />);
    const toggle = screen.getByRole('button', { name: 'Keyboard shortcuts' });
    await user.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    toggle.blur();
    await user.keyboard('sn ');
    expect(deal).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Puzzle state').textContent).toBe('Solving');
    expect(screen.queryByRole('region', { name: 'Solutions' })).toBeNull();
    await user.type(input(), '(1+2+3)*4{Enter}');
    expect(screen.getByRole('status').textContent).toContain('Correct!');
    await user.click(toggle);
    toggle.blur();
    await user.keyboard('s');
    expect(screen.getByLabelText('Puzzle state').textContent).toBe('Solved');
  });

  it('respects disabled actions and removes the listener on unmount', () => {
    deal.mockImplementationOnce(() => { throw new Error('Please retry.'); });
    const { unmount } = render(<App />);
    fireEvent.keyDown(window, { key: ' ' });
    fireEvent.keyDown(window, { key: 's' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByLabelText('Puzzle state').textContent).toBe('Waiting for puzzle');
    expect(screen.queryByRole('region', { name: 'Solutions' })).toBeNull();
    unmount();
    fireEvent.keyDown(window, { key: 'n' });
    expect(deal).toHaveBeenCalledTimes(1);
  });
});

describe('expression controls', () => {
  it('permits correcting a multi-digit card in the middle of an expression', async () => {
    deal.mockReturnValue([{ value: 10, suit: '♣' }, { value: 2, suit: '♦' }, { value: 3, suit: '♥' }, { value: 4, suit: '♠' }]);
    const user = userEvent.setup();
    render(<App />);
    await user.type(input(), '10+2');
    input().setSelectionRange(2, 2);
    await user.keyboard('{Backspace}');
    expect(input().value).toBe('1+2');
    await user.keyboard('0');
    expect(input().value).toBe('10+2');
    input().setSelectionRange(0, 2);
    await user.keyboard('3');
    expect(input().value).toBe('3+2');
  });

  it('disables the duplicate card actually clicked and releases it on Backspace and Clear', async () => {
    deal.mockReturnValue([{ value: 5, suit: '♣' }, { value: 5, suit: '♥' }, { value: 7, suit: '♣' }, { value: 7, suit: '♥' }]);
    const user = userEvent.setup();
    render(<App />);
    const first = screen.getByRole('button', { name: '5 of clubs' }) as HTMLButtonElement;
    const second = screen.getByRole('button', { name: '5 of hearts' }) as HTMLButtonElement;
    await user.click(second);
    expect(second.disabled).toBe(true);
    expect(first.disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: '+' }));
    expect(second.disabled).toBe(true);
    await user.click(first);
    expect(first.disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Backspace' }));
    expect(first.disabled).toBe(false);
    expect(second.disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(second.disabled).toBe(false);
  });
  it('constructs and checks a solution with cards, operators, and parentheses', async () => {
    const user = userEvent.setup();
    render(<App />);
    for (const name of ['(', '1 of clubs', '+', '2 of diamonds', '+', '3 of hearts', ')', '×', '4 of spades']) {
      await user.click(screen.getByRole('button', { name }));
    }
    expect(input().value).toBe('( 1 + 2 + 3 ) * 4');
    expect((screen.getByRole('button', { name: '1 of clubs' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(screen.getByRole('status').textContent).toContain('Correct!');
    await user.click(screen.getByRole('button', { name: 'Backspace' }));
    expect(input().value).toBe('( 1 + 2 + 3 ) *');
    expect((screen.getByRole('button', { name: '4 of spades' }) as HTMLButtonElement).disabled).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(input().value).toBe('');
    expect(screen.getByRole('status').textContent).toBe('');
  });
  it('handles duplicate values and prevents excess keyboard and mouse usage', async () => {
    deal.mockReturnValue([{ value: 5, suit: '♣' }, { value: 5, suit: '♥' }, { value: 7, suit: '♣' }, { value: 7, suit: '♥' }]);
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '5 of clubs' }));
    await user.click(screen.getByRole('button', { name: '+' }));
    await user.click(screen.getByRole('button', { name: '5 of hearts' }));
    expect(input().value).toBe('5 + 5');
    await user.click(screen.getByRole('button', { name: '5 of clubs' }));
    expect(input().value).toBe('5 + 5');
    await user.type(input(), ' + 5');
    expect(input().value).toBe('5 + 5 + ');
    await user.click(screen.getByRole('button', { name: 'Backspace' }));
    await user.click(screen.getByRole('button', { name: 'Backspace' }));
    expect((screen.getByRole('button', { name: '5 of hearts' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('supports keyboard answers and resets expression and solutions on a new deal', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(input(), '(1+2+3)*4');
    await user.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(screen.getByRole('status').textContent).toContain('Correct!');
    await user.click(screen.getByRole('button', { name: 'Show solutions' }));
    expect(screen.getByRole('region', { name: 'Solutions' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /New puzzle/ }));
    expect(input().value).toBe('');
    expect(screen.queryByRole('region', { name: 'Solutions' })).toBeNull();
  });
  it('maps subtraction and division buttons to validator operators', async () => {
    deal.mockReturnValue([{ value: 8, suit: '♣' }, { value: 2, suit: '♦' }, { value: 9, suit: '♥' }, { value: 3, suit: '♠' }]);
    const user = userEvent.setup();
    render(<App />);
    for (const name of ['(', '8 of clubs', '÷', '2 of diamonds', ')', '×', '(', '9 of hearts', '−', '3 of spades', ')']) {
      await user.click(screen.getByRole('button', { name }));
    }
    await user.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(screen.getByRole('status').textContent).toContain('Correct!');
  });
  it('reports invalid answers without treating them as solved', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(input(), '(3/2)*(4+1)');
    await user.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(screen.getByRole('status').textContent).toContain('integer');
  });
  it('handles deal failure on startup and lets the player retry', async () => {
    deal.mockImplementationOnce(() => { throw new Error('Please try New puzzle again.'); });
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('status').textContent).toContain('Please try');
    expect(input().disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: /New puzzle/ }));
    expect(input().disabled).toBe(false);
  });
  it('preserves the current puzzle on retry exhaustion', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(input(), '1+2');
    deal.mockImplementationOnce(() => { throw new Error('Please try New puzzle again.'); });
    await user.click(screen.getByRole('button', { name: /New puzzle/ }));
    expect(input().value).toBe('1+2');
    expect(screen.getByRole('status').textContent).toContain('Please try');
  });
});
