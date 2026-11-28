# Math 24: agreed design

## Status and scope

This project is an independent Angular, Java, and PostgreSQL implementation of the Math 24 practice game, alongside the existing .NET implementation. The first release follows the established game experience and adds automatic parentheses during answer submission.

This is a casual, trusted-player application: guest play, browser-measured thinking time, no user accounts, and no leaderboards. Hosting must remain entirely free.

The Java engine, REST API, and PostgreSQL persistence are implemented. The Angular gameplay screen now provides guest play, the browser timer, answer entry, automatic-parentheses feedback, reveal/skip actions, simple statistics, pending-request storage, and browser restoration. Separate history and statistics pages and production deployment remain later milestones. See [the Java game engine guide](java-game-engine.md), [the Java game API guide](java-game-api.md), and [the Angular gameplay guide](angular-gameplay.md) for their boundaries and verification commands.

## Stack and architecture

The selected baseline is Angular 22.3, Spring Boot 4.2, Java 25, and PostgreSQL 18. Node.js 26 is preferred; Node.js 24 at version 24.15 or later within the 24.x line is a compatible alternative. Pin compatible dependency versions and retain the frontend lockfile and Maven Wrapper.

Angular is a client-rendered single-page application. It handles presentation, input, navigation, browser timing, and pending-request feedback. It communicates with Java through an HTTP/JSON REST API and never accesses PostgreSQL directly.

The backend is one modular Spring MVC application. Controllers handle the HTTP contract; application services coordinate use cases and transactions; a plain Java domain layer implements rules, parsing, evaluation, and solving; persistence adapters handle PostgreSQL. Keep public request/response models separate from persistence entities. The Java backend owns mathematical correctness and stored game outcomes.

## Mathematical rules

Each round presents four cards with values from 1 through 10. Every card must be used exactly once, including the correct multiplicity when values repeat. Permitted operations are addition, subtraction, multiplication, division, and parentheses.

Every intermediate result must be a nonnegative integer. Reject division by zero and nonintegral division. The final result must equal exactly 24. Generate only puzzles solvable under these same rules. The solver and answer validator share legal-operation rules, and solutions remain private until revelation.

## Automatic parentheses

Apply assistance only when an answer is submitted; do not rewrite text while the player types.

If the input contains no explicit parentheses:

1. Validate syntax, allowed operators, and exact card usage.
2. Evaluate ordinary precedence first. Accept that interpretation if every operation is legal and the result is 24.
3. Otherwise, search the five possible complete binary groupings of four operands. Preserve the submitted operand order and every operator.
4. Accept a legal grouping producing 24, selecting deterministically if several work. Failure of one candidate must not prevent evaluation of the others.

If the player supplies any parentheses, evaluate the expression exactly as written, with ordinary precedence elsewhere.

Show the accepted interpretation clearly: for example, `3+1*7-1` may be accepted as `(3+1)*(7-1)`. Store both the submitted and accepted expressions and whether assistance was used. Do not present the ungrouped expression itself as mathematically equal to 24.

## Timing and restoration

Start the browser timer only when the puzzle is visible and playable. “Got It!” freezes the final thinking duration. Incorrect answers and subsequent corrections preserve that captured value.

Elapsed time continues while the player is away from the page. Cap running thinking time at 30 minutes. Reaching the cap stops the clock but leaves the puzzle available for answering, revealing, or skipping; it does not itself finish the round or record an incorrect answer. A later “Got It!” retains the capped state.

Keep timing status separate from round outcome. A capped round can subsequently be solved. Count that solve normally, but exclude capped durations from average thinking time and label them as having reached the limit.

Calculate elapsed time from a persisted browser start timestamp rather than counting display callbacks. Recalculate on refresh and return to the page, applying the cap immediately when necessary. Persist a capture or capped state locally with its round identifier before API synchronization. Restore it without restarting the clock, and reconcile pending synchronization with server state. Cleared browser storage cannot recover an unsent timing capture.

## State, requests, and delivery

Retain guest-session access in the same browser. Cross-device recovery and recovery after losing the guest credential are outside this scope. Keep credentials out of URLs; a session identifier alone must not authorize access to another session.

The browser generates a 32-byte cryptographically random credential, encodes it as unpadded base64url, and saves it locally before initializing a session. It sends the credential in the Authorization Bearer header on game API requests. The backend stores only a SHA-256 digest. Initializing with the same credential restores the same session, including after a lost initialization response. Guest credentials are separate from public session and round identifiers.

Make round creation, answer submission, and other state changes safe to retry after a lost response. Repeated operations must not create duplicate rounds or attempts. Angular must ignore stale responses for older rounds and preserve entered answers during connection failures. A timeout can leave the outcome unknown, so retry the same operation identifier.

Allow one active round per guest session. Creating another round requires completing, revealing, or explicitly skipping the current one. Round outcomes are ACTIVE, SOLVED, REVEALED, and SKIPPED. Timing states are NOT_CAPTURED, CAPTURED, and CAPPED; NOT_CAPTURED can remain on a skipped or revealed round.

Answer submissions include the browser's already-frozen thinking duration. The backend captures it atomically if a separate timing request has not arrived, or verifies that it matches the previously captured value. An incorrect answer never replaces that time. A matching delayed timing request is harmless after completion; a different duration is a conflict.

Serialize mutations for one guest session using a database row lock. A shared operation ledger records each successful operation identifier, its request fingerprint, and its response in the same transaction. Identical retries return that saved response before checking current round state; reusing an identifier for a different action or payload is a conflict. Responses include a round revision so Angular can reject stale snapshots, including older snapshots returned by legitimate retries.

Selected hosting is Vercel Hobby for Angular, Azure App Service F1 for the Java API, and a separate Neon Free PostgreSQL 18 database. Production deployment preparation uses same-origin Vercel API forwarding, exact frontend origins in the existing Java CORS policy, an explicit Java release workflow, and separate migration credentials. Verify free-tier availability, runtime compatibility, startup behavior, and database connectivity in the actual accounts before declaring the game live. Loading delays must not consume thinking time before a puzzle becomes playable. See [the deployment guide](deployment.md).

Use versioned Flyway migrations, reviewed and tested before application. Apply production migrations in a separate controlled release step, not automatically during API startup. The running application validates the expected schema.
