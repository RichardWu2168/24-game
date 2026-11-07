using TwentyFourGame.Domain.Rules;

namespace TwentyFourGame.Domain.Tests.Rules;

public class GameRulesTests
{
    [Fact]
    public void CheckAnswer_WithCorrectExpression_ReturnsValid()
    {
        int[] cards = [6, 4, 2, 2];

        AnswerResult result = GameRules.CheckAnswer(
            "6 * 4 + 2 - 2", cards);

        Assert.True(result.Valid);
        Assert.Equal(24, result.Value);
        Assert.Equal("Correct! You made 24!", result.Message);
    }

    [Fact]
    public void CheckAnswer_WithIncorrectResult_ReturnsInvalid()
    {
        int[] cards = [2, 3, 4, 5];

        AnswerResult result = GameRules.CheckAnswer(
            "2 + 3 * 4 + 5", cards);

        Assert.False(result.Valid);
        Assert.Equal(19, result.Value);
    }

    [Fact]
    public void CheckAnswer_WithParentheses_ReturnsValid()
    {
        int[] cards = [2, 4, 4, 1];

        AnswerResult result = GameRules.CheckAnswer(
            "(2 + 4) * 4 * 1", cards);

        Assert.True(result.Valid);
        Assert.Equal(24, result.Value);
    }

    [Fact]
    public void CheckAnswer_WithFractionalIntermediateResult_ReturnsInvalid()
    {
        int[] cards = [5, 2, 3, 4];

        AnswerResult result = GameRules.CheckAnswer(
            "5 / 2 * 3 * 4", cards);

        Assert.False(result.Valid);
        Assert.Equal(
            "Every intermediate result must be an integer.",
            result.Message);
    }

    [Fact]
    public void CheckAnswer_WithNegativeIntermediateResult_ReturnsInvalid()
    {
        int[] cards = [3, 5, 10, 8];

        AnswerResult result = GameRules.CheckAnswer(
            "3 - 5 + 10 * 8", cards);

        Assert.False(result.Valid);
        Assert.Equal(
            "Intermediate results cannot be negative.",
            result.Message);
    }

    [Fact]
    public void CheckAnswer_WithDivisionByZero_ReturnsInvalid()
    {
        int[] cards = [5, 3, 3, 2];

        AnswerResult result = GameRules.CheckAnswer(
            "5 / (3 - 3) + 2", cards);

        Assert.False(result.Valid);
        Assert.Equal(
            "Division by zero is not allowed.",
            result.Message);
    }

    [Fact]
    public void CheckAnswer_WithMissingCard_ReturnsInvalid()
    {
        int[] cards = [6, 4, 2, 8];

        AnswerResult result = GameRules.CheckAnswer(
            "6 * 4", cards);

        Assert.False(result.Valid);
        Assert.Equal(
            "You must use all four card numbers.",
            result.Message);
    }

    [Fact]
    public void CheckAnswer_WithDuplicateCards_RequiresBothOccurrences()
    {
        int[] cards = [3, 3, 4, 5];

        AnswerResult result = GameRules.CheckAnswer(
            "3 * 4 + 3 * 4", cards);

        Assert.False(result.Valid);
        Assert.Equal(
            "Use each card number exactly once.",
            result.Message);
    }

    [Fact]
    public void CheckAnswer_WithEmptyExpression_ReturnsInvalid()
    {
        int[] cards = [1, 2, 3, 4];

        AnswerResult result = GameRules.CheckAnswer("", cards);

        Assert.False(result.Valid);
        Assert.Equal("You must use all four card numbers.", result.Message);
    }

    [Fact]
    public void CheckAnswer_WithInvalidCharacter_ReturnsInvalid()
    {
        int[] cards = [1, 2, 3, 4];

        AnswerResult result = GameRules.CheckAnswer("1 + 2 + 3 + a", cards);

        Assert.False(result.Valid);
        Assert.Equal("Invalid character: a", result.Message);
    }

    [Fact]
    public void CheckAnswer_WithMissingClosingParenthesis_ReturnsInvalid()
    {
        int[] cards = [2, 4, 4, 1];

        AnswerResult result = GameRules.CheckAnswer("(2 + 4 * 4 * 1", cards);

        Assert.False(result.Valid);
        Assert.Equal("A closing parenthesis is missing.", result.Message);
    }

    [Fact]
    public void CheckAnswer_WithIncompleteExpression_ReturnsInvalid()
    {
        int[] cards = [1, 2, 3, 4];

        AnswerResult result = GameRules.CheckAnswer("1 + 2 + 3 + 4 +", cards);

        Assert.False(result.Valid);
        Assert.Equal("The expression is incomplete.", result.Message);
    }

    [Fact]
    public void CheckAnswer_WithNegativeNumber_ReturnsInvalid()
    {
        int[] cards = [1, 2, 3, 4];

        AnswerResult result = GameRules.CheckAnswer("-1 + 2 + 3 + 4", cards);

        Assert.False(result.Valid);
        Assert.Equal("Negative numbers are not allowed.", result.Message);
    }

    [Fact]
    public void CheckAnswer_WithInvalidCardCount_ReturnsInvalid()
    {
        int[] cards = [1, 2, 3];

        AnswerResult result = GameRules.CheckAnswer("1 + 2 + 3", cards);

        Assert.False(result.Valid);
        Assert.Equal(
            "The game requires four valid cards from 1 to 10.",
            result.Message);
    }

    [Fact]
    public void CheckAnswer_WithInvalidCardValue_ReturnsInvalid()
    {
        int[] cards = [1, 2, 3, 11];

        AnswerResult result = GameRules.CheckAnswer("1 + 2 + 3 + 11", cards);

        Assert.False(result.Valid);
        Assert.Equal(
            "The game requires four valid cards from 1 to 10.",
            result.Message);
    }

    [Fact]
    public void CheckAnswer_WithExpressionAtMaximumLength_ReturnsValid()
    {
        int[] cards = [6, 4, 2, 2];
        const string expression = "6 * 4 + 2 - 2";

        string paddedExpression =
            expression.PadLeft(256);

        AnswerResult result = GameRules.CheckAnswer(
            paddedExpression, cards);

        Assert.True(result.Valid);
        Assert.Equal(24, result.Value);
    }

    [Fact]
    public void CheckAnswer_WithExpressionExceedingMaximumLength_ReturnsInvalid()
    {
        int[] cards = [6, 4, 2, 2];
        const string expression = "6 * 4 + 2 - 2";

        string paddedExpression =
            expression.PadLeft(257);

        AnswerResult result = GameRules.CheckAnswer(
            paddedExpression, cards);

        Assert.False(result.Valid);
        Assert.Equal("The expression is too long.", result.Message);
    }

    [Fact]
    public void CheckAnswer_WithMaximumParenthesisNesting_ReturnsValid()
    {
        int[] cards = [6, 4, 2, 2];

        string expression =
            new string('(', 32) +
            "6 * 4 + 2 - 2" +
            new string(')', 32);

        AnswerResult result = GameRules.CheckAnswer(
            expression, cards);

        Assert.True(result.Valid);
        Assert.Equal(24, result.Value);
    }

    [Fact]
    public void CheckAnswer_WithExcessiveParenthesisNesting_ReturnsInvalid()
    {
        int[] cards = [6, 4, 2, 2];

        string expression =
            new string('(', 33) +
            "6 * 4 + 2 - 2" +
            new string(')', 33);

        AnswerResult result = GameRules.CheckAnswer(
            expression, cards);

        Assert.False(result.Valid);
        Assert.Equal(
            "The expression has too many nested parentheses.",
            result.Message);
    }
}