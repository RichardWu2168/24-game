package io.math24.game.domain;

/** Shared limits for the four-card, nonnegative-integer version of Math 24. */
public final class GameRules {
    public static final int CARD_COUNT = 4;
    public static final int MIN_CARD_VALUE = 1;
    public static final int MAX_CARD_VALUE = 10;
    public static final int TARGET = 24;
    public static final int MAX_EXPRESSION_LENGTH = 256;

    private GameRules() {
    }
}
