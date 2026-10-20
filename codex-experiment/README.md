# 24 Game

A standalone React + TypeScript + Vite learning project. Requires Node.js 22.12+ (22.x), 24.x, or 26+ and npm. Verified with Node.js 24.22.0.

Run these commands from `codex-experiment`:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite.

```sh
npm test          # Run all logic, UI, and timer tests
npm run build    # Type-check and create dist/
npm run preview  # Serve the production build locally
```

## Rules and controls

A short success chime plays when **Check answer** validates a correct expression, including when using Enter. Use **Sound: On / Off** to mute or enable it; muting also stops a currently playing chime. The setting stays in effect across new puzzles during the current session and defaults to on when the app reloads. Got It and Show solutions do not play the success chime. Audio is generated locally using the browser Web Audio API, with no downloaded sound files.

Use all four card values exactly once to make 24. Click cards, operators, and parentheses to build an expression, or type `+`, `-`, `*`, `/`, and parentheses, then choose **Check answer**. The input field also displays the expression as it is built. Used cards become unavailable; duplicate values can be used as many times as they occur in the deal, and clicked cards retain their suit identity. Temporary prefixes are allowed throughout an expression so you can edit a multi-digit card in the middle; Check answer still requires the exact dealt values. Each entered number reserves one available card, including while incomplete. **Backspace** removes the last whole number or symbol, while **Clear** empties the expression. The keyboard Backspace key retains its normal text-editing behavior. Standard operator precedence applies. Number literals must match the dealt cards; concatenation, decimals, unary signs, and other operators are unsupported. Zero can result from operations; negative results are forbidden.

Every operation must produce a non-negative integer, including every intermediate step. Division is permitted only when exact, and division by zero is forbidden. All evaluation and solution arithmetic uses BigInt, avoiding floating-point rounding. Validation and solution generation share these checks. For cards `[2, 4, 6, 8]`, `((2 + 6) * 4) - 8` and `(6 * 8) / (4 - 2)` are valid, while `8 - ((2 - 6) * 4)` is rejected at `2 - 6` even though its final value would be 24.

**Show solutions** lists valid expressions. **New puzzle** deals four distinct cards from a 40-card deck (1–10 in four suits), clears the answer and feedback, and hides previous solutions. Repeated values are allowed with different suits. Suits identify physical cards but do not affect arithmetic. Every deal is checked by the integer-only solver before display. Unsolvable deals are discarded, with a limit of 100 attempts. If that limit is reached, a retry message appears and the current puzzle is preserved. If the initial deal fails, use **New puzzle** to retry.

**Puzzle timer:** Each successful deal starts at `00:00` and displays elapsed time as `MM:SS`. Click **Got It** when you find a solution mentally; it immediately freezes the time and marks the puzzle **Solved**, without requiring an expression. Checking a correct answer also stops the timer and marks the puzzle Solved, even if Got It was not clicked; this elapsed time includes typing. Incorrect answers leave the timer running. A correct answer checked after solutions were revealed preserves the Revealed state and its stopped time. Showing solutions first freezes the time and marks the puzzle **Revealed**; Got It cannot change that outcome afterward. Showing solutions after Got It preserves the solved outcome and time. A successful new deal resets and starts the timer; a failed deal preserves the current state. No timer runs until a puzzle has been dealt.

## Keyboard controls

With shortcuts enabled, these keys work outside editable fields:

| Key | Action |
| --- | --- |
| Space | Fire a click event only on **Got It**, stopping the timer if the puzzle is still running. |
| Enter | **Check answer**, including when a number card has focus. |
| S | **Show solutions**. |
| N | **New puzzle**. |

**Space never fires a click event on any button except Got It.** This includes number cards, operators, Check answer, Show solutions, New puzzle, Sound, and the shortcuts toggle. When another button has focus, Space uses the Got It shortcut instead of clicking that focused button. A stopped or revealed puzzle cannot be changed by pressing Space again.

Inside the expression field, Space inserts a normal space and Enter submits the answer. Players can select cards with mouse clicks or type their numbers into the expression field. Enter on a focused number card does not select the card. Enter on other focused buttons activates them normally, including the sound toggle. Tab navigation remains available.

Use **Shortcuts: On / Off** to disable global shortcuts. When shortcuts are off, Space activates Got It only when Got It itself has focus; Space does nothing on other buttons. Enter on a number card also does nothing, while normal Enter activation of other buttons and expression submission remain available. Held-key repeats and Ctrl/Alt/Meta combinations do not trigger global shortcuts. Shortcut labels appear on the buttons while enabled.

## Code organization

- `src/game/`: card types, exact arithmetic, recursive-descent expression parser, recursive solution search, and card dealing, independent of React.
- `src/game/game.test.ts`: validation, arithmetic, solution deduplication, solvable dealing, bounded retries, and expression editing tests using Vitest.
- `src/game/solver.test.ts`: independent solvability checks for all 715 four-value multisets, independent evaluation of generated expressions, permutation invariance, early-exit search, and unexpected-error propagation.
- `src/game/input.ts`: shared number-usage checks and whole-item deletion for expression editing.
- `src/App.test.tsx`: UI tests using React Testing Library, user-event, and jsdom for mouse/keyboard input, card availability, answer checking, reset, and deal failure recovery.
- `src/hooks/usePuzzleTimer.ts` and its tests: monotonic elapsed timing, immediate stop, reset, stopped-state guards, and interval cleanup.
- `src/hooks/useSuccessSound.ts` and `src/Sound.test.tsx`: success audio, mute behavior, cleanup, and delayed/rejected audio startup.
- `src/App.tsx` and `src/styles.css`: responsive interface with accessible labels and answer feedback.

The solver searches pairs of intermediate expressions and considers both orders for subtraction and division. It deduplicates using structural identities that normalize commutative ordering, associative grouping, and signs (including products or quotients of two reversed differences). Multiplication/division chains become sorted numerator and denominator factors, so `((2 + 4) * 8) / 2`, `((2 + 4) / 2) * 8`, and `(2 + 4) * (8 / 2)` share one identity. Nested division reverses numerator/denominator roles. Sums remain structural factors rather than being replaced with their numeric results. Only expressions whose actual intermediate steps pass integer arithmetic checks are retained; the normalized identity is never evaluated as a replacement expression. It intentionally preserves distinct approaches rather than expanding, distributing, or cancelling terms to make every result share the same identity.

Deal verification uses the same search with an early exit at the first valid solution. Showing solutions enumerates the groups once per puzzle and reuses that list on subsequent requests. Expected arithmetic rejections skip a move; unexpected solver errors propagate instead of being mistaken for unsolvable deals. The full test suite includes an exhaustive bounded solver check and may take around 20 seconds, depending on your machine.
