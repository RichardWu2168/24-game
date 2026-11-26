package io.github.richardwu2168.math24.game.domain;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Independent test oracle: collect reachable integers for every subset of card
 * positions. It does not use the production solver, parser, AST, or Operator.
 */
final class IntegerPuzzleOracle {
    private IntegerPuzzleOracle() {
    }

    static boolean isSolvable(List<Integer> cards) {
        int subsetCount = 1 << cards.size();
        List<Set<Integer>> reachable = new ArrayList<>(subsetCount);
        for (int mask = 0; mask < subsetCount; mask++) {
            reachable.add(new HashSet<>());
        }

        for (int mask = 1; mask < subsetCount; mask++) {
            Set<Integer> results = reachable.get(mask);
            if (Integer.bitCount(mask) == 1) {
                results.add(cards.get(Integer.numberOfTrailingZeros(mask)));
                continue;
            }
            for (int left = (mask - 1) & mask; left > 0; left = (left - 1) & mask) {
                int right = mask ^ left;
                if (right == 0 || left > right) {
                    continue;
                }
                for (int a : reachable.get(left)) {
                    for (int b : reachable.get(right)) {
                        results.add(a + b);
                        results.add(a * b);
                        if (a >= b) {
                            results.add(a - b);
                        }
                        if (b >= a) {
                            results.add(b - a);
                        }
                        if (b != 0 && a % b == 0) {
                            results.add(a / b);
                        }
                        if (a != 0 && b % a == 0) {
                            results.add(b / a);
                        }
                    }
                }
            }
        }
        return reachable.get(subsetCount - 1).contains(24);
    }

    static List<Puzzle> allSortedPuzzles() {
        List<Puzzle> puzzles = new ArrayList<>();
        for (int a = 1; a <= 10; a++) {
            for (int b = a; b <= 10; b++) {
                for (int c = b; c <= 10; c++) {
                    for (int d = c; d <= 10; d++) {
                        puzzles.add(Puzzle.of(a, b, c, d));
                    }
                }
            }
        }
        return List.copyOf(puzzles);
    }
}
