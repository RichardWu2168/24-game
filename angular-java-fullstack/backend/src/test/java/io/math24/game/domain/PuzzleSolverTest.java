package io.math24.game.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

class PuzzleSolverTest {
    private final PuzzleSolver solver = new PuzzleSolver();
    private final AnswerValidator validator = new AnswerValidator();

    @Test
    void agreesWithAnIndependentOracleForEveryPossibleCardMultiset() {
        List<Puzzle> puzzles = IntegerPuzzleOracle.allSortedPuzzles();
        assertEquals(715, puzzles.size());
        int solvable = 0;

        for (Puzzle puzzle : puzzles) {
            boolean expected = IntegerPuzzleOracle.isSolvable(puzzle.cards());
            Optional<String> solution = solver.solve(puzzle);
            assertEquals(expected, solution.isPresent(), () -> "Cards: " + puzzle.cards());
            if (solution.isPresent()) {
                solvable++;
                // Force literal validation; assistance must not conceal a bad rendered solution.
                AnswerResult checked = validator.validate(puzzle, "(" + solution.orElseThrow() + ")");
                assertTrue(checked.isCorrect(), () -> puzzle.cards() + ": " + solution.orElseThrow());
                assertFalse(checked.assisted());
            }
        }
        assertEquals(556, solvable);
    }

    @Test
    void handlesDifferentCardOrdersDeterministically() {
        List<Puzzle> orders = List.of(
                Puzzle.of(1, 3, 7, 1), Puzzle.of(7, 1, 1, 3),
                Puzzle.of(3, 7, 1, 1), Puzzle.of(1, 1, 7, 3));

        for (Puzzle puzzle : orders) {
            Optional<String> first = solver.solve(puzzle);
            assertTrue(first.isPresent());
            assertEquals(first, solver.solve(puzzle));
            assertTrue(validator.validate(puzzle, "(" + first.orElseThrow() + ")").isCorrect());
        }
    }

    @Test
    void rejectsTheClassicFractionOnlyPuzzleUnderOurIntegerRules() {
        assertTrue(solver.solve(Puzzle.of(3, 3, 8, 8)).isEmpty());
        assertTrue(solver.solve(Puzzle.of(1, 1, 1, 1)).isEmpty());
        assertTrue(solver.solve(Puzzle.of(1, 1, 1, 8)).isPresent());
    }
}
