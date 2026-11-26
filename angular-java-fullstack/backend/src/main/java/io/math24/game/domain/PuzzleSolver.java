package io.math24.game.domain;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.OptionalInt;
import java.util.Set;

/** Finds a legal solution while allowing the four cards to be reordered. */
public final class PuzzleSolver {

    /**
     * Returns a deterministic solution for these cards, or an empty result when
     * no solution exists under the nonnegative-integer arithmetic rules.
     */
    public Optional<String> solve(Puzzle puzzle) {
        Objects.requireNonNull(puzzle, "puzzle");
        List<Term> terms = new ArrayList<>(GameRules.CARD_COUNT);
        for (int card : puzzle.cards()) {
            terms.add(new Term(card, Expression.number(card)));
        }
        return search(terms, new HashSet<>()).map(Expression::render);
    }

    private static Optional<Expression> search(List<Term> terms, Set<List<Integer>> deadStates) {
        if (terms.size() == 1) {
            Term result = terms.getFirst();
            return result.value() == GameRules.TARGET
                    ? Optional.of(result.expression())
                    : Optional.empty();
        }

        // Future solvability depends on the remaining values, not on the
        // expressions that produced them. Cache only states proven unsolvable.
        List<Integer> state = terms.stream().map(Term::value).sorted().toList();
        if (deadStates.contains(state)) {
            return Optional.empty();
        }

        for (int leftIndex = 0; leftIndex < terms.size() - 1; leftIndex++) {
            for (int rightIndex = leftIndex + 1; rightIndex < terms.size(); rightIndex++) {
                Term left = terms.get(leftIndex);
                Term right = terms.get(rightIndex);
                List<Term> remaining = new ArrayList<>(terms.size() - 2);
                for (int index = 0; index < terms.size(); index++) {
                    if (index != leftIndex && index != rightIndex) {
                        remaining.add(terms.get(index));
                    }
                }

                for (Operator operator : Operator.values()) {
                    Optional<Expression> solution = combine(left, operator, right, remaining, deadStates);
                    if (solution.isPresent()) {
                        return solution;
                    }

                    // Addition and multiplication are commutative. Subtraction
                    // and division must also be tried in the opposite order.
                    if ((operator == Operator.SUBTRACT || operator == Operator.DIVIDE)
                            && left.value() != right.value()) {
                        solution = combine(right, operator, left, remaining, deadStates);
                        if (solution.isPresent()) {
                            return solution;
                        }
                    }
                }
            }
        }

        deadStates.add(state);
        return Optional.empty();
    }

    private static Optional<Expression> combine(
            Term left,
            Operator operator,
            Term right,
            List<Term> remaining,
            Set<List<Integer>> deadStates) {
        OptionalInt value = operator.apply(left.value(), right.value());
        if (value.isEmpty()) {
            return Optional.empty();
        }

        List<Term> next = new ArrayList<>(remaining);
        next.add(new Term(value.getAsInt(), Expression.binary(left.expression(), operator, right.expression())));
        return search(next, deadStates);
    }

    private record Term(int value, Expression expression) {
    }
}
