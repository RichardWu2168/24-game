import { useEffect, useRef, useState, type FormEvent } from 'react';
import { dealSolvableCards } from './game/puzzles';
import { assignCardIds, backspaceExpression, cardId } from './game/input';
import { validateAnswer } from './game/expressions';
import { generateSolutions } from './game/solver';
import type { Card, ValidationResult } from './game/types';
import { usePuzzleTimer } from './hooks/usePuzzleTimer';
import { useSuccessSound } from './hooks/useSuccessSound';

const suitNames = { '♣': 'clubs', '♦': 'diamonds', '♥': 'hearts', '♠': 'spades' };
const operators = [
  ['+', '+'], ['−', '-'], ['×', '*'], ['÷', '/'], ['(', '('], [')', ')'],
] as const;
const statusLabels = {
  idle: 'Waiting for puzzle', running: 'Solving', solved: 'Solved', revealed: 'Revealed',
};
interface ExpressionDraft { text: string; cardIds: string[] }

function createPuzzle(): { cards: Card[]; error: string | null } {
  try {
    return { cards: dealSolvableCards(), error: null };
  } catch (error) {
    return {
      cards: [],
      error: error instanceof Error ? error.message : 'Could not deal a puzzle. Please try again.',
    };
  }
}

export default function App() {
  const [puzzle, setPuzzle] = useState(createPuzzle);
  const { cards } = puzzle;
  const timer = usePuzzleTimer(cards.length === 4);
  const sound = useSuccessSound();
  const [draft, setDraft] = useState<ExpressionDraft>({ text: '', cardIds: [] });
  const [feedback, setFeedback] = useState<ValidationResult | null>(null);
  const [solutions, setSolutions] = useState<string[] | null>(null);
  const [shortcutsEnabled, setShortcutsEnabled] = useState(true);
  const gotItButton = useRef<HTMLButtonElement>(null);
  const checkButton = useRef<HTMLButtonElement>(null);
  const solutionsButton = useRef<HTMLButtonElement>(null);
  const newPuzzleButton = useRef<HTMLButtonElement>(null);
  const numbers = cards.map(card => card.value);
  const hasCards = cards.length === 4;

  useEffect(() => {
    const actions = new Map([
      ['Enter', checkButton], ['s', solutionsButton], ['n', newPuzzleButton],
    ]);
    function shortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof Element) {
        if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
        // Cards are selected with a mouse or by typing in the expression field.
        // Enter checks the answer instead of generating a native card click.
        if (event.key === 'Enter' && target.closest('button.card')) {
          event.preventDefault();
          if (shortcutsEnabled && !event.repeat) checkButton.current?.click();
          return;
        }
        // Got It is the sole button that retains native Space activation.
        if (event.key === ' ' && target.closest('button') === gotItButton.current) return;
        if (event.key === 'Enter' &&
            target.closest('button, a, summary, [role="button"], [role="switch"]')) return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        // Global Space activates only Got It, never the focused other button.
        if (shortcutsEnabled && !event.repeat) gotItButton.current?.click();
        return;
      }
      if (!shortcutsEnabled) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const button = actions.get(key);
      if (!button) return;
      event.preventDefault();
      if (!event.repeat) button.current?.click();
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [shortcutsEnabled]);

  function edit(text: string, preferred = draft.cardIds) {
    const assigned = assignCardIds(text, cards, preferred);
    if (assigned !== null) {
      setDraft({ text, cardIds: assigned });
      setFeedback(null);
    } else {
      setFeedback({ valid: false, message: 'Only use each available card once (maximum 200 characters).' });
    }
  }

  function append(value: string) {
    edit(`${draft.text.trimEnd()} ${value}`.trimStart());
  }

  function appendCard(card: Card) {
    edit(`${draft.text.trimEnd()} ${card.value}`.trimStart(), [...draft.cardIds, cardId(card)]);
  }

  function check(event: FormEvent) {
    event.preventDefault();
    const result = validateAnswer(draft.text, numbers);
    setFeedback(result);
    if (result.valid) {
      timer.stop('solved');
      sound.play();
    }
  }

  function clearExpression() {
    setDraft({ text: '', cardIds: [] });
    setFeedback(null);
  }

  function showSolutions() {
    timer.stop('revealed');
    if (solutions === null) setSolutions(generateSolutions(numbers));
  }

  function newPuzzle() {
    const next = createPuzzle();
    if (next.error) {
      setFeedback({ valid: false, message: next.error });
      return;
    }
    setPuzzle(next);
    timer.start();
    clearExpression();
    setSolutions(null);
  }

  return (
    <main>
      <header>
        <span className="eyebrow">FOUR CARDS. ONE TARGET.</span>
        <h1>Make <span>24</span>.</h1>
        <p>A little arithmetic. A fresh challenge.</p>
      </header>

      <section className="game" aria-label="24 Game">
        <div className="sound-control">
          <button
            type="button"
            className="secondary sound-toggle"
            aria-label="Success sound"
            aria-pressed={sound.enabled}
            onClick={sound.toggle}
          >
            Sound: {sound.enabled ? 'On' : 'Off'}
          </button>
        </div>
        <div className="puzzle-progress">
          <div>
            <span className="timer" role="timer" aria-label="Puzzle timer">{timer.display}</span>
            <span className="puzzle-status" aria-label="Puzzle state">{statusLabels[timer.status]}</span>
          </div>
          <button
            ref={gotItButton}
            aria-keyshortcuts={shortcutsEnabled ? 'Space' : undefined}
            type="button"
            disabled={timer.status !== 'running'}
            onClick={() => timer.stop('solved')}
          >
            Got It {shortcutsEnabled && <kbd aria-hidden="true">Space</kbd>}
          </button>
        </div>

        <div className="cards" aria-label="Your cards">
          {cards.map(card => {
            const id = cardId(card);
            const isRed = card.suit === '♥' || card.suit === '♦';
            return (
              <button
                type="button"
                className={`card ${isRed ? 'red' : ''}`}
                key={id}
                disabled={draft.cardIds.includes(id)}
                onClick={() => appendCard(card)}
                aria-label={`${card.value} of ${suitNames[card.suit]}`}
              >
                <span>{card.value}</span>
                <span className="suit" aria-hidden="true">{card.suit}</span>
              </button>
            );
          })}
        </div>

        <form onSubmit={check}>
          <label htmlFor="answer">Your expression</label>
          <div className="answer-row">
            <input
              id="answer"
              value={draft.text}
              onChange={event => edit(event.target.value)}
              placeholder="Click cards and operators, or type"
              maxLength={200}
              autoComplete="off"
              spellCheck={false}
              required
              disabled={!hasCards}
            />
            <button
              ref={checkButton}
              aria-keyshortcuts="Enter"
              type="submit"
              disabled={!hasCards}
            >
              Check answer <kbd aria-hidden="true">Enter</kbd>
            </button>
          </div>
        </form>

        <div className="expression-controls" aria-label="Expression controls">
          {operators.map(([label, token]) => (
            <button
              type="button"
              className="secondary"
              key={label}
              disabled={!hasCards}
              onClick={() => append(token)}
            >
              {label}
            </button>
          ))}
          <button type="button" className="secondary" onClick={() => edit(backspaceExpression(draft.text))}>
            Backspace
          </button>
          <button type="button" className="secondary" onClick={clearExpression}>Clear</button>
        </div>

        <div className={`feedback ${feedback?.valid ? 'success' : ''}`} role="status">
          {feedback?.message ?? puzzle.error}
        </div>

        <div className="actions">
          <button
            ref={solutionsButton}
            aria-keyshortcuts={shortcutsEnabled ? 'S' : undefined}
            className="secondary"
            disabled={!hasCards}
            onClick={showSolutions}
          >
            Show solutions {shortcutsEnabled && <kbd aria-hidden="true">S</kbd>}
          </button>
          <button
            ref={newPuzzleButton}
            aria-keyshortcuts={shortcutsEnabled ? 'N' : undefined}
            className="secondary"
            onClick={newPuzzle}
          >
            New puzzle {shortcutsEnabled && <kbd aria-hidden="true">N</kbd>}
          </button>
        </div>

        {solutions !== null && (
          <section className="solutions" aria-label="Solutions">
            <h2>{solutions.length ? `Valid solutions (${solutions.length})` : 'No integer-only solution'}</h2>
            {solutions.length ? (
              <ul>
                {solutions.map(solution => <li key={solution}><code>{solution} = 24</code></li>)}
              </ul>
            ) : (
              <p>This deal cannot make 24 with non-negative integer steps. Try a new puzzle.</p>
            )}
          </section>
        )}

        <p className="shortcut-help">
          Outside editable fields: Space — Got It · Enter — Check answer · S — Show solutions ·
          N — New puzzle. Space activates only Got It, never another button.
          Enter on a card checks the answer;
          Enter also checks while typing and activates other focused buttons normally.
        </p>
        <button
          type="button"
          className="secondary shortcut-toggle"
          aria-label="Keyboard shortcuts"
          aria-pressed={shortcutsEnabled}
          onClick={() => setShortcutsEnabled(enabled => !enabled)}
        >
          Shortcuts: {shortcutsEnabled ? 'On' : 'Off'}
        </button>
      </section>

      <aside>
        <h2>How to play</h2>
        <p>
          Click the cards and operator buttons, or type an expression. Use all four numbers
          exactly once to make 24. Combine them with <strong>+ − × ÷</strong> and parentheses.
          Type <code>*</code> for multiplication and <code>/</code> for division.
          Backspace removes the last number or symbol; Clear starts your expression again.
        </p>
        <p>
          Click <strong>Got It</strong> when you find a solution mentally to stop the timer.
          No expression is required. Checking a correct answer also stops the timer.
          Incorrect answers leave it running. Showing solutions first stops the timer and marks
          the puzzle revealed. A new puzzle starts a fresh timer.
        </p>
        <p>
          Every intermediate result must be a non-negative integer. Zero is allowed;
          negative numbers, fractions, and division by zero are not. Suits distinguish
          cards; only their numbers enter your expression.
        </p>
      </aside>
    </main>
  );
}
