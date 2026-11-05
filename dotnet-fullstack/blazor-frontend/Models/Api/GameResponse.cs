using TwentyFourGame.Blazor.Models;

namespace TwentyFourGame.Blazor.Models.Api;

public sealed class GameResponse
{
    public Guid Id { get; set; }

    public Guid SessionId { get; set; }

    public int[] Numbers { get; set; } = [];

    public GameStatus Status { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? CompletedAt { get; set; }

    public DateTimeOffset? GotItAt { get; set; }

    public double? DurationSeconds { get; set; }

    public double? CapturedDurationSeconds { get; set; }

    public List<GameAttemptResponse> Attempts { get; set; } = [];
}