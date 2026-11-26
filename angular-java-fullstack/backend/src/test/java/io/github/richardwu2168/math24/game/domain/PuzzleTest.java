package io.github.richardwu2168.math24.game.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class PuzzleTest {
    @Test
    void retainsDisplayOrderAndAllowsRepeatedBoundaryValues() {
        Puzzle puzzle = Puzzle.of(10, 1, 10, 1);

        assertEquals(List.of(10, 1, 10, 1), puzzle.cards());
    }

    @Test
    void cardsCannotBeChangedThroughTheConstructorArgumentOrAccessor() {
        List<Integer> cards = new ArrayList<>(List.of(1, 2, 3, 4));
        Puzzle puzzle = new Puzzle(cards);
        cards.set(0, 10);

        assertEquals(List.of(1, 2, 3, 4), puzzle.cards());
        assertThrows(UnsupportedOperationException.class, () -> puzzle.cards().set(0, 10));
    }

    @ParameterizedTest
    @MethodSource("invalidCards")
    void rejectsAnythingOtherThanFourCardsFromOneThroughTen(List<Integer> cards) {
        assertThrows(IllegalArgumentException.class, () -> new Puzzle(cards));
    }

    private static Stream<Arguments> invalidCards() {
        return Stream.of(
                Arguments.of((Object) null),
                Arguments.of(List.of()),
                Arguments.of(List.of(1, 2, 3)),
                Arguments.of(List.of(1, 2, 3, 4, 5)),
                Arguments.of(List.of(0, 2, 3, 4)),
                Arguments.of(List.of(-1, 2, 3, 4)),
                Arguments.of(List.of(11, 2, 3, 4)),
                Arguments.of(Arrays.asList(1, null, 3, 4)));
    }
}
