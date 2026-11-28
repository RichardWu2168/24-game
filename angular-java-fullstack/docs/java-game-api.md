# Java game API and PostgreSQL persistence

This milestone connects the Java game engine to a guest-scoped REST API and
PostgreSQL. It includes session restoration, rounds, frozen thinking durations,
answer attempts, reveal/skip operations, history, statistics, and retry handling.
The Angular game screen is a later milestone; the generated Angular welcome
page is still expected at this point.

The backend remains one Spring Boot application. Its package responsibilities
are:

| Package | Responsibility |
| --- | --- |
| `io.math24.game.domain` | Mathematical rules, expression validation, automatic parentheses, solving, and solvable puzzle generation. |
| `io.math24.game.application` | Guest access, game workflows, transactions, immutable response views, and operation replay. |
| `io.math24.game.persistence` | JPA entities, repositories, row locking, and database queries. |
| `io.math24.game.api` | HTTP endpoints, request validation, error responses, response cache headers, and CORS. |

Controllers return application views, never JPA entities. The existing engine
continues to evaluate expressions using the rules described in
[java-game-engine.md](java-game-engine.md).

## Guest access and restoration

There are no accounts, passwords, or leaderboards. A browser identifies its
guest session using a random bearer credential:

1. Generate **32 bytes with a cryptographically secure random generator**.
2. Encode them as unpadded base64url: exactly **43 characters**, using letters,
   digits, `-`, and `_`.
3. Save the credential in browser storage **before** the initialization request.
4. Send it in `Authorization: Bearer <credential>` on every API request.
5. Call `PUT /api/v1/session` to initialize or resume that guest session.

The API validates the canonical encoding and stores only a SHA-256 digest of
the credential. It does not return the credential or place it in URLs.
Repeating initialization with the same credential returns the same session,
including when the first response was lost. A session UUID is an identifier;
it does not grant access by itself.

The future Angular client can generate the credential with browser cryptography:

```javascript
const bytes = crypto.getRandomValues(new Uint8Array(32));
const credential = btoa(String.fromCharCode(...bytes))
  .replaceAll('+', '-')
  .replaceAll('/', '_')
  .replace(/=+$/, '');

localStorage.setItem('math24.guestCredential', credential);
// Only after saving: PUT /api/v1/session with the Authorization header.
```

An existing stored credential should be reused. Clearing it loses access to that
guest's stored history; cross-device recovery and account recovery are outside
this project's scope.

`GET /api/v1/session` restores the session and its active round, if any. Each
guest can have at most one `ACTIVE` round. Creating another while one is active
returns `409 ACTIVE_ROUND_EXISTS`; the caller can resume that round or explicitly
skip it before creating the next one.

## Endpoints

The local base URL is `http://localhost:8080/api/v1`. Every endpoint requires the
bearer header above. Only `PUT /session` can establish a previously unknown
credential; the remaining endpoints require an existing session.

| Method and path | JSON request body | Success response |
| --- | --- | --- |
| `PUT /session` | None | `200 SessionView`: initialize or resume. |
| `GET /session` | None | `200 SessionView`: restore the guest and active round. |
| `POST /rounds` | `{ "operationId": "<uuid>" }` | `201 RoundView`, with a `Location` header. |
| `GET /rounds/{roundId}` | None | `200 RoundView`. |
| `PUT /rounds/{roundId}/timing` | `{ "operationId": "<uuid>", "thinkingTimeMs": 12345 }` | `200 RoundView`. |
| `POST /rounds/{roundId}/attempts` | `{ "operationId": "<uuid>", "expression": "3+1*7-1", "thinkingTimeMs": 12345 }` | `200 AnswerView`. |
| `POST /rounds/{roundId}/reveal` | `{ "operationId": "<uuid>" }` | `200 RoundView`, including the revealed solution. |
| `POST /rounds/{roundId}/skip` | `{ "operationId": "<uuid>" }` | `200 RoundView`. |
| `GET /rounds?page=0&size=20` | None | `200 PageView<RoundView>`, newest rounds first. |
| `GET /rounds/{roundId}/attempts?page=0&size=20` | None | `200 PageView<AttemptView>`, highest attempt number first. |
| `GET /statistics` | None | `200 StatisticsView`. |

Request bodies use `Content-Type: application/json`. Page numbers start at zero;
`page` must be between 0 and 10,000 and `size` between 1 and 100. Omitting them
selects page 0 and size 20. Every result is scoped to the caller's guest session.
Unknown round IDs and round IDs owned by another guest both return `404`.

An evaluated incorrect answer still returns HTTP `200`: the server successfully
processed the attempt. Inspect `attempt.status` to distinguish `CORRECT`,
`INVALID_SYNTAX`, `INVALID_CARD_USAGE`, `ILLEGAL_OPERATION`, and
`NOT_TWENTY_FOUR`. Transport problems such as a missing expression or malformed
JSON return HTTP `400` before recording an attempt.

### Request validation

- Every command except session initialization requires an `operationId` UUID.
- `thinkingTimeMs` is a required JSON integer from **0 through 1,800,000**.
- `expression` is a required string of at most **256 Java UTF-16 code units**.
  Empty strings reach the engine and produce an `INVALID_SYNTAX` attempt.
- NUL characters are rejected because PostgreSQL text cannot store them.
- Submitted expression whitespace and characters are preserved; the API does
  not trim the expression or rewrite it while parsing the transport request.
- Unknown JSON fields, duplicate keys, trailing JSON values, decimal-to-integer
  conversion, and scalar string coercion are rejected. For example,
  `"thinkingTimeMs": "12345"` and `"thinkingTimeMs": 12345.5` are invalid.

### Response shapes

| View | Fields |
| --- | --- |
| `SessionView` | `sessionId`, `createdAt`, `activeRound` (a `RoundView` or `null`). |
| `RoundView` | `roundId`, `sessionId`, `cards`, `outcome`, `timingStatus`, `thinkingTimeMs`, `revision`, `attemptCount`, `acceptedExpression`, `assisted`, `revealedSolution`, `createdAt`, `completedAt`. |
| `AttemptView` | `attemptId`, `operationId`, `roundId`, `attemptNumber`, `submittedExpression`, `status`, `interpretedExpression`, `value`, `assisted`, `message`, `submittedAt`. |
| `AnswerView` | `round` (the resulting `RoundView`) and `attempt` (the recorded `AttemptView`). |
| `PageView` | `items`, `page`, `size`, `totalElements`. |
| `StatisticsView` | `totalRounds`, `activeRounds`, `solvedRounds`, `revealedRounds`, `skippedRounds`, `timedSolvedRounds`, `cappedSolvedRounds`, `averageThinkingTimeMs`. |

IDs are UUID strings. Timestamps are UTC instants. Optional values are represented
as JSON `null`, rather than Java `Optional` wrappers. `revision` is a monotonically
increasing round version used to identify stale responses.

Fresh rounds contain the four display-order cards but no solver answer.
`acceptedExpression` is populated only when an answer solves the round;
`revealedSolution` is populated only after the reveal operation. In an attempt,
`submittedExpression` and `interpretedExpression` are separate, so an assisted
answer can display `(3+1)*(7-1)` without presenting `3+1*7-1` itself as equal to 24.

## Round outcome and thinking time

Round outcomes are `ACTIVE`, `SOLVED`, `REVEALED`, and `SKIPPED`. Thinking time has
its own status:

| Timing status | Stored duration | Meaning |
| --- | --- | --- |
| `NOT_CAPTURED` | `null` | No frozen browser duration has been saved. This is also valid for a skipped or revealed round. |
| `CAPTURED` | 0 through 1,799,999 milliseconds | The player pressed “Got It!” before the limit. |
| `CAPPED` | Exactly 1,800,000 milliseconds | The browser timer reached the 30-minute limit. |

The browser owns the clock. It starts the timer only after a puzzle is visible
and playable, persists its local start timestamp, and continues to account for
time away from the page. The server's `createdAt` and `completedAt` fields are
audit timestamps, **not the source of thinking duration**.

The first timing capture freezes the duration. Capturing time does not finish
the round. An incorrect answer leaves it `ACTIVE` and preserves that duration;
subsequent corrections reuse the same frozen value. A `CAPPED` round also remains
answerable. Solving it increments the solved count, but its capped duration is
excluded from the thinking-time average.

Answer submission includes `thinkingTimeMs` as well as the expression. If the
earlier timing request was lost or delayed, the service captures that browser
value and records the attempt in one transaction. If a duration was already
captured, the answer must carry the same value. A different value returns
`409 TIMING_ALREADY_CAPTURED` without modifying the round or recording an attempt.

A delayed timing request with the already stored duration remains harmless even
after the round finishes. First-time capture after a skip or reveal is rejected.
New answer, reveal, and skip commands require an active round; an exact replay
of an earlier successful command is handled separately as described below.

Statistics count rounds, not attempts. `averageThinkingTimeMs` includes only
`SOLVED` rounds with `CAPTURED` timing. It is `null` when there are no eligible
solves; a real zero-millisecond average remains zero. `timedSolvedRounds` gives
the sample count, and `cappedSolvedRounds` counts solved rounds excluded because
of the cap.

## Retries, concurrency, and stale responses

Before sending a state-changing request, the client creates a UUID operation ID
and saves the pending command locally. If the response is lost, it resends the
same operation ID and the same command fields. A timeout does not establish
whether the transaction committed.

Operation IDs are unique **within the guest session across all command types**.
Do not reuse an answer's ID for timing, another answer, or another round.
Reusing an ID with a different operation type, target round, expression, or
thinking duration returns `409 IDEMPOTENCY_CONFLICT`.

The service locks the guest-session row while processing a mutation. It checks
the operation ledger before validating the round's current state, then saves the
mutation and serialized response in the same transaction. This prevents duplicate
rounds or attempts, including concurrent retries from separate tabs. Different
guests can proceed independently.

**An identical replay returns the original response snapshot.** For example,
replaying round creation after the round was solved can return its original
`ACTIVE` snapshot. The operation still creates no additional round. Angular must
associate responses with the pending operation and round, ignore responses for
an older displayed round, and never replace a newer revision with an older one.
A fresh `GET /rounds/{roundId}` returns the current stored round state.

Failed commands do not create successful operation receipts. The client may
correct a rejected request as appropriate; it should generate a new operation ID
for a new player action.

## Database model and migrations

`backend/src/main/resources/db/migration/V1__create_game_tables.sql` creates four
tables:

| Table | Stored information |
| --- | --- |
| `guest_session` | Session UUID, unique credential digest, and creation timestamp. |
| `game_round` | Ownership, four cards, outcome, timing, attempt count, accepted/revealed expressions, revision, and audit timestamps. |
| `answer_attempt` | Original expression, interpreted expression/value, result category, assistance flag, attempt number, and submission timestamp. |
| `game_operation` | Session-scoped operation ID, kind/target, request digest, and serialized replay response. |

Foreign keys retain ownership relationships. Check constraints enforce valid
card ranges, outcome/timing combinations, completed-round metadata, and accepted
answer consistency. A partial unique index permits only one `ACTIVE` round per
guest. Other unique constraints protect operation IDs and attempt numbering.

In the **local** profile, Flyway applies pending migrations when the application
or integration test context starts. Hibernate then validates the schema; it does
not create or update it. Existing `infra/.env` database settings continue to be
used by the PowerShell launcher.

In the **production** profile, automatic Flyway startup is disabled. Reviewed
migrations must be applied through a separate release step before the matching
application version starts. Hibernate still validates the schema. The
[deployment guide](deployment.md) documents the `database-migrations` Maven
profile, PowerShell helper, and dedicated Java release workflow that provide
this step.

Once a migration has been applied, retain it unchanged and add a new versioned
migration for subsequent schema changes.

## Browser access and CORS

All API responses have `Cache-Control: no-store` because they contain guest-specific
state. CORS accepts only explicitly configured HTTP/HTTPS origins; wildcards,
paths, and credential cookies are not used.

| Environment | Default allowed origins |
| --- | --- |
| Local profile | `http://localhost:4200` |
| Base / production | None; same-origin requests remain available. |

Override the allowed origins with the `MATH24_ALLOWED_ORIGINS` environment
variable. It accepts a comma-separated list of exact origins, such as:

```text
https://play.example.com,https://preview.example.com
```

Each entry is an origin only: scheme, host, and optional port, without a path or
trailing slash. Allowed API methods are `GET`, `PUT`, `POST`, and `OPTIONS`;
allowed request headers are `Authorization` and `Content-Type`. The `Location`
response header is exposed. Angular should send the bearer header and leave
cookie-based `withCredentials` disabled.

For the Vercel deployment, the browser calls the same website origin and Vercel
forwards `/api/**` to Azure. Set `MATH24_ALLOWED_ORIGINS` to the exact stable
Vercel production origin so a forwarded browser `Origin` is accepted by Spring.
Keep Azure platform CORS unconfigured; the existing Java policy is the single
authority. CORS does not replace guest credential validation or make the Azure
endpoint private. See the deployment guide for explicit preview-origin setup.

## Error responses

HTTP errors use `application/problem+json` with a stable `code` property. For
example:

```json
{
  "type": "about:blank",
  "title": "Conflict",
  "status": 409,
  "detail": "This operation identifier was already used for a different request.",
  "code": "IDEMPOTENCY_CONFLICT"
}
```

The exact human-readable detail is explanatory; clients should branch on the
HTTP status and `code`, not parse the message.

| Status/code | Meaning |
| --- | --- |
| `400 INVALID_REQUEST` | Invalid JSON, missing/invalid fields, invalid UUID, or out-of-range input. |
| `401 UNAUTHORIZED` | Missing, malformed, or unknown guest credential. Response includes `WWW-Authenticate: Bearer`. |
| `404 ROUND_NOT_FOUND` | Unknown round or a round outside the caller's guest session. |
| `409 ACTIVE_ROUND_EXISTS` | Resume or finish the current round before creating another. |
| `409 IDEMPOTENCY_CONFLICT` | An operation ID was reused with different command fields. |
| `409 ROUND_FINISHED` | A new operation requires an active round. |
| `409 TIMING_ALREADY_CAPTURED` | An operation attempted to change the frozen thinking duration. |
| `500 INTERNAL_ERROR` | The operation could not be completed; retry an uncertain command with its original operation ID. |

Error responses omit rejected values, bearer credentials, stack traces, and SQL
messages. Unsupported methods/media types retain appropriate HTTP statuses with
sanitized problem details.

## Run the tests

With Docker Desktop and the project's PostgreSQL container running:

```powershell
Set-Location 'C:\Projects\24-game\angular-java-fullstack'
.\scripts\Invoke-Database.ps1 -Task Start

# HTTP/application/persistence integration tests against PostgreSQL.
.\scripts\Invoke-Backend.ps1 -Task ApiTest

# All Java tests, including the existing engine and Spring context tests.
.\scripts\Invoke-Backend.ps1 -Task Test
```

The `api-tests` Maven profile selects the API integration tests. The existing
`engine-tests` profile still runs the plain Java domain tests without PostgreSQL:

```powershell
.\scripts\Invoke-Backend.ps1 -Task EngineTest
```

The verified full suite contains **132 tests**: 80 engine cases, 51 API/database
cases, and one Spring context startup test. A clean build on Java 25 and
PostgreSQL 18.7 passed with zero failures, errors, or skips. `ApiTest` selects the
51 API/database cases; `EngineTest` selects the 80 engine cases. Maven loads the
test-only Mockito agent explicitly at JVM startup for Java 25 compatibility.

On Linux/macOS, select JDK 25, provide `SPRING_DATASOURCE_URL`,
`SPRING_DATASOURCE_USERNAME`, and `SPRING_DATASOURCE_PASSWORD`, and run from
`backend`:

```sh
./mvnw -Papi-tests test
./mvnw test
```

Integration tests exercise the real PostgreSQL migration, constraints,
transactions, ownership, retries, timing, pagination, and HTTP validation. They
create a random schema named `math24_test_<32 UUID hex characters>` for the suite.
Flyway creates and migrates that schema, while Hibernate and the connection pool
use it for game data. After the suite, cleanup validates that exact test-name
pattern and drops only its own schema; the Spring test context is also closed.
The development `public` schema and its game data are outside that cleanup scope.
If the test process is forcibly stopped before cleanup, its isolated schema may
remain, but the next run uses a different random schema.

## Manual smoke check on Windows PowerShell 5.1

Start PostgreSQL and the backend in one terminal, using the existing launchers:

```powershell
Set-Location 'C:\Projects\24-game\angular-java-fullstack'
.\scripts\Invoke-Database.ps1 -Task Start
.\scripts\Invoke-Backend.ps1 -Task Run
```

Use a **second PowerShell terminal** for the following commands. They create a
new development guest session and one round. This sample keeps its credential
and pending requests in that terminal's variables; the Angular implementation
will persist them in browser storage before sending.

### 1. Create a credential and initialize the guest

```powershell
$apiBase = 'http://localhost:8080/api/v1'
$guestBytes = New-Object byte[] 32
$guestRandom = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $guestRandom.GetBytes($guestBytes)
}
finally {
    $guestRandom.Dispose()
}
$guestCredential = [Convert]::ToBase64String($guestBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
$guestHeaders = @{ Authorization = 'Bearer ' + $guestCredential }

$guestSession = Invoke-RestMethod -Method Put -Uri "$apiBase/session" -Headers $guestHeaders
$resumedSession = Invoke-RestMethod -Method Put -Uri "$apiBase/session" -Headers $guestHeaders
$guestSession.sessionId -eq $resumedSession.sessionId
```

The last command should print `True`; initialization was deduplicated.

### 2. Create a solvable round and freeze its thinking duration

```powershell
$createRoundJson = @{ operationId = [guid]::NewGuid().ToString() } | ConvertTo-Json -Compress
$round = Invoke-RestMethod -Method Post -Uri "$apiBase/rounds" -Headers $guestHeaders -ContentType 'application/json' -Body $createRoundJson
$round.cards

$captureJson = @{
    operationId = [guid]::NewGuid().ToString()
    thinkingTimeMs = 12345
} | ConvertTo-Json -Compress
$capturedRound = Invoke-RestMethod -Method Put -Uri "$apiBase/rounds/$($round.roundId)/timing" -Headers $guestHeaders -ContentType 'application/json' -Body $captureJson
$capturedRound | Select-Object outcome, timingStatus, thinkingTimeMs
```

Expect `ACTIVE`, `CAPTURED`, and `12345`. This duration is a deliberate sample
value supplied by the client; it does not depend on how long the commands took.

### 3. Submit an intentionally incorrect answer, then replay it

This expression uses all four displayed cards. If their sum is 24, subtracting
the last card instead makes the result smaller than 24. Explicit parentheses
make the intended grouping literal.

```powershell
$cards = @($round.cards)
$cardSum = ($cards | Measure-Object -Sum).Sum
if ($cardSum -eq 24) {
    $wrongExpression = '(' + $cards[0] + '+' + $cards[1] + '+' + $cards[2] + '-' + $cards[3] + ')'
}
else {
    $wrongExpression = '(' + ($cards -join '+') + ')'
}

$wrongAnswerJson = @{
    operationId = [guid]::NewGuid().ToString()
    expression = $wrongExpression
    thinkingTimeMs = 12345
} | ConvertTo-Json -Compress

$firstAttempt = Invoke-RestMethod -Method Post -Uri "$apiBase/rounds/$($round.roundId)/attempts" -Headers $guestHeaders -ContentType 'application/json' -Body $wrongAnswerJson
$replayedAttempt = Invoke-RestMethod -Method Post -Uri "$apiBase/rounds/$($round.roundId)/attempts" -Headers $guestHeaders -ContentType 'application/json' -Body $wrongAnswerJson

$firstAttempt.attempt.status
$firstAttempt.attempt.attemptId -eq $replayedAttempt.attempt.attemptId
$replayedAttempt.round | Select-Object outcome, attemptCount, thinkingTimeMs
```

Expect `NOT_TWENTY_FOUR`, then `True`, followed by `ACTIVE`, attempt count `1`,
and the original thinking duration `12345`. The replay creates no second attempt.

### 4. Reveal the solution and inspect stored state

```powershell
$revealJson = @{ operationId = [guid]::NewGuid().ToString() } | ConvertTo-Json -Compress
$revealedRound = Invoke-RestMethod -Method Post -Uri "$apiBase/rounds/$($round.roundId)/reveal" -Headers $guestHeaders -ContentType 'application/json' -Body $revealJson
$revealedRound | Select-Object outcome, revealedSolution, thinkingTimeMs

Invoke-RestMethod -Method Get -Uri "$apiBase/rounds/$($round.roundId)" -Headers $guestHeaders
Invoke-RestMethod -Method Get -Uri "$apiBase/rounds/$($round.roundId)/attempts?page=0&size=20" -Headers $guestHeaders
Invoke-RestMethod -Method Get -Uri "$apiBase/statistics" -Headers $guestHeaders
```

Expect outcome `REVEALED`, a legal solution, and the same frozen duration. For
this fresh guest, statistics show one total round, one revealed round, zero
solved rounds, and a `null` average thinking time. Another new round can now be
created with a new operation ID.

## Next integration step

The [Angular gameplay screen](angular-gameplay.md) now supplies the playable
screen, browser timer, local pending-command storage, stale-response handling,
and simple session statistics. A separate history page and richer statistics
views remain later work. This API provides their server-side boundaries; the
browser behavior belongs to Angular.

## Framework references

- [Spring MVC problem details](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-rest-exceptions.html)
- [Spring MVC CORS](https://docs.spring.io/spring-framework/reference/web/webmvc-cors.html)
- [Spring Data JPA locking](https://docs.spring.io/spring-data/jpa/reference/jpa/locking.html)
- [PostgreSQL constraints](https://www.postgresql.org/docs/18/ddl-constraints.html)
