package io.math24.game.domain;

import java.util.OptionalInt;

/** The single arithmetic policy used by both evaluation and puzzle solving. */
enum Operator {
    ADD('+', 1),
    SUBTRACT('-', 1),
    MULTIPLY('*', 2),
    DIVIDE('/', 2);

    private final char symbol;
    private final int precedence;

    Operator(char symbol, int precedence) {
        this.symbol = symbol;
        this.precedence = precedence;
    }

    char symbol() {
        return symbol;
    }

    int precedence() {
        return precedence;
    }

    OptionalInt apply(int left, int right) {
        if (left < 0 || right < 0) {
            return OptionalInt.empty();
        }
        long result = switch (this) {
            case ADD -> (long) left + right;
            case SUBTRACT -> (long) left - right;
            case MULTIPLY -> (long) left * right;
            case DIVIDE -> right == 0 || left % right != 0 ? -1 : left / right;
        };
        return result >= 0 && result <= Integer.MAX_VALUE
                ? OptionalInt.of((int) result)
                : OptionalInt.empty();
    }

    static Operator fromSymbol(char symbol) {
        return switch (symbol) {
            case '+' -> ADD;
            case '-', '\u2212' -> SUBTRACT;
            case '*', '\u00d7' -> MULTIPLY;
            case '/', '\u00f7' -> DIVIDE;
            default -> throw new IllegalArgumentException("Unsupported arithmetic operator.");
        };
    }
}
