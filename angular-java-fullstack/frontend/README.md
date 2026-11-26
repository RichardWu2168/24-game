# Math 24 Angular frontend

Angular 22.3, standalone components, signals, SCSS, and Vitest. The Java API owns
expression validation, automatic parentheses, puzzle generation, and saved
outcomes. Angular owns the screen, browser timing, draft restoration, and safe
retry of pending actions.

## Run locally

Start PostgreSQL and the Java API using the launchers in the parent directory.
Then run in this directory:

```powershell
npm.cmd ci
npm.cmd start
```

Open [http://localhost:4200](http://localhost:4200). The development proxy sends
`/api/**` to `http://127.0.0.1:8080`; restart Angular after editing
`proxy.conf.json`. No guest credential or database password belongs in that
configuration.

## Verify

```powershell
npm.cmd test -- --watch=false
npm.cmd run build
```

The tests do not require Java or PostgreSQL. The production files are generated
in `dist/frontend/browser`. The development proxy is not included in that
build; deployment must route `/api/v1` to the Java service or configure the
`GAME_API_BASE_URL` provider and exact allowed origins.

## Main files

| Location | Responsibility |
| --- | --- |
| `src/app/features/game/game-screen.*` | Responsive game screen, input, feedback, rules, and statistics |
| `src/app/features/game/game.store.ts` | Round state, timing, restoration, and mutation sequencing |
| `src/app/core/game-api.ts` | Typed HTTP requests and request timeout |
| `src/app/core/game.models.ts` | API response and pending-action types |
| `src/app/core/game-storage.ts` | Guest credential encoding and stored-journal validation |
| `src/app/core/game-browser.ts` | Injectable browser storage, clock, visibility, and tab ownership |
| `proxy.conf.json` | Local development API routing |

See [the gameplay guide](../docs/angular-gameplay.md) for the play flow, recovery
behavior, and manual checks. See [the project README](../README.md) for the
Windows toolchain and backend/database commands.
