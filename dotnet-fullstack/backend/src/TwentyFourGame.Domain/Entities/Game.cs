using TwentyFourGame.Domain.Enums;
using TwentyFourGame.Domain.Exceptions;

namespace TwentyFourGame.Domain.Entities;

public class Game
{
    public const int MaxAttemptsPerGame = 100;

    public Guid Id { get; private set; }

    public Guid SessionId { get; private set; }

    public int[] Numbers { get; private set; } = [];

    public GameStatus Status { get; private set; }

    public DateTime CreatedAt { get; private set; }

    public DateTime? CompletedAt { get; private set; }

    public DateTime? GotItAt { get; private set; }

    public int? DurationSeconds { get; private set; }

    public int? CapturedDurationSeconds { get; private set; }

    public GameSession? Session { get; private set; }

    public ICollection<GameAttempt> Attempts { get; private set; }
        = new List<GameAttempt>();

    private Game()
    {
        // Required by Entity Framework Core.
    }

    public Game(Guid sessionId, int[] numbers)
    {
        if (sessionId == Guid.Empty)
        {
            throw new ArgumentException(
                "Session ID cannot be empty.",
                nameof(sessionId));
        }

        if (numbers == null || numbers.Length != 4)
        {
            throw new ArgumentException(
                "A game must contain exactly four numbers.",
                nameof(numbers));
        }

        if (numbers.Any(n => n < 1 || n > 10))
        {
            throw new ArgumentException(
                "Game numbers must be between 1 and 10.",
                nameof(numbers));
        }

        Id = Guid.NewGuid();
        SessionId = sessionId;
        Numbers = (int[])numbers.Clone();
        Status = GameStatus.InProgress;
        CreatedAt = DateTime.UtcNow;
    }

    public void AddAttempt(string expression, bool isCorrect)
    {
        if (Status != GameStatus.InProgress)
        {
            throw new GameStateConflictException(
                "Attempts can only be added to an in-progress game.");
        }

        var attempt = new GameAttempt(Id, expression, isCorrect);

        if (Attempts.Count >= MaxAttemptsPerGame)
        {
            throw new GameStateConflictException(
                $"A game cannot have more than {MaxAttemptsPerGame} attempts.");
        }

        Attempts.Add(attempt);
    }

    public void Complete(int durationSeconds)
    {
        if (Status != GameStatus.InProgress)
        {
            throw new GameStateConflictException(
                "Only an in-progress game can be completed.");
        }

        ValidateDuration(durationSeconds);

        Status = GameStatus.Completed;
        CompletedAt = DateTime.UtcNow;
        DurationSeconds = durationSeconds;
    }

    public void Abandon()
    {
        if (Status != GameStatus.InProgress)
        {
            throw new GameStateConflictException(
                "Only an in-progress game can be abandoned.");
        }

        Status = GameStatus.Abandoned;
    }

    public void RecordGotIt(int durationSeconds)
    {
        if (Status != GameStatus.InProgress)
        {
            throw new GameStateConflictException(
                "Got It can only be recorded for an in-progress game.");
        }

        ValidateDuration(durationSeconds);

        if (CapturedDurationSeconds.HasValue)
        {
            return;
        }

        GotItAt = DateTime.UtcNow;
        CapturedDurationSeconds = durationSeconds;
    }

    private static void ValidateDuration(int durationSeconds)
    {
        if (durationSeconds < 0)
        {
            throw new ArgumentOutOfRangeException(
                nameof(durationSeconds),
                "Duration cannot be negative.");
        }
    }
}