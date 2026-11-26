# Java game engine

The engine lives in `io.math24.game.domain`. It uses plain
Java and has no dependency on Spring, HTTP, PostgreSQL, browser timing, or user
sessions. This milestone implements the mathematics; the game API, persistence,
and Angular game screen will connect to it in later milestones.

## Public API

| Type or method | Purpose |
| --- | --- |
| `Puzzle(List<Integer> cards)` | Immutable four-card puzzle in display order. Values must be from 1 through 10; repeated values are allowed. Invalid puzzle definitions throw `IllegalArgumentException`. |
| `Puzzle.of(a, b, c, d)` | Convenient constructor for four cards. |
| `AnswerValidator.validate(puzzle, input)` | Checks an answer and returns an `AnswerResult`. The validator is stateless. |
| `AnswerResult` | Carries the status, submitted text, optional interpreted expression and value, assistance flag, and a human-readable message. `isCorrect()` reports acceptance. |
| `AnswerStatus` | Stable result categories for an application service to map to its response contract. |
| `PuzzleSolver.solve(puzzle)` | Returns `Optional<String>` containing one legal solution, or an empty result when none exists. It may reorder the cards. |
| `PuzzleGenerator.generate()` | Returns a shuffled solvable `Puzzle`, containing cards only. |
| `PuzzleGenerator(RandomGenerator random)` | Supplies a random source for reproducible tests or simulations. The default constructor supplies one automatically. |
| `PuzzleGenerator.availablePuzzleCount()` | Returns the number of distinct solvable card multisets in the shared catalog: 556. |

The application layer should map these domain results to explicit API response
models. A normal puzzle response should contain only the cards. Call the solver
for internal checks or an authorized reveal use case; do not attach its answer
to every puzzle response.

### Example

```java
Puzzle puzzle = Puzzle.of(3, 1, 7, 1);
AnswerResult answer = new AnswerValidator().validate(puzzle, "3+1*7-1");

answer.status();                               // CORRECT
answer.interpretedExpression().orElseThrow();   // (3+1)*(7-1)
answer.value().orElseThrow();                   // 24
answer.assisted();                             // true

Optional<String> solution = new PuzzleSolver().solve(puzzle);
Puzzle next = new PuzzleGenerator().generate();
```

The domain types in the example are imported from the package above, and
`Optional` is `java.util.Optional`.

## Arithmetic and input rules

Every answer must use each supplied card exactly once, with the correct count
of repeated values. Every intermediate result must be a **nonnegative integer**.
Zero is allowed. Division by zero, nonintegral division, and negative
intermediate values are illegal even when later operations would produce 24.
The final result must equal exactly 24. Validation and solving share the same
legal-operation implementation and use integer arithmetic.

The parser accepts ASCII card numerals `1` through `10`, the operators `+`, `-`,
`*`, `/`, and parentheses. It also accepts `×`, `÷`, and `−` as aliases and
normalizes them to `*`, `/`, and `-` in the interpreted expression. Whitespace
between tokens is accepted, including line breaks and Unicode space characters.
Whitespace cannot join separate digits into a card number.

Leading zeros, unary signs, decimal numbers, fraction glyphs such as `½`, implicit
multiplication, powers, functions, variables, and other characters are rejected.
For example, write `2*(3+4)` rather than `2(3+4)`. An expression may contain at
most **256 UTF-16 code units**, including whitespace, matching Java's
`String.length()`. Null input is treated as an empty submission and rejected
with `INVALID_SYNTAX`. The parser does not execute submitted code.

### Result categories

| Status | Meaning |
| --- | --- |
| `CORRECT` | The accepted interpretation uses the cards legally and equals 24. |
| `INVALID_SYNTAX` | The input is malformed, empty, too long, or uses unsupported syntax. |
| `INVALID_CARD_USAGE` | The submitted numbers do not match the puzzle's four cards exactly. |
| `ILLEGAL_OPERATION` | The ordinary interpretation has an illegal intermediate operation and no permitted automatic grouping succeeds. |
| `NOT_TWENTY_FOUR` | Ordinary evaluation is legal but does not equal 24, and no permitted automatic grouping succeeds. |

`submittedExpression` preserves the player's text, except that null becomes an
empty string. `interpretedExpression` preserves the evaluated grouping while
normalizing spacing and operator aliases. It is absent for syntax and card-usage
errors. For an arithmetic error, the interpretation is present but `value` is
empty. For a rejected answer, any interpretation and value describe the ordinary
parse, not an alternative suggested answer. `assisted` is true only when
regrouping was needed to accept the answer. Application code should use the
status rather than parse the explanatory message.

## Automatic parentheses

Assistance runs when the application submits an answer for checking. It does
not rewrite partially typed text.

The validator first checks syntax and exact card usage. It then evaluates
ordinary precedence: multiplication and division before addition and subtraction,
with left associativity within each level. A legal result of 24 is accepted
immediately with `assisted = false`.

If the text contains **any explicit parentheses**, that grouping is respected
and automatic regrouping is disabled. Even redundant outer parentheses make
the submission explicit.

Otherwise, if ordinary evaluation is wrong or illegal, the validator tries the
following five complete groupings in this fixed order. Here `a` through `d` are
the submitted numbers, and `o1` through `o3` are the submitted operators:

1. Left chain: `((a o1 b) o2 c) o3 d`
2. Left nested: `(a o1 (b o2 c)) o3 d`
3. Balanced: `(a o1 b) o2 (c o3 d)`
4. Right nested: `a o1 ((b o2 c) o3 d)`
5. Right chain: `a o1 (b o2 (c o3 d))`

The first legal 24 wins. An illegal candidate does not stop the search. The
numbers stay in their submitted order and every operator stays unchanged.
Unlike this assistance, the puzzle solver can reorder the cards to find a
solution.

For cards `3, 1, 7, 1`, ordinary `3+1*7-1` gives 9, so assistance accepts
`(3+1)*(7-1)`. Submitting `(3+1*7-1)` instead produces `NOT_TWENTY_FOUR` with
value 9 because its explicit parentheses disable assistance. Display the
accepted interpretation when assistance succeeds, and retain both expressions
when persistence is added.

## Solving and puzzle selection

The solver combines pairs of remaining terms recursively. It considers both
orders for subtraction and division, covers card permutations and grouping
shapes, and caches only states that have been proven unsolvable. For the same
ordered puzzle, it returns the same first solution. It never relies on
fractional intermediates or floating-point comparisons.

There are **715** possible unordered four-card multisets using values 1 through
10. Under the agreed integer rules, **556** are solvable. A lazy, immutable,
in-process catalog stores those solvable puzzles once. It contains card values,
not solutions.

Each generation selects one catalog entry uniformly and then shuffles its
display order. This gives equal weight to solvable multisets; it does not mimic
dealing from a physical deck or weight puzzles by difficulty. There is no
rejection loop, retry limit, or fallback puzzle. Generation synchronizes access
to the supplied random source. A seeded `RandomGenerator`, such as
`new java.util.Random(24)`, makes a sequence reproducible.

## Run the tests

From the project root on Windows:

```powershell
Set-Location 'C:\Projects\24-game\angular-java-fullstack'
.\scripts\Invoke-Backend.ps1 -Task EngineTest
```

From `angular-java-fullstack/backend` on Linux or macOS, with JDK 25 selected:

```sh
./mvnw -Pengine-tests test
```

The `engine-tests` Maven profile selects the domain tests without starting
Spring Boot. These commands do not require PostgreSQL, Docker, or `infra/.env`.
The Maven Wrapper may download dependencies on its first run.

Workspace verification on Java 25 passed **80 tests**, with zero failures,
errors, or skips: 63 answer-validation cases, 10 puzzle-definition cases,
3 solver tests, and 4 generator tests.

The included tests cover parser boundaries and invalid input, duplicate cards,
operator aliases, ordinary precedence, explicit parentheses, all five automatic
groupings, deterministic tie-breaking, and illegal intermediate results. They
also compare solver solvability for all 715 multisets with an independent
subset-based dynamic-programming oracle. Returned solutions are checked with
explicit parentheses, preventing assistance from concealing a wrong solver
expression. Generator tests check 256 generated puzzles and cover reproducible
seeds and finite generation with a constant random source.

The existing Windows command below runs **all** Java tests, including the
Spring context test, and still requires the configured local PostgreSQL database
and `infra/.env`:

```powershell
.\scripts\Invoke-Backend.ps1 -Task Test
```

The domain suite establishes mathematical behavior. API authorization, request
retries, database transactions, browser timing, and UI behavior require their
own integration work in later milestones.
