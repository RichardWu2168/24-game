using TwentyFourGame.Domain.Rules;
using Xunit;

namespace TwentyFourGame.Domain.Tests.Rules;

public class GameSolverTests
{
    [Theory]
    [InlineData(1, 2, 3, 4)]
    [InlineData(2, 3, 4, 5)]
    [InlineData(2, 2, 3, 3)]
    [InlineData(4, 4, 4, 4)]
    [InlineData(6, 6, 2, 2)]
    public void FindSolution_WhenSolvable_ReturnsValidExpression(
        int a, int b, int c, int d)
    {
        int[] numbers = [a, b, c, d];

        string? solution = GameSolver.FindSolution(numbers);

        Assert.NotNull(solution);

        AnswerResult result =
            GameRules.CheckAnswer(solution, numbers);

        Assert.True(result.Valid, result.Message);
        Assert.Equal(24, result.Value);
    }

    [Fact]
    public void FindSolution_WhenUnsolvable_ReturnsNull()
    {
        int[] numbers = [1, 1, 1, 1];

        string? solution = GameSolver.FindSolution(numbers);

        Assert.Null(solution);
    }

    [Fact]
    public void FindSolution_WithDuplicateNumbers_UsesEachCardOnce()
    {
        int[] numbers = [2, 2, 3, 3];

        string? solution = GameSolver.FindSolution(numbers);

        Assert.NotNull(solution);

        AnswerResult result =
            GameRules.CheckAnswer(solution, numbers);

        Assert.True(result.Valid, result.Message);
    }

    [Theory]
    [InlineData(1, 2, 3)]
    [InlineData(1, 2, 3, 4, 5)]
    public void FindSolution_WithInvalidCardCount_ThrowsArgumentException(
        params int[] numbers)
    {
        Assert.Throws<ArgumentException>(
            () => GameSolver.FindSolution(numbers));
    }

    [Theory]
    [InlineData(0, 2, 3, 4)]
    [InlineData(1, 2, 3, 11)]
    [InlineData(-1, 2, 3, 4)]
    public void FindSolution_WithInvalidCardValue_ThrowsArgumentException(
        int a, int b, int c, int d)
    {
        int[] numbers = [a, b, c, d];

        Assert.Throws<ArgumentException>(
            () => GameSolver.FindSolution(numbers));
    }

    [Fact]
    public void FindSolution_DoesNotModifyOriginalNumbers()
    {
        int[] numbers = [1, 2, 3, 4];
        int[] original = (int[])numbers.Clone();

        GameSolver.FindSolution(numbers);

        Assert.Equal(original, numbers);
    }

    [Fact]
    public void FindSolution_WithNullNumbers_ThrowsArgumentException()
    {
        Assert.Throws<ArgumentException>(
            () => GameSolver.FindSolution(null!));
    }

    [Theory]
    [InlineData(1, 2, 3, 4)]
    [InlineData(2, 2, 3, 3)]
    [InlineData(6, 6, 2, 2)]
    [InlineData(8, 8, 4, 4)]
    public void FindAllSolutions_ReturnsOnlyValidExpressions(
        int a, int b, int c, int d)
    {
        int[] numbers = [a, b, c, d];

        IReadOnlyList<string> solutions =
            GameSolver.FindAllSolutions(numbers);

        Assert.NotEmpty(solutions);

        foreach (string expression in solutions)
        {
            AnswerResult result =
                GameRules.CheckAnswer(expression, numbers);

            Assert.True(
                result.Valid,
                $"Invalid solution: {expression}. {result.Message}");

            Assert.Equal(24, result.Value);
        }
    }

    [Fact]
    public void FindAllSolutions_WhenMultipleSolutionsExist_ReturnsMoreThanOne()
    {
        int[] numbers = [1, 2, 3, 4];

        IReadOnlyList<string> solutions =
            GameSolver.FindAllSolutions(numbers);

        Assert.True(
            solutions.Count > 1,
            $"Expected multiple solutions, but found {solutions.Count}.");
    }

    [Fact]
    public void FindAllSolutions_DoesNotReturnDuplicateExpressionStrings()
    {
        int[] numbers = [1, 2, 3, 4];

        IReadOnlyList<string> solutions =
            GameSolver.FindAllSolutions(numbers);

        Assert.Equal(
            solutions.Count,
            solutions.Distinct(StringComparer.Ordinal).Count());
    }

    [Fact]
    public void FindAllSolutions_WhenCardsAreReordered_ReturnsSameSolutionCount()
    {
        int[] original = [1, 2, 3, 4];
        int[] reordered = [4, 2, 1, 3];

        IReadOnlyList<string> originalSolutions =
            GameSolver.FindAllSolutions(original);

        IReadOnlyList<string> reorderedSolutions =
            GameSolver.FindAllSolutions(reordered);

        Assert.Equal(
            originalSolutions.Count,
            reorderedSolutions.Count);
    }

    [Fact]
    public void FindAllSolutions_WithDuplicateCards_ReturnsValidUniqueExpressions()
    {
        int[] numbers = [2, 2, 3, 3];

        IReadOnlyList<string> solutions =
            GameSolver.FindAllSolutions(numbers);

        Assert.NotEmpty(solutions);

        Assert.Equal(
            solutions.Count,
            solutions.Distinct(StringComparer.Ordinal).Count());

        foreach (string expression in solutions)
        {
            AnswerResult result =
                GameRules.CheckAnswer(expression, numbers);

            Assert.True(result.Valid, result.Message);
        }
    }

    [Fact]
    public void FindAllSolutions_WhenUnsolvable_ReturnsEmptyCollection()
    {
        int[] numbers = [1, 1, 1, 1];

        IReadOnlyList<string> solutions =
            GameSolver.FindAllSolutions(numbers);

        Assert.Empty(solutions);
    }

    [Theory]
    [InlineData(0, 2, 3, 4)]
    [InlineData(1, 2, 3, 11)]
    public void FindAllSolutions_WithInvalidCardValues_ThrowsArgumentException(
        int a, int b, int c, int d)
    {
        int[] numbers = [a, b, c, d];

        Assert.Throws<ArgumentException>(
            () => GameSolver.FindAllSolutions(numbers));
    }

}