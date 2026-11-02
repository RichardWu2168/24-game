namespace TwentyFourGame.Domain.Entities;

public class GameAttempt
{
    public Guid Id { get; private set; }

    public Guid GameId { get; private set; }

    public string Expression { get; private set; } = string.Empty;

    public bool IsCorrect { get; private set; }

    public DateTime CreatedAt { get; private set; }

    public Game? Game { get; private set; }

    private GameAttempt()
    {
        // Required by Entity Framework Core.
    }

    public GameAttempt(
        Guid gameId,
        string expression,
        bool isCorrect)
    {
        if (gameId == Guid.Empty)
        {
            throw new ArgumentException(
                "Game ID cannot be empty.",
                nameof(gameId));
        }

        if (string.IsNullOrWhiteSpace(expression))
        {
            throw new ArgumentException(
                "Expression cannot be empty.",
                nameof(expression));
        }

        Id = Guid.NewGuid();
        GameId = gameId;
        Expression = expression;
        IsCorrect = isCorrect;
        CreatedAt = DateTime.UtcNow;
    }

}