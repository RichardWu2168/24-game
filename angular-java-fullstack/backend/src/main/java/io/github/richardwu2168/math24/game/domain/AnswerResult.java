package io.github.richardwu2168.math24.game.domain;

import java.util.Objects;
import java.util.Optional;
import java.util.OptionalInt;

/**
 * Keeps the submitted text and its interpretation separate. For a rejected answer,
 * any interpretation/value describes ordinary parsing, never a guessed correction.
 * Assistance means a different grouping was needed to make a legal 24.
 */
public record AnswerResult(
        AnswerStatus status,
        String submittedExpression,
        Optional<String> interpretedExpression,
        OptionalInt value,
        boolean assisted,
        String message) {

    public AnswerResult {
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(submittedExpression, "submittedExpression");
        Objects.requireNonNull(interpretedExpression, "interpretedExpression");
        Objects.requireNonNull(value, "value");
        Objects.requireNonNull(message, "message");
        if (status == AnswerStatus.CORRECT
                && (interpretedExpression.isEmpty() || value.isEmpty()
                    || value.getAsInt() != GameRules.TARGET)) {
            throw new IllegalArgumentException("A correct answer needs an interpretation equal to 24.");
        }
        if (assisted && status != AnswerStatus.CORRECT) {
            throw new IllegalArgumentException("Assistance is recorded only for accepted answers.");
        }
    }

    public boolean isCorrect() {
        return status == AnswerStatus.CORRECT;
    }
}
