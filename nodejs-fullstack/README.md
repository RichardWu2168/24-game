# 24 Game — Full-Stack Application

A full-stack implementation of the classic 24 Game, built with React, TypeScript, Node.js, Express, PostgreSQL, and Prisma.

The goal is to demonstrate full-stack development, including REST API design, database persistence, input validation, automated testing, and paginated data retrieval.

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- Vitest

### Backend

- Node.js
- Express 5
- TypeScript
- Prisma ORM 7
- PostgreSQL
- Node.js built-in test runner

## Architecture

```text
React + TypeScript + Vite
          |
          | HTTP / JSON
          v
Node.js + Express + TypeScript
          |
          | Prisma ORM
          v
      PostgreSQL
```

The frontend communicates with the backend through REST API endpoints. The backend validates requests, evaluates submitted expressions, manages game state, and persists games and answer attempts in PostgreSQL.

## Features

- Generate puzzles containing four numbers.
- Validate arithmetic expressions and check whether they equal 24.
- Persist games and answer attempts in PostgreSQL.
- Track game status: in progress, completed, or abandoned.
- Record completion timestamps for successful games.
- Retrieve individual games with their answer history.
- Browse game history using cursor-based pagination.
- Retrieve aggregate game and answer statistics.
- Validate API requests and return appropriate error responses.
- Run automated backend tests and frontend tests.

## REST API

The backend runs locally on port `3000` by default.

| Method | Endpoint            | Description                                   |
| ------ | ------------------- | --------------------------------------------- |
| GET    | `/api/health`       | Check backend availability                    |
| DELETE | `/api/games`        | Clear completed/abandoned games for this session |
| POST   | `/api/games/:id/got-it` | Capture thinking time for the active puzzle |
| GET    | `/api/puzzle`       | Generate and save a new puzzle                |
| POST   | `/api/check-answer` | Validate an expression and record an attempt  |
| GET    | `/api/games`        | Retrieve paginated game history               |
| GET    | `/api/games/:id`    | Retrieve a game and its answer attempts       |
| GET    | `/api/stats`        | Retrieve aggregate game and answer statistics |

### Generate a Puzzle

```http
GET /api/puzzle
```

Returns the four puzzle numbers and the saved game's ID.

Example response:

```json
{
  "numbers": [4, 5, 8, 5],
  "gameId": "example-game-id"
}
```

### Check an Answer

```http
POST /api/check-answer
Content-Type: application/json
```

Example request:

```json
{
  "numbers": [4, 5, 8, 5],
  "expression": "8*(4-(5/5))",
  "gameId": "example-game-id",
  "durationSeconds": 18
}
```

The backend validates the submitted expression. When a game ID is supplied, the backend also verifies that the game belongs to the supplied session, that the submitted numbers match the saved puzzle, and that the game is still in progress.

Puzzle creation, replacement, and saved answer submissions run in database
transactions with a per-session PostgreSQL lock. The server sends success only
after commit. Page initialization resumes a game with GET; the New Game action
uses POST to replace it. The frontend blocks overlapping game requests and
ignores obsolete responses.

Answer attempts are persisted. An incorrect answer leaves the game in progress; a correct answer completes the game and records its completion time.

### Game History and Pagination

#### UI timer and saved duration

The UI timer is the source of truth. It starts when the puzzle is displayed
in the browser, uses the browser's own timestamps, and continues while tabs
are switched. Its snapshot is stored locally so refreshing the same game
restores that clock. Server `createdAt`, `startedAt`, `gotItAt`, and
`completedAt` timestamps are metadata; none is used to calculate duration.

**Got It** freezes the UI clock and sends its displayed whole seconds to
`POST /api/games/:id/got-it` as `{ "durationSeconds": 18 }`, with the session
header. The server stores this UI value in nullable
`capturedDurationSeconds`; retries preserve the first capture. Got It does
not complete the game, and the final `durationSeconds` remains null until
a correct answer completes it.

**Check Answer** includes the UI's frozen `durationSeconds` in its request.
While checking, the display freezes at that same value, so network delays
cannot add time. An incorrect answer resumes a previously running clock;
a correct answer saves the submitted whole seconds. A duration previously
captured through Got It takes precedence. If Show Solutions already froze
the UI timer, Check Answer submits that same displayed value.

History shows `00:18` or `02:35`, matching the UI clock. Unfinished and
abandoned games keep `durationSeconds = null` and display a dash. Saved game
completion requires a UI duration or an existing UI capture; the backend
never substitutes creation-time arithmetic. Existing legacy records without
recorded timing retain their null duration.

The additive `20261028230000_add_ui_captured_duration` migration adds the
nullable UI capture field without deleting or resetting existing records.

The already-applied `20261028190000_add_game_duration` migration is preserved
unchanged, including its recorded checksum. The forward migration
`20261028220000_duration_seconds_integer` changes the PostgreSQL column to
`INTEGER` using `floor(durationSeconds)::INTEGER`. It preserves NULLs, game
records, attempts, sessions, and timestamps. Existing fractional durations
are intentionally rounded down, matching the backend. Out-of-range values
abort the transaction instead of being clamped or resetting records.

Both `gotItAt` and `durationSeconds` remain nullable. The check constraint
allows a non-null duration only for a `COMPLETED` game and requires it to be
non-negative; the INTEGER column enforces whole seconds. Completed legacy
games may still have a NULL duration.

After reviewing the migration, apply it with
`npx prisma migrate deploy --config prisma7.config.ts`, then regenerate the
client with `npx prisma generate --config prisma7.config.ts`. Do not reset the
database or edit the checksum of the original applied migration.

#### Clearing history

The **Clear History** button beside **Refresh History** clears finished games
immediately, without a confirmation dialog. Clicking it sends `DELETE /api/games`
with the browser's `X-Session-Id` header. The server deletes only completed and abandoned games for
that session, with database cascade deletion of their answer attempts. Other
sessions and the session identifier itself are preserved. The operation uses
the same session lock and transaction as game creation and answer submission.

The current in-progress game and its answer attempts are preserved, along
with the displayed cards, expression, feedback, and timer. The timer continues
while clearing; the history table retains the active game. Conflicting actions
are briefly disabled while clearing; errors leave the existing records intact.
No schema migration is required.

```http
GET /api/games?limit=10
```

The endpoint returns the most recent games first. The UI initially loads
20 games; **Load More** appends older pages without duplicates. **Refresh
History** returns to the newest page. Loading/clearing disables conflicting
history actions. A missing, deleted, or foreign-session cursor returns HTTP
400; refresh history to obtain a current cursor.

- Default page size: 20 games.
- Maximum page size: 100 games.
- `nextCursor`: cursor for retrieving the next page, or `null` when there are no more results.
- `hasMore`: indicates whether another page is available.
- Each game includes its attempt count.

To retrieve the next page, pass the returned cursor:

```http
GET /api/games?limit=10&cursor=example-game-id
```

Cursor-based pagination avoids using large numeric offsets when browsing game history.

### Game Details

```http
GET /api/games/:id
```

Returns the selected game's numbers, status, creation and completion timestamps, and recorded answer attempts.

### Statistics

```http
GET /api/stats
```

Returns aggregate statistics, including:

- Total games
- Completed games
- In-progress games
- Abandoned games
- Total answer attempts
- Correct answer attempts
- Answer accuracy percentage

## Database Design

PostgreSQL stores the game's persistent data. Prisma ORM manages the schema and database access.

### Game

Stores the puzzle numbers, game status, creation timestamp, and optional completion timestamp.

### GameAttempt

Stores each submitted expression, whether it was correct, its timestamp, and the associated game ID.

Each game can have multiple answer attempts. Deleting a game also deletes its associated attempts through the configured relationship.

## Quick Setup and Final Verification

Tested with Node.js 24 and npm. From `nodejs-fullstack`, copy the example
configuration files only if your local `.env` files do not already exist:

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

Set the backend `DATABASE_URL` to your local PostgreSQL connection string,
then install the locked dependencies and generate Prisma Client:

```bash
npm run setup
```

Prepare/update PostgreSQL using the migration instructions below. Setup and
verification do not reset the database or automatically apply migrations.
Start the backend and frontend in separate terminals with
`npm --prefix backend run dev` and `npm --prefix frontend run dev`.

Run all checks from `nodejs-fullstack` with one command:

```bash
npm run verify
```

This generates Prisma Client, builds and type-checks the backend, validates
the Prisma schema, runs backend unit/HTTP and PostgreSQL tests, then builds,
lints, and tests the frontend. PostgreSQL must be running with migrations
applied. Database tests use isolated or rolled-back test data.

To additionally verify clean installs and production-only startup:

```bash
npm run smoke:production
```

The smoke check copies source and lockfiles into a temporary directory,
without `.env`, generated files, `dist`, or `node_modules`. It installs and
builds both packages, reinstalls backend dependencies with `--omit=dev`,
starts the compiled backend on a free port, and checks `/api/health`. It uses
an intentionally unreachable test database URL and makes no database queries.
The temporary files and test process are cleaned up afterward. Registry
access may be required to install dependencies.

Backend configuration:

- `DATABASE_URL`: required PostgreSQL URL.
- `PORT`: defaults to 3000; use 0 only when a free test port is desired.
- `FRONTEND_URL`: comma-separated browser origins allowed to call the API.

Frontend `VITE_API_BASE_URL` may be empty for Vite's development proxy to port
3000. Set it explicitly when using a different backend port or origin.

The server handles SIGINT/SIGTERM by stopping new HTTP requests, draining
existing requests, and then disconnecting Prisma. A 10-second deadline prevents
shutdown from hanging indefinitely. Runtime `dotenv` is a production dependency.

## Local Development

### Prerequisites

- Node.js 24 and npm
- PostgreSQL
- Git

### 1. Set Up the Backend

From the repository root:

```bash
cd nodejs-fullstack/backend
npm install
```

Create a local `.env` file in the backend directory and configure your PostgreSQL connection string:

```dotenv
DATABASE_URL="your-postgresql-connection-string"
```

Replace the placeholder with your actual connection string. Keep database credentials private and never commit `.env` to source control.

### 2. Prepare the Database

From the backend directory, validate the Prisma schema:

```bash
npx prisma validate --config prisma7.config.ts
```

If your database contains games from before sessions were introduced, follow
the legacy upgrade below before running the normal migration command.

Apply existing migrations to a fresh database (or one already using sessions):

```bash
npx prisma migrate deploy --config prisma7.config.ts
```

Generate Prisma Client:

```bash
npx prisma generate --config prisma7.config.ts
```

The project uses `prisma7.config.ts` to configure the Prisma schema, migrations directory, and database connection.

#### Upgrading existing games to sessions

The original `20261027203849_add_game_sessions` migration requires an empty
`Game` table. Its historical contents are preserved so databases that already
applied it keep matching Prisma's recorded checksum. For a database at the
initial migration that contains games, run this upgrade from the backend
directory instead of applying the original session migration directly:

```bash
npx prisma db execute --file prisma/upgrades/add_game_sessions.sql --config prisma7.config.ts
npx prisma migrate resolve --applied 20261027203849_add_game_sessions --config prisma7.config.ts
npx prisma migrate deploy --config prisma7.config.ts
```

The SQL upgrade runs in a transaction: it adds a nullable session column,
creates sessions, backfills every game, then enforces the required column and
foreign key. Existing games and attempts remain intact. Each legacy game gets
its own `legacy:<game-id>` session, preserving the one-active-game constraint.
Legacy games cannot automatically be associated with a browser because the
original records have no browser session identifier.

Use this SQL only on the pre-session schema. Databases that already applied the
session migration need no upgrade. If an earlier migration attempt failed,
inspect partial changes before following Prisma's failed-migration recovery
workflow. Do not reset a database to perform this upgrade. See Prisma's
[migration history guidance](https://www.prisma.io/docs/orm/v7/prisma-migrate/understanding-prisma-migrate/migration-histories).

When making schema changes during development, create a migration with:

```bash
npx prisma migrate dev --name describe_your_change --config prisma7.config.ts
```

Replace `describe_your_change` with a short description of the change.

### 3. Run the Backend

From `nodejs-fullstack/backend`:

```bash
npm run dev
```

The development server uses `tsx` to run the TypeScript application.

Check the health endpoint:

```http
GET http://localhost:3000/api/health
```

### 4. Set Up the Frontend

Open a second terminal from the repository root:

```bash
cd nodejs-fullstack/frontend
npm install
```

Create a local frontend `.env` file:

```dotenv
VITE_API_BASE_URL=http://localhost:3000
```

This configures the frontend to communicate with the local backend.

### 5. Run the Frontend

From `nodejs-fullstack/frontend`:

```bash
npm run dev
```

Vite displays the local development URL in the terminal. Keep both the frontend and backend running during local development.

## Build and Test

### Backend

From `nodejs-fullstack/backend`:

Build the TypeScript backend:

```bash
npm run build
```

Run the automated backend tests:

```bash
npm test
```

The backend test script builds the project first and then runs the test suites using Node.js's built-in test runner.

Run the optional PostgreSQL integration checks with `DATABASE_URL` configured:

```bash
npm run test:db
```

These checks verify Prisma session locks, transaction rollback, and the legacy
session upgrade on empty and populated schemas. Temporary test schemas are
rolled back; the application's tables are not migrated or reset. The configured
database account needs permission to create schemas.

### Frontend

From `nodejs-fullstack/frontend`:

Build the frontend:

```bash
npm run build
```

Run the linter:

```bash
npm run lint
```

Run the frontend tests:

```bash
npm test
```

Preview the production build locally:

```bash
npm run build
npm run preview
```

## Verification

The backend has been verified locally with PostgreSQL, including:

- Prisma schema validation and migration status checks.
- Prisma Client generation.
- Automated backend build and test execution.
- Game creation and retrieval.
- Persistence of incorrect and correct answer attempts.
- Game completion and completion timestamps.
- Aggregate statistics.
- Cursor-based pagination across multiple pages.

The current checks pass 82 backend unit/HTTP tests, nine PostgreSQL integration
tests, and 60 frontend tests. PostgreSQL integration checks use isolated test
schemas and roll back their changes.

## Project Structure

```text
nodejs-fullstack/
  backend/
    prisma/                     # Schema, migrations, legacy upgrade
    src/
      app.ts                    # Express composition
      server.ts                 # HTTP listener
      config/env.ts             # Environment access
      database/                 # Prisma client, transactions, store contract
      features/games/
        game.routes.ts
        game.controller.ts
        game.validation.ts
        game.service.ts
        game.repository.ts
        game.types.ts
        game.errors.ts
        answerChecker.ts
        puzzleGenerator.ts
        *.test.ts
      generated/prisma/
      http/                     # HTTP errors and graceful shutdown
      middleware/               # Session and error handling
      tests/                    # HTTP and PostgreSQL integration tests
    package.json
    prisma7.config.ts
    tsconfig.build.json
    tsconfig.json
  frontend/
    src/
      App.tsx                   # Application entry component
      App.test.tsx              # Player flow regression tests
      features/game/
        GamePage.tsx            # Compose the game screen
        game.types.ts
        game.css
        api/gameApi.ts          # Typed game API methods
        components/             # Cards, editor, controls, timer, history
        hooks/                  # Game, timer, history, keyboard shortcuts
        logic/                  # Solver, examples, expression editing
        state/                  # Game reducer and transition tests
      lib/                      # Session storage and HTTP client
      utils/                    # Time formatting and success sound
      main.tsx
      index.css
    package.json
```

### Backend request flow

Requests pass through Express JSON/CORS middleware, the game router, session
and input validation, a controller, the game service, the game repository,
and Prisma/PostgreSQL. Error middleware preserves the API response formats.

- `app.ts` composes middleware, repository, service, and routes; `server.ts` starts the listener.
- Controllers translate validated HTTP input into service calls and send responses after completion.
- Services own ownership checks, game lifecycle rules, pagination, and transaction boundaries. They have no Express or Prisma dependency.
- Repositories implement business-oriented persistence operations and translate database errors. Prisma query shapes stay in this layer.
- `database/transaction.ts` implements atomic transactions and PostgreSQL session locks. Service transactions use a transaction-scoped repository.
- Pure game logic and service tests live beside the game feature. HTTP and PostgreSQL integration tests live in `src/tests`.

The service depends on the `GameRepository` interface. HTTP tests can continue
injecting a lightweight `GameStore` into `createApp`; the composition root wraps
it in the same repository adapter used by the application. Existing endpoint
paths, request/response formats, and database migrations are unchanged.

### Frontend flow

`App.tsx` renders `GamePage`, which connects presentation components to feature
hooks. Components receive values and callbacks; they do not fetch data or
manage session headers.

- `lib/apiClient.ts` handles JSON requests, session headers, and HTTP errors. `features/game/api/gameApi.ts` defines the game endpoints and their types.
- `useGame` coordinates loading, submission, expression editing, and feedback. The game reducer applies related state transitions together.
- `useGameHistory` independently loads and refreshes history; `useGameTimer` owns interval cleanup; `useGameShortcuts` owns keyboard event listeners.
- Request guards prevent overlapping mutations. Version checks ignore obsolete responses and responses received after unmount, including Strict Mode cleanup.
- `logic/` contains pure arithmetic, solver, and expression helpers. Existing styles and public API contracts are preserved.

Frontend tests include pure game logic, reducer transitions, API/session
behavior, and full player flows through the real React components. Run them
once with `npm test -- --run` from `frontend`.

## Project Goals

This project demonstrates practical full-stack development skills: building a React application, designing REST APIs, validating user input, implementing business logic, integrating PostgreSQL with Prisma, managing relational data, and testing backend behavior.
