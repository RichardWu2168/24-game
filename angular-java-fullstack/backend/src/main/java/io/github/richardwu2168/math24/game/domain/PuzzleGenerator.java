package io.github.richardwu2168.math24.game.domain;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.random.RandomGenerator;

/** Generates only puzzles solvable under the same rules used to check answers. */
public final class PuzzleGenerator {

    private final RandomGenerator random;

    public PuzzleGenerator() {
        this(RandomGenerator.getDefault());
    }

    /** Accepts an explicit random source for repeatable tests and simulations. */
    public PuzzleGenerator(RandomGenerator random) {
        this.random = Objects.requireNonNull(random, "random");
    }

    /**
     * Selects a solvable card multiset uniformly, then shuffles its display order.
     * No retry loop or fallback puzzle is needed. Synchronization also protects
     * injected random generators that are not themselves thread-safe.
     */
    public synchronized Puzzle generate() {
        List<Puzzle> catalog = Catalog.PUZZLES;
        Puzzle selected = catalog.get(random.nextInt(catalog.size()));
        List<Integer> shuffled = new ArrayList<>(selected.cards());
        for (int index = shuffled.size() - 1; index > 0; index--) {
            int other = random.nextInt(index + 1);
            int value = shuffled.get(index);
            shuffled.set(index, shuffled.get(other));
            shuffled.set(other, value);
        }
        return new Puzzle(shuffled);
    }

    /** The number of distinct solvable card multisets available for selection. */
    public int availablePuzzleCount() {
        return Catalog.PUZZLES.size();
    }

    private static List<Puzzle> buildCatalog() {
        PuzzleSolver solver = new PuzzleSolver();
        List<Puzzle> puzzles = new ArrayList<>();
        for (int first = GameRules.MIN_CARD_VALUE; first <= GameRules.MAX_CARD_VALUE; first++) {
            for (int second = first; second <= GameRules.MAX_CARD_VALUE; second++) {
                for (int third = second; third <= GameRules.MAX_CARD_VALUE; third++) {
                    for (int fourth = third; fourth <= GameRules.MAX_CARD_VALUE; fourth++) {
                        Puzzle puzzle = Puzzle.of(first, second, third, fourth);
                        if (solver.solve(puzzle).isPresent()) {
                            puzzles.add(puzzle);
                        }
                    }
                }
            }
        }
        if (puzzles.isEmpty()) {
            throw new IllegalStateException("No solvable puzzles are available under the game rules.");
        }
        return List.copyOf(puzzles);
    }

    // Lazy class initialization builds and safely publishes one immutable catalog
    // for all generators. It contains card values only, never revealed solutions.
    private static final class Catalog {
        private static final List<Puzzle> PUZZLES = buildCatalog();
    }
}
