# Math 24: agreed design

## Status and scope

This project is an independent Angular, Java, and PostgreSQL implementation of the Math 24 practice game, alongside the existing .NET implementation. The first release follows the established game experience and adds automatic parentheses during answer submission.

This is a casual, trusted-player application: guest play, browser-measured thinking time, no user accounts, and no leaderboards. Hosting must remain entirely free.

The current foundation stage establishes folders, toolchain configuration, and packages. Game behavior described here is agreed design, not functionality already implemented.

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

Make round creation, answer submission, and other state changes safe to retry after a lost response. Repeated operations must not create duplicate rounds or attempts. Angular must ignore stale responses for older rounds and preserve entered answers during connection failures. A timeout can leave the outcome unknown, so retry the same operation identifier.

Proposed hosting is Vercel for Angular, Azure App Service for the Java API, and a separate Neon database. Verify free-tier availability, runtime compatibility, startup behavior, and database connectivity early. Loading delays must not consume thinking time before a puzzle becomes playable.

Use versioned Flyway migrations, reviewed and tested before application. Apply production migrations in a separate controlled release step, not automatically during API startup. The running application validates the expected schema.
