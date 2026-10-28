# 24 Game frontend

React and TypeScript client for the full-stack 24 Game. See [the project README](../README.md) for backend and PostgreSQL setup.

## Run locally

From this directory:

```bash
npm install
npm run dev
```

The Vite development server proxies `/api` to `http://localhost:3000` by default.
To use a different API origin, set `VITE_API_BASE_URL` in a local `.env` file.

## Source organization

```text
src/
  App.tsx                     Application entry component
  App.test.tsx                Player flow regression tests
  features/game/
    GamePage.tsx              Connect hooks to UI components
    game.types.ts             Game API and history types
    game.css                  Existing game styles
    api/gameApi.ts            Puzzle, answer, and history requests
    components/               Presentational game components
    hooks/
      useGame.ts              Game workflow and request coordination
      useGameHistory.ts       History loading and stale response handling
      useGameTimer.ts         Timer lifecycle
      useGameShortcuts.ts     Keyboard shortcuts and cleanup
    logic/                    Solver, examples, and expression editing
    state/                    Game reducer and transition tests
  lib/
    apiClient.ts              JSON transport, HTTP errors, session headers
    session.ts                Persistent browser session ID
  utils/                      Time formatting and audio
  main.tsx                    React root and Strict Mode
  index.css                   Global styles
```

Components receive state and callbacks. The game reducer coordinates puzzle
changes, answer feedback, timer flags, and preferences. Hooks own side effects;
API modules own HTTP transport. Pure logic remains independent of React and the
network.

A page load resumes a puzzle with GET; New Game replaces it with POST. The same
browser session is reused for history and answers. Pending requests block
conflicting actions, and obsolete responses cannot update an unmounted screen
or replace newer history.

## Checks

```bash
npm run build
npm run lint
npm test -- --run
```

Tests cover arithmetic and solver logic, reducer transitions, session headers,
server error handling, Strict Mode initialization, expression editing, timers,
history refreshes, and pending-request guards. React integration tests use
Happy DOM and mock only the network and success sound.
