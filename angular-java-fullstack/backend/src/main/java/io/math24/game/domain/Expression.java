package io.math24.game.domain;

import java.util.Objects;
import java.util.OptionalInt;

/** Parsed arithmetic only; no scripting or general-purpose expression evaluation. */
sealed interface Expression permits Expression.Number, Expression.Binary {
    OptionalInt evaluate();

    String render();

    static Expression number(int value) {
        return new Number(value);
    }

    static Expression binary(Expression left, Operator operator, Expression right) {
        return new Binary(left, operator, right);
    }

    record Number(int value) implements Expression {
        @Override
        public OptionalInt evaluate() {
            return OptionalInt.of(value);
        }

        @Override
        public String render() {
            return Integer.toString(value);
        }
    }

    record Binary(Expression left, Operator operator, Expression right) implements Expression {
        public Binary {
            Objects.requireNonNull(left, "left");
            Objects.requireNonNull(operator, "operator");
            Objects.requireNonNull(right, "right");
        }

        @Override
        public OptionalInt evaluate() {
            OptionalInt leftValue = left.evaluate();
            if (leftValue.isEmpty()) {
                return OptionalInt.empty();
            }
            OptionalInt rightValue = right.evaluate();
            return rightValue.isEmpty()
                    ? OptionalInt.empty()
                    : operator.apply(leftValue.getAsInt(), rightValue.getAsInt());
        }

        @Override
        public String render() {
            return renderChild(left, false) + operator.symbol() + renderChild(right, true);
        }

        private String renderChild(Expression child, boolean onRight) {
            String rendered = child.render();
            if (child instanceof Binary binary
                    && (binary.operator.precedence() < operator.precedence()
                        || (onRight && binary.operator.precedence() == operator.precedence()))) {
                return "(" + rendered + ")";
            }
            return rendered;
        }
    }
}
