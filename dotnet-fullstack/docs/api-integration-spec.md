# 24 Game — API Integration Specification

**Status:** Backend contract reviewed and verified  
**Backend:** ASP.NET Core Web API (.NET 10)  
**Database:** PostgreSQL  
**Consumers:** Blazor Web App (Interactive Server), Angular

## 1. Purpose and architecture

This document defines the REST API contract shared by the Blazor and Angular frontends.

Both frontends communicate with the same ASP.NET Core backend and PostgreSQL database.

```text
Blazor Web App (Interactive Server) ──┐
                                      ├── ASP.NET Core REST API ── PostgreSQL
Angular Application ──────────────────┘
```

The backend is responsible for:
- Game rules and answer validation
- Game and session lifecycle
- Puzzle generation
- Attempt recording
- Duration capture
- History and statistics
- Database persistence

The frontends are responsible for:
- User interface and interaction
- Displaying puzzles and game results
- Timer presentation and elapsed-time tracking
- Maintaining the session ID
- Calling API endpoints
- Handling loading states and errors

Game rules must not be independently reimplemented in either frontend.

## 2. API configuration

Development API URLs:

| Protocol | Base URL |
|---|---|
| HTTP | `http://localhost:5216` |
| HTTPS | `https://localhost:7112` |

Use the HTTPS URL during development.

The frontend API base URL should be configurable rather than hardcoded throughout the application.

## 3. JSON conventions

- JSON property names use camelCase.
- GUIDs are represented as strings.
- Timestamps use ISO 8601 UTC format.
- Nullable properties can contain `null`.
- `GameStatus` is serialized as an integer.

### GameStatus

| Value | C# enum | Meaning |
|---:|---|---|
| 0 | InProgress | Game is active |
| 1 | Completed | Game completed successfully |
| 2 | Abandoned | Game abandoned |

Both frontends must map these numeric values to meaningful application states.

## 4. Session endpoints

### 4.1 Create a session

`POST /api/gamesessions`

Creates a new game session. It does not automatically create a puzzle.

Success: `201 Created`

Response:

```json
{
  "id": "4123823c-2c95-4cce-af5a-3f51c3848ab3",
  "createdAt": "2026-11-03T14:42:00Z"
}
```

The frontend must retain the returned session ID for subsequent API calls.

### 4.2 Get session history

`GET /api/gamesessions/{sessionId}/history?cursor={cursor}&pageSize=10`

Returns a page of games belonging to the specified session.

Query parameters:

| Parameter | Description |
|---|---|
| cursor | Optional GUID identifying the pagination cursor |
| pageSize | Number of games per page; default 10, range 1–100 |

Response structure:

```json
{
  "games": [],
  "hasMore": false,
  "nextCursor": null
}
```

Each item in `games` uses the `GameResponse` structure defined in Section 7.

Pagination is ordered newest first, with a deterministic ID tie-breaker.

An invalid cursor returns HTTP 400.

### 4.3 Get session statistics

`GET /api/gamesessions/{sessionId}/stats`

Response:

```json
{
  "totalGames": 0,
  "completedGames": 0,
  "inProgressGames": 0,
  "abandonedGames": 0,
  "totalAttempts": 0,
  "correctAttempts": 0,
  "accuracyPercent": 0
}
```

Accuracy is zero when there are no attempts. Otherwise, it is calculated as the rounded percentage of correct attempts.

### 4.4 Clear session history

`DELETE /api/gamesessions/{sessionId}/history`

Deletes completed and abandoned games belonging to the session.

Active games are preserved.

Response:

```json
{
  "deletedCount": 5
}
```

Associated attempts of deleted games are also removed through database cascade deletion.

## 5. Puzzle endpoints

### 5.1 Get the current puzzle

`GET /api/gamesessions/{sessionId}/puzzle`

Returns the current active puzzle.

Success: `200 OK`

If there is no active puzzle, the API returns `404 Not Found`.

Important: this endpoint does not create a puzzle.

### 5.2 Create a new puzzle

`POST /api/gamesessions/{sessionId}/puzzle`

Creates a new puzzle.

If another game is currently in progress, that game is marked as Abandoned.

Success: `200 OK`

Response:

```json
{
  "id": "d1d2f459-bd7b-4761-9944-1e7915415463",
  "numbers": [8, 8, 4, 7],
  "startedAt": "2026-11-03T14:42:29.921164Z",
  "gotItAt": null,
  "capturedDurationSeconds": null
}
```

Puzzle rules:
- Exactly four numbers are generated.
- Each number is between 1 and 10 inclusive.
- Duplicate numbers are allowed.

### 5.3 Record Got It

`POST /api/gamesessions/{sessionId}/games/{gameId}/got-it`

Request:

```json
{
  "durationSeconds": 12.7
}
```

Duration must be between 0 and 604800 seconds.

Success: `200 OK`

Response uses the same structure as `PuzzleResponse`.

The backend rounds duration values to one decimal place using MidpointRounding.AwayFromZero. For example, 2.34 seconds becomes 2.3 seconds, and 2.36 seconds becomes 2.4 seconds.

The first successful Got It capture is retained. Repeated requests do not overwrite the original capture.

## 6. Answer endpoints

### 6.1 Check an answer without submitting it

`POST /api/answers/check`

Request:

```json
{
  "expression": "4 * (5 + 2 - 1)",
  "numbers": [4, 2, 5, 1]
}
```

Response:

```json
{
  "valid": true,
  "message": "Correct! You made 24!",
  "value": 24
}
```

This endpoint is stateless. It does not record a game attempt or modify a game.

An incorrect expression can still return HTTP 200:

```json
{
  "valid": false,
  "message": "Use each card number exactly once.",
  "value": null
}
```

The frontend must inspect `valid`, not just the HTTP status.

### 6.2 Submit an answer

`POST /api/gamesessions/{sessionId}/games/{gameId}/answers`

Request:

```json
{
  "expression": "4 * (5 + 2 - 1)",
  "numbers": [4, 2, 5, 1],
  "durationSeconds": 25
}
```

`durationSeconds` is nullable.

The submitted numbers must match the original puzzle numbers in exactly the same order.

Success: `200 OK`

Response:

```json
{
  "valid": true,
  "message": "Correct! You made 24!",
  "value": 24,
  "game": {
    "id": "5e157813-fda9-4073-a3b2-32e68e3ca980",
    "sessionId": "4123823c-2c95-4cce-af5a-3f51c3848ab3",
    "numbers": [4, 2, 5, 1],
    "status": 1,
    "createdAt": "2026-11-01T20:51:52.029634Z",
    "completedAt": "2026-11-03T14:52:12.2507313Z",
    "gotItAt": null,
    "durationSeconds": 25,
    "capturedDurationSeconds": null,
    "attempts": [
      {
        "id": "160166f0-6b1f-44f7-b004-9ff062fe1106",
        "expression": "4 * (5 + 2 - 1)",
        "isCorrect": true,
        "createdAt": "2026-11-03T14:52:12.2504916Z"
      }
    ]
  }
}
```

Answer submission behavior:

- Incorrect answers are recorded as attempts.
- An incorrect answer leaves the game InProgress.
- A correct answer completes the game.
- If Got It duration was captured, that duration is used.
- Otherwise, a duration must be supplied for a correct answer.
- Durations are stored and returned with one-decimal-place precision. If a Got It duration was previously captured, that duration takes precedence over the duration supplied with the answer.
- A completed or abandoned game cannot accept further submissions.

### 6.3 Reveal Solution

`POST /api/gamesessions/{sessionId}/games/{gameId}/reveal-solution`

Request body: None.

Success: `200 OK`

Successful response — Solvable puzzle:

```json
{
  "gameId": "5542b2a6-b23c-4c13-afe3-6d9ccb9ad95e",
  "status": 2,
  "solvable": true,
  "expressions": [
    "((1 * 2) * (3 * 4))",
    "((1 + 3) * (2 + 4))"
  ]
}
```

Successful response — Unsolvable puzzle

```json
{
  "gameId": "5542b2a6-b23c-4c13-afe3-6d9ccb9ad95e",
  "status": 2,
  "solvable": false,
  "expressions": []
}
```

## 7. Common response structures

### PuzzleResponse

```json
{
  "id": "guid",
  "numbers": [8, 8, 4, 7],
  "startedAt": "2026-11-03T14:42:29Z",
  "gotItAt": null,
  "capturedDurationSeconds": null
}
```

### GameResponse

```json
{
  "id": "guid",
  "sessionId": "guid",
  "numbers": [4, 2, 5, 1],
  "status": 0,
  "createdAt": "2026-11-03T14:42:29Z",
  "completedAt": null,
  "gotItAt": null,
  "durationSeconds": null,
  "capturedDurationSeconds": null,
  "attempts": []
}
```

### GameAttemptResponse

```json
{
  "id": "guid",
  "expression": "4 * (5 + 2 - 1)",
  "isCorrect": true,
  "createdAt": "2026-11-03T14:52:12Z"
}
```

## 8. Error handling

The API uses HTTP status codes and ProblemDetails-style responses.

| HTTP status | Meaning | Typical scenario |
|---:|---|---|
| 400 | Bad Request | Invalid request data, invalid cursor, invalid duration |
| 404 | Not Found | Missing session or game |
| 409 | Conflict | Attempt to modify a completed or abandoned game |
| 500 | Internal Server Error | Unexpected server error |

Example ProblemDetails response:

```json
{
  "type": "about:blank",
  "title": "Conflict",
  "status": 409,
  "detail": "..."
}
```

The exact `detail` depends on the error.

Automatic model validation can also return a ValidationProblemDetails response with an `errors` object.

Frontend requirements:
- Handle HTTP errors separately from answer validation results.
- Display useful messages for 400 and 409 responses.
- Handle 404 by determining whether the session or game is no longer available.
- Do not expose internal server exception details to users.
- Handle unexpected network and server failures gracefully.

## 9. Session persistence and frontend behavior

Each frontend maintains its own session ID by default.

The session ID should be persisted in browser storage so a user can return to an existing session after refreshing or reopening the application.

The session ID is not an authenticated user identity. The backend currently has no authentication requirement for these endpoints.

Recommended startup flow:

1. Read the saved session ID.
2. If no ID exists, create a session.
3. Save the returned session ID.
4. Request the current puzzle.
5. If the session is known to be valid but has no active puzzle, create one.
6. Restore the game interface.

Because the API returns 404 both for a missing session and for a session without an active puzzle, the frontend must account for this ambiguity rather than blindly creating a new puzzle after every 404.

## 10. Game lifecycle

```text
                 Create Puzzle
                       |
                       v
                  InProgress
                  /        \
          Correct Answer   Create New Puzzle
                |                 |
                v                 v
            Completed          Abandoned
```

Completed and Abandoned are terminal states.

The backend is authoritative for state transitions.

## 11. Frontend-specific integration considerations

### Blazor Web App — Interactive Server

- Use C# `HttpClient` for backend communication.
- Configure the API base URL through application configuration.
- Use server-side API calls; browser CORS is not required for these calls.
- Keep API DTOs separate from UI view models where appropriate.
- Persist the session ID in browser storage through an appropriate browser interop mechanism.

### Angular

- Use Angular `HttpClient` and typed TypeScript interfaces.
- Configure the API base URL through Angular environment/configuration.
- Browser requests to a different API origin require CORS configuration on the backend.
- Persist the session ID in browser storage.
- Use a centralized API service and centralized HTTP error handling.

### Shared requirements

Both frontends must:
- Consume the same REST API.
- Use the same lifecycle semantics.
- Interpret numeric game statuses consistently.
- Handle nullable fields.
- Respect backend validation and error responses.
- Avoid duplicating backend game rules.

## 12. Backend contract status

The backend API contract has been reviewed against the controller, service, DTO, domain, repository, database configuration, and integration tests.

The user has also verified the endpoints in Postman, including:
- Session creation
- Puzzle creation and retrieval
- Got It duration capture
- Answer checking
- Successful answer submission
- History and pagination
- Statistics
- History clearing
- Error responses

**The backend is considered ready for frontend integration.**

No backend changes are included in this specification.