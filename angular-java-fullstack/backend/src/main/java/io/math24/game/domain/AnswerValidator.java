package io.math24.game.domain;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.OptionalInt;

/** Stateless answer checking with ordinary precedence and optional regrouping. */
public final class AnswerValidator {
    public AnswerResult validate(Puzzle puzzle, String input) {
        Objects.requireNonNull(puzzle, "puzzle");
        String submitted = Objects.requireNonNullElse(input, "");
        if (submitted.length() > GameRules.MAX_EXPRESSION_LENGTH) {
            return invalid(AnswerStatus.INVALID_SYNTAX, submitted,
                    "An expression may contain at most 256 characters.");
        }

        Parsed parsed;
        try {
            parsed = new Parser(submitted).parse();
        } catch (ParseFailure failure) {
            return invalid(failure.status, submitted, failure.getMessage());
        }
        if (!usesExactlyTheseCards(puzzle, parsed.numbers())) {
            return invalid(AnswerStatus.INVALID_CARD_USAGE, submitted,
                    "Use each of the four supplied cards exactly once.");
        }

        OptionalInt ordinaryValue = parsed.expression().evaluate();
        if (isTarget(ordinaryValue)) {
            return accepted(submitted, parsed.expression(), false);
        }

        boolean hasExplicitParentheses = submitted.indexOf('(') >= 0 || submitted.indexOf(')') >= 0;
        if (!hasExplicitParentheses) {
            for (Expression candidate : groupings(parsed.numbers(), parsed.operators())) {
                if (isTarget(candidate.evaluate())) {
                    return accepted(submitted, candidate, true);
                }
            }
        }

        AnswerStatus status = ordinaryValue.isPresent()
                ? AnswerStatus.NOT_TWENTY_FOUR : AnswerStatus.ILLEGAL_OPERATION;
        String message = ordinaryValue.isPresent()
                ? "This expression evaluates to " + ordinaryValue.getAsInt() + ", not 24."
                : "Every intermediate result must be a nonnegative integer; division by zero is not allowed.";
        return new AnswerResult(status, submitted, Optional.of(parsed.expression().render()),
                ordinaryValue, false, message);
    }

    private static boolean isTarget(OptionalInt value) {
        return value.isPresent() && value.getAsInt() == GameRules.TARGET;
    }

    private static AnswerResult accepted(String submitted, Expression expression, boolean assisted) {
        return new AnswerResult(AnswerStatus.CORRECT, submitted, Optional.of(expression.render()),
                OptionalInt.of(GameRules.TARGET), assisted, "Correct.");
    }

    private static AnswerResult invalid(AnswerStatus status, String submitted, String message) {
        return new AnswerResult(status, submitted, Optional.empty(), OptionalInt.empty(), false, message);
    }

    private static boolean usesExactlyTheseCards(Puzzle puzzle, List<Integer> numbers) {
        if (numbers.size() != GameRules.CARD_COUNT) {
            return false;
        }
        int[] counts = new int[GameRules.MAX_CARD_VALUE + 1];
        for (int card : puzzle.cards()) {
            counts[card]++;
        }
        for (int number : numbers) {
            if (number < GameRules.MIN_CARD_VALUE || number > GameRules.MAX_CARD_VALUE
                    || --counts[number] < 0) {
                return false;
            }
        }
        return true;
    }

    /** Fixed tie-break order: left chain, left nested, balanced, right nested, right chain. */
    private static List<Expression> groupings(List<Integer> numbers, List<Operator> operators) {
        Expression a = Expression.number(numbers.get(0));
        Expression b = Expression.number(numbers.get(1));
        Expression c = Expression.number(numbers.get(2));
        Expression d = Expression.number(numbers.get(3));
        Operator first = operators.get(0);
        Operator second = operators.get(1);
        Operator third = operators.get(2);
        return List.of(
                Expression.binary(Expression.binary(Expression.binary(a, first, b), second, c), third, d),
                Expression.binary(Expression.binary(a, first, Expression.binary(b, second, c)), third, d),
                Expression.binary(Expression.binary(a, first, b), second, Expression.binary(c, third, d)),
                Expression.binary(a, first, Expression.binary(Expression.binary(b, second, c), third, d)),
                Expression.binary(a, first, Expression.binary(b, second, Expression.binary(c, third, d))));
    }

    private record Parsed(Expression expression, List<Integer> numbers, List<Operator> operators) {
    }

    /** Recursive descent: sum -> product -> card or parenthesized sum. */
    private static final class Parser {
        private final String input;
        private final List<Integer> numbers = new ArrayList<>();
        private final List<Operator> operators = new ArrayList<>();
        private int position;

        private Parser(String input) {
            this.input = input;
        }

        private Parsed parse() {
            Expression expression = sum();
            skipWhitespace();
            if (position != input.length()) {
                throw syntax("Expected an operator or the end of the expression.");
            }
            return new Parsed(expression, List.copyOf(numbers), List.copyOf(operators));
        }

        private Expression sum() {
            Expression expression = product();
            while (true) {
                skipWhitespace();
                if (!at('+') && !at('-') && !at('\u2212')) {
                    return expression;
                }
                Operator operator = takeOperator();
                expression = Expression.binary(expression, operator, product());
            }
        }

        private Expression product() {
            Expression expression = primary();
            while (true) {
                skipWhitespace();
                if (!at('*') && !at('/') && !at('\u00d7') && !at('\u00f7')) {
                    return expression;
                }
                Operator operator = takeOperator();
                expression = Expression.binary(expression, operator, primary());
            }
        }

        private Expression primary() {
            skipWhitespace();
            if (at('(')) {
                position++;
                Expression expression = sum();
                skipWhitespace();
                if (!at(')')) {
                    throw syntax("A closing parenthesis is missing.");
                }
                position++;
                return expression;
            }
            if (position >= input.length() || !isDigit(input.charAt(position))) {
                throw syntax("Expected a card number or an opening parenthesis.");
            }
            int start = position;
            while (position < input.length() && isDigit(input.charAt(position))) {
                position++;
            }
            String token = input.substring(start, position);
            if (token.length() > 1 && token.charAt(0) == '0') {
                throw syntax("Write card numbers without leading zeros.");
            }
            if (token.length() > 2) {
                throw new ParseFailure(AnswerStatus.INVALID_CARD_USAGE,
                        "Card values must be integers from 1 through 10.");
            }
            int number = Integer.parseInt(token);
            numbers.add(number);
            return Expression.number(number);
        }

        private Operator takeOperator() {
            Operator operator = Operator.fromSymbol(input.charAt(position++));
            operators.add(operator);
            return operator;
        }

        private boolean at(char character) {
            return position < input.length() && input.charAt(position) == character;
        }

        private void skipWhitespace() {
            while (position < input.length()) {
                char character = input.charAt(position);
                if (!Character.isWhitespace(character) && !Character.isSpaceChar(character)) {
                    return;
                }
                position++;
            }
        }

        private ParseFailure syntax(String message) {
            return new ParseFailure(AnswerStatus.INVALID_SYNTAX,
                    message + " Position: " + (position + 1) + ".");
        }

        private static boolean isDigit(char character) {
            return character >= '0' && character <= '9';
        }
    }

    private static final class ParseFailure extends RuntimeException {
        private final AnswerStatus status;

        private ParseFailure(AnswerStatus status, String message) {
            super(message);
            this.status = status;
        }
    }
}
