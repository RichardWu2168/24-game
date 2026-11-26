package io.math24.game.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.Random;
import java.util.random.RandomGenerator;

import org.junit.jupiter.api.Test;

class PuzzleGeneratorTest {
    @Test
    void generatesOnlySolvableFourCardPuzzles() {
        PuzzleGenerator generator = new PuzzleGenerator(new Random(20261126L));
        PuzzleSolver solver = new PuzzleSolver();
        AnswerValidator validator = new AnswerValidator();
        boolean sawUnsortedDisplayOrder = false;

        assertEquals(556, generator.availablePuzzleCount());
        for (int round = 0; round < 256; round++) {
            Puzzle puzzle = generator.generate();
            assertEquals(4, puzzle.cards().size());
            assertTrue(puzzle.cards().stream().allMatch(card -> card >= 1 && card <= 10));
            assertTrue(IntegerPuzzleOracle.isSolvable(puzzle.cards()), () -> "Cards: " + puzzle.cards());
            String solution = solver.solve(puzzle).orElseThrow();
            AnswerResult checked = validator.validate(puzzle, "(" + solution + ")");
            assertTrue(checked.isCorrect());
            assertFalse(checked.assisted());
            sawUnsortedDisplayOrder |= !puzzle.cards().equals(puzzle.cards().stream().sorted().toList());
        }
        assertTrue(sawUnsortedDisplayOrder, "The display order should be shuffled.");
    }

    @Test
    void anInjectedSeedMakesGenerationReproducible() {
        PuzzleGenerator first = new PuzzleGenerator(new Random(24));
        PuzzleGenerator second = new PuzzleGenerator(new Random(24));

        for (int round = 0; round < 32; round++) {
            assertEquals(first.generate(), second.generate());
        }
    }

    @Test
    void constantRandomnessCannotCauseAnEndlessRetryLoop() {
        RandomGenerator constant = () -> 0L;
        PuzzleGenerator generator = new PuzzleGenerator(constant);

        assertTimeoutPreemptively(Duration.ofSeconds(10), () -> {
            for (int round = 0; round < 5; round++) {
                assertTrue(IntegerPuzzleOracle.isSolvable(generator.generate().cards()));
            }
        });
    }

    @Test
    void theDefaultGeneratorAlsoProducesAPlayablePuzzle() {
        Puzzle puzzle = new PuzzleGenerator().generate();

        assertTrue(IntegerPuzzleOracle.isSolvable(puzzle.cards()));
    }
}
