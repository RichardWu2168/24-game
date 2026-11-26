package io.math24.game.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.OptionalInt;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class AnswerValidatorTest {
    private final AnswerValidator validator = new AnswerValidator();

    @ParameterizedTest
    @MethodSource("ordinaryCorrectAnswers")
    void acceptsLegalOrdinaryInterpretationsWithoutAssistance(
            Puzzle puzzle, String input, String interpretation) {
        AnswerResult result = validator.validate(puzzle, input);

        assertCorrect(result, false);
        assertEquals(input, result.submittedExpression());
        assertEquals(interpretation, result.interpretedExpression().orElseThrow());
        assertExplicitRoundTrip(puzzle, result);
    }

    private static Stream<Arguments> ordinaryCorrectAnswers() {
        return Stream.of(
                Arguments.of(Puzzle.of(6, 4, 1, 1), "6*4+1-1", "6*4+1-1"),
                Arguments.of(Puzzle.of(1, 2, 3, 4), "(1+2+3)*4", "(1+2+3)*4"),
                Arguments.of(Puzzle.of(6, 4, 1, 1), "6*4+(1-1)", "6*4+(1-1)"),
                Arguments.of(Puzzle.of(10, 2, 1, 6), " \t10 × (2 + 1) − 6\n", "10*(2+1)-6"),
                Arguments.of(Puzzle.of(8, 2, 1, 6), "8 ÷ 2 ÷ 1 × 6", "8/2/1*6"),
                // A different grouping also makes 24; ordinary precedence must still win.
                Arguments.of(Puzzle.of(1, 1, 3, 8), "1-1+3*8", "1-1+3*8"),
                Arguments.of(Puzzle.of(1, 2, 3, 4), "(((1+2+3)*4))", "(1+2+3)*4"),
                Arguments.of(Puzzle.of(1, 2, 3, 4), "\u00a0(1+2+3)\u00a0*\u00a04\u00a0", "(1+2+3)*4"),
                Arguments.of(Puzzle.of(8, 4, 2, 6), "8/(4/2)*6", "8/(4/2)*6"),
                Arguments.of(Puzzle.of(10, 4, 2, 3), "(10-(4-2))*3", "(10-(4-2))*3"),
                Arguments.of(Puzzle.of(8, 6, 2, 1), "8*(6/2)*1", "8*(6/2)*1"));
    }

    @Test
    void addsTheRequestedParenthesesAndRetainsTheOriginalInput() {
        String input = " 3 + 1 × 7 − 1 ";
        Puzzle puzzle = Puzzle.of(3, 1, 7, 1);

        AnswerResult result = validator.validate(puzzle, input);

        assertCorrect(result, true);
        assertEquals(input, result.submittedExpression());
        assertEquals("(3+1)*(7-1)", result.interpretedExpression().orElseThrow());
        assertExplicitRoundTrip(puzzle, result);
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("uniqueWinningGroupings")
    void canFindEachOfTheFiveGroupingsWithoutChangingNumbersOrOperators(
            String shape, Puzzle puzzle, String input) {
        AnswerResult result = validator.validate(puzzle, input);

        assertCorrect(result, true);
        assertEquals(input, result.interpretedExpression().orElseThrow().replace("(", "").replace(")", ""));
        assertExplicitRoundTrip(puzzle, result);
    }

    private static Stream<Arguments> uniqueWinningGroupings() {
        // Each input has exactly one legal full grouping producing 24.
        return Stream.of(
                Arguments.of("left chain", Puzzle.of(1, 1, 2, 8), "1/1+2*8"),
                // The first candidate has nonintegral division: ((1+4)/2)*8.
                Arguments.of("left nested, after an illegal candidate", Puzzle.of(1, 4, 2, 8), "1+4/2*8"),
                Arguments.of("balanced", Puzzle.of(1, 1, 2, 10), "1+1*2+10"),
                Arguments.of("right nested", Puzzle.of(2, 1, 10, 2), "2+1+10*2"),
                Arguments.of("right chain", Puzzle.of(2, 2, 1, 10), "2+2*1+10"));
    }

    @ParameterizedTest
    @MethodSource("ordinaryIllegalButAssistableAnswers")
    void anIllegalOrdinaryInterpretationDoesNotPreventAssistance(Puzzle puzzle, String input) {
        AnswerResult result = validator.validate(puzzle, input);

        assertCorrect(result, true);
        assertExplicitRoundTrip(puzzle, result);
    }

    private static Stream<Arguments> ordinaryIllegalButAssistableAnswers() {
        return Stream.of(
                Arguments.of(Puzzle.of(1, 3, 1, 8), "1+3-1*8"),
                Arguments.of(Puzzle.of(8, 3, 1, 6), "8/3-1*6"));
    }

    @Test
    void choosesTheSameInterpretationWhenSeveralGroupingsWork() {
        Puzzle puzzle = Puzzle.of(1, 1, 1, 8);
        AnswerResult first = validator.validate(puzzle, "1+1+1*8");
        assertCorrect(first, true);

        for (int attempt = 0; attempt < 20; attempt++) {
            assertEquals(first.interpretedExpression(),
                    validator.validate(puzzle, "1+1+1*8").interpretedExpression());
        }
    }

    @ParameterizedTest
    @MethodSource("explicitIncorrectAnswers")
    void anyExplicitParenthesesDisableAutomaticRegrouping(String input, int value) {
        AnswerResult result = validator.validate(Puzzle.of(3, 1, 7, 1), input);

        assertEquals(AnswerStatus.NOT_TWENTY_FOUR, result.status());
        assertEquals(OptionalInt.of(value), result.value());
        assertFalse(result.assisted());
        assertFalse(result.isCorrect());
    }

    private static Stream<Arguments> explicitIncorrectAnswers() {
        return Stream.of(
                Arguments.of("(3)+1*7-1", 9),
                Arguments.of("3+(1*7)-1", 9),
                Arguments.of("(3+1)*7-1", 27),
                Arguments.of("3+1*(7-1)", 9));
    }

    @ParameterizedTest
    @MethodSource("precedenceExamples")
    void observesOrdinaryPrecedenceAndLeftAssociativity(Puzzle puzzle, String input, int expected) {
        AnswerResult result = validator.validate(puzzle, input);

        assertEquals(AnswerStatus.NOT_TWENTY_FOUR, result.status());
        assertEquals(OptionalInt.of(expected), result.value());
        assertFalse(result.assisted());
    }

    private static Stream<Arguments> precedenceExamples() {
        return Stream.of(
                Arguments.of(Puzzle.of(1, 2, 3, 4), "(1+2*3+4)", 11),
                Arguments.of(Puzzle.of(10, 2, 1, 3), "10-2-1+(3)", 10),
                Arguments.of(Puzzle.of(8, 2, 2, 3), "8/2/2*(3)", 6),
                Arguments.of(Puzzle.of(1, 1, 2, 3), "(1-1)/2+3", 3));
    }

    @Test
    void doesNotReplaceOperatorsOrSolveAnUnrelatedExpressionForThePlayer() {
        AnswerResult result = validator.validate(Puzzle.of(1, 2, 3, 4), "1+2+3+4");

        assertEquals(AnswerStatus.NOT_TWENTY_FOUR, result.status());
        assertEquals(OptionalInt.of(10), result.value());
        assertEquals("1+2+3+4", result.interpretedExpression().orElseThrow());
        assertFalse(result.assisted());
    }

    @ParameterizedTest
    @MethodSource("illegalArithmeticAnswers")
    void rejectsIllegalIntermediateResultsEvenWhenTheFinalRationalValueWouldBeTwentyFour(
            Puzzle puzzle, String input) {
        AnswerResult result = validator.validate(puzzle, input);

        assertEquals(AnswerStatus.ILLEGAL_OPERATION, result.status());
        assertTrue(result.value().isEmpty());
        assertFalse(result.assisted());
        assertFalse(result.isCorrect());
        // Formatting must not erase the grouping that made an intermediate result illegal.
        AnswerResult rendered = validator.validate(puzzle,
                "(" + result.interpretedExpression().orElseThrow() + ")");
        assertEquals(AnswerStatus.ILLEGAL_OPERATION, rendered.status());
    }

    private static Stream<Arguments> illegalArithmeticAnswers() {
        return Stream.of(
                Arguments.of(Puzzle.of(1, 5, 2, 8), "(1-5)*(2-8)"),
                Arguments.of(Puzzle.of(8, 3, 3, 3), "(8/3)*3*3"),
                Arguments.of(Puzzle.of(2, 3, 2, 8), "2*(3/2)*8"),
                Arguments.of(Puzzle.of(3, 3, 8, 8), "8/(3-8/3)"),
                Arguments.of(Puzzle.of(6, 1, 1, 4), "6/(1-1)*4"),
                Arguments.of(Puzzle.of(1, 2, 3, 4), "1-2-3-4"));
    }

    @ParameterizedTest
    @MethodSource("wrongCardAnswers")
    void requiresTheExactMultisetOfCardsBeforeTryingAssistance(Puzzle puzzle, String input) {
        assertUninterpretable(validator.validate(puzzle, input), AnswerStatus.INVALID_CARD_USAGE);
    }

    private static Stream<Arguments> wrongCardAnswers() {
        Puzzle simple = Puzzle.of(1, 2, 3, 4);
        return Stream.of(
                Arguments.of(simple, "6*4+1-1"),
                Arguments.of(Puzzle.of(3, 1, 7, 1), "3+1*7-3"),
                Arguments.of(simple, "1+2+3"),
                Arguments.of(simple, "1+2+3+4+1"),
                Arguments.of(simple, "0+2+3+4"),
                Arguments.of(simple, "11+2+3+4"),
                Arguments.of(simple, "999999999999999999999999999+2+3+4"));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {
            " \t\n", "(1+2+3*4", "1+2+3)*4", "1++2+3*4", "-1+2+3*4",
            "(1+2)(3+4)", "1 2+3+4", "1.0+2+3+4", "1e0+2+3+4",
            "1^2+3+4", "1**2+3+4", "sqrt(1)+2+3+4", "01+2+3+4",
            "1+2+3+4=", "1+2+3+4;System.exit(0)", "１+2+3+4", "(())", "1+2+3+"
    })
    void rejectsMalformedInputWithoutEvaluatingArbitraryCode(String input) {
        AnswerResult result = validator.validate(Puzzle.of(1, 2, 3, 4), input);

        assertUninterpretable(result, AnswerStatus.INVALID_SYNTAX);
        assertEquals(input == null ? "" : input, result.submittedExpression());
    }

    @Test
    void enforcesTheInputLengthLimitBeforeParsing() {
        String expression = "(1+2+3)*4";
        String atLimit = expression + " ".repeat(256 - expression.length());

        assertCorrect(validator.validate(Puzzle.of(1, 2, 3, 4), atLimit), false);
        assertUninterpretable(validator.validate(Puzzle.of(1, 2, 3, 4), atLimit + " "),
                AnswerStatus.INVALID_SYNTAX);
    }

    private static void assertCorrect(AnswerResult result, boolean assisted) {
        assertEquals(AnswerStatus.CORRECT, result.status(), result::message);
        assertTrue(result.isCorrect());
        assertEquals(OptionalInt.of(24), result.value());
        assertTrue(result.interpretedExpression().isPresent());
        assertEquals(assisted, result.assisted());
    }

    private static void assertUninterpretable(AnswerResult result, AnswerStatus expected) {
        assertEquals(expected, result.status());
        assertFalse(result.isCorrect());
        assertFalse(result.assisted());
        assertTrue(result.interpretedExpression().isEmpty());
        assertTrue(result.value().isEmpty());
    }

    private void assertExplicitRoundTrip(Puzzle puzzle, AnswerResult result) {
        String literal = "(" + result.interpretedExpression().orElseThrow() + ")";
        assertCorrect(validator.validate(puzzle, literal), false);
    }
}
