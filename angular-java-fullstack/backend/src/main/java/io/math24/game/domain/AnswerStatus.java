package io.math24.game.domain;

/** Stable categories for an application service to map to its response contract. */
public enum AnswerStatus {
    CORRECT,
    INVALID_SYNTAX,
    INVALID_CARD_USAGE,
    ILLEGAL_OPERATION,
    NOT_TWENTY_FOUR
}
