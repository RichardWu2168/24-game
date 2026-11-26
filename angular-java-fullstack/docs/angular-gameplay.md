# Angular gameplay screen

This milestone replaces the generated welcome page with the playable Math 24
screen. It uses the existing Java game API and PostgreSQL schema; it does not
add another expression evaluator or solver in the browser.

## Play flow

1. Open the game and choose **Start puzzle**. A guest session is retained in
   this browser; there is no account or sign-in form.
2. Think about the four displayed cards. The clock begins only after those
   cards have rendered and the page is visible.
3. Choose **Got It!** when you have a solution. The clock freezes immediately,
   before any request to the backend completes, and answer entry receives focus.
4. Type the expression, or insert cards and operators with the on-screen
   controls. Press Enter or choose **Check answer**.
5. An incorrect answer keeps the original thinking time and the draft. Correct
   the expression and try again. A successful answer shows the interpretation
   accepted by Java, including any automatically added parentheses.
6. Choose **Next puzzle** after solving, revealing, or explicitly skipping the
   current puzzle.

The player can reveal or skip a puzzle without solving it. These actions finish
that round. Reaching the thinking-time limit does not finish it.

### Expression rules and assistance

Use each of the four card occurrences once. Addition, subtraction,
multiplication, division, and parentheses are allowed. Every intermediate
result must be a nonnegative whole number. Java checks these rules and the
final result of 24.

For a submission without explicit parentheses, Java first checks normal
precedence, then tries groupings while preserving the numbers and operators in
the submitted order. For example, `3+1*7-1` may be accepted as `(3+1)*(7-1)`.
The screen displays the accepted expression separately and explains when
parentheses were added. It never presents the original ungrouped expression as
an equality to 24. Explicit parentheses are respected as entered.

## Timing

The browser records a start timestamp when the round becomes visible and
playable. Display updates recalculate elapsed time from that timestamp; they do
not count timer callbacks. Loading the API or initially opening a hidden tab
does not consume thinking time.

Once started, the elapsed duration includes time away from the page and time
spent refreshing it. **Got It!** records the duration at the click, rounded to
whole milliseconds and limited to 30 minutes. The timer remains fixed while
entering an answer, receiving feedback, or correcting a typo.

At exactly 1,800,000 milliseconds, the browser captures the capped duration.
The screen explains the limit and enables answering. A capped solve still
counts as solved, but the backend excludes that duration from average thinking
time. The timer is not a live region, so screen readers are not interrupted by
constant time announcements.

Changing the device clock can affect a running timestamp-based timer. This is
consistent with the agreed casual, trusted-player design; there is no ranking
or server-based anti-cheat clock.

## Browser storage and recovery

The guest credential and a versioned round journal use separate local-storage
keys. The browser creates and saves the credential before initializing the
session. It sends that credential only on explicit game API requests, in the
Authorization header. It does not put it in URLs or display it in the game.

The journal retains the current round, its browser start or captured duration,
the draft, the latest answer feedback, and at most one pending action. A capture
and pending action are persisted before the HTTP request is sent. Completed
rounds are retained too, so refreshing a solved or revealed screen preserves
that result instead of silently dealing a new puzzle.

An interrupted request can have succeeded on the server even if the browser did
not receive the response. **Retry connection** resends the original operation
identifier and original payload. Answer submissions are immutable while their
outcome is unknown. Other mutations wait until the earlier action has been
resolved. On reload, the browser retries the saved action, then reads fresh
server state because an idempotent replay may return an older saved snapshot.

The store uses round identity, request lifecycle, and round revision to avoid
applying stale responses to a newer puzzle. Statistics load separately; a
statistics failure does not turn a successful answer into a failed answer.

If local storage is unavailable, the screen keeps the current view and blocks
new unsaved mutations with a retry message. A damaged round journal can be
replaced while keeping a valid guest credential. Clearing browser storage or
using a different browser loses the guest credential, unsent timing, and local
draft; there is no account-based recovery in this project.

### Multiple tabs

One tab at a time edits this browser's game. The main implementation uses a Web
Lock. A second tab shows a friendly message and lets the player retry after
closing the first. This prevents two tabs from overwriting the same pending
request or draft.

For older browsers without Web Locks, a short local-storage lease provides a
best-effort fallback. The store checks ownership before writing. An expired or
lost lease blocks that tab until it can safely reacquire ownership. That
fallback is not an atomic cross-tab transaction; use one gameplay tab in such
browsers.

## Code boundaries

| File | Responsibility |
| --- | --- |
| `frontend/src/app/features/game/game-screen.ts` and its HTML/SCSS | Presentation, focus, input controls, feedback, rules, and statistics |
| `frontend/src/app/features/game/game.store.ts` | Signal state, timing, persistence, request sequencing, and restoration |
| `frontend/src/app/core/game-api.ts` | Typed HTTP requests, scoped authorization, and 10-second timeout |
| `frontend/src/app/core/game.models.ts` | API response types and durable pending-command union |
| `frontend/src/app/core/game-storage.ts` | Canonical guest credentials and validation of restored browser state |
| `frontend/src/app/core/game-browser.ts` | Injectable clock, storage, visibility, crypto, and tab ownership |
| `frontend/proxy.conf.json` | Local development API proxy |

No new npm package is required. The screen uses the Angular, Forms, HttpClient,
RxJS, and testing tools already present in the committed lockfile. The existing
Java engine, database migrations, and endpoint contract remain unchanged.

## Run on Windows

Keep Docker Desktop running. In a PowerShell terminal:

```powershell
Set-Location 'C:/Projects/24-game/angular-java-fullstack'
./scripts/Invoke-Database.ps1 -Task Start
./scripts/Invoke-Backend.ps1 -Task Run
```

In a second terminal:

```powershell
Set-Location 'C:/Projects/24-game/angular-java-fullstack/frontend'
npm.cmd start
```

Open [http://localhost:4200/](http://localhost:4200/). Angular sends `/api/**`
through its development proxy to `http://127.0.0.1:8080`. Restart Angular after
changing the proxy file. If the screen cannot connect, verify the backend at
[http://localhost:8080/actuator/health](http://localhost:8080/actuator/health).

Use the same browser origin during testing. `localhost:4200` and
`127.0.0.1:4200` have different browser storage and therefore different guests.

## Verify

From the frontend directory:

```powershell
npm.cmd test -- --watch=false
npm.cmd run build
```

The tests use controlled clocks, storage, and HTTP responses; PostgreSQL and
Java do not need to run for these commands. They cover the consequential timing,
restoration, retry, and screen behavior rather than duplicating the Java solver
tests.

The implemented suite has **55 passing cases**: 10 screen cases, 11 HTTP cases,
4 stored-state cases, and 30 game-state/recovery cases. The production build
passed with approximately 291 kB of initial files and 78 kB estimated transfer.
Live Chrome checks used the real Java API and PostgreSQL, including an API
shutdown, a refresh with an answer pending, and a successful retry after the
API restarted. Narrow-layout checks included a 320-pixel viewport with a
classic scrollbar, leaving 305 pixels for the content without horizontal
overflow. These workspace checks complement the Windows verification below.

For an interactive check with Java and PostgreSQL running:

1. Start a puzzle and confirm all four cards appear before the clock starts.
2. Choose **Got It!**, enter an incorrect expression, then correct it. Confirm
   the thinking time and draft are retained.
3. Refresh while thinking and again after capturing a time. Confirm the same
   puzzle returns and the captured time stays fixed.
4. Solve, reveal, and skip separate rounds. Each finished round should offer
   **Next puzzle**; refresh should preserve a finished result.
5. Stop the backend, try an action, restart the backend, and choose
   **Retry connection**. Confirm the puzzle and typed answer are retained.
6. Open a second tab. It should explain that another tab is already playing.
   Close the first tab and retry in the second.
7. Try keyboard-only play and a narrow browser window. Cards, input, action
   buttons, and feedback should remain readable and reachable.

The automated timer tests cover the 30-minute cap without requiring a real
30-minute wait. A separate history page, richer statistics, and free production
hosting remain later milestones. The development proxy is not a production
reverse proxy; deployment must explicitly connect the compiled Angular app to
the Java API.

## Framework references

- [Angular HTTP setup](https://angular.dev/guide/http/setup)
- [Angular HTTP testing](https://angular.dev/guide/http/testing)
- [Angular render lifecycle](https://angular.dev/guide/components/lifecycle)
- [Angular development proxy](https://angular.dev/tools/cli/serve)
