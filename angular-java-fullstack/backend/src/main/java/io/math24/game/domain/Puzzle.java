package io.math24.game.domain;

import java.util.List;

/** Four immutable cards in their display order. Repeated values are allowed. */
public record Puzzle(List<Integer> cards) {
    public Puzzle {
        if (cards == null || cards.size() != GameRules.CARD_COUNT) {
            throw new IllegalArgumentException("A puzzle must contain exactly four cards.");
        }
        for (Integer card : cards) {
            if (card == null || card < GameRules.MIN_CARD_VALUE || card > GameRules.MAX_CARD_VALUE) {
                throw new IllegalArgumentException("Card values must be integers from 1 through 10.");
            }
        }
        cards = List.copyOf(cards);
    }

    public static Puzzle of(int first, int second, int third, int fourth) {
        return new Puzzle(List.of(first, second, third, fourth));
    }
}
