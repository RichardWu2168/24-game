namespace TwentyFourGame.Blazor.Models.Api;

public sealed class PuzzleResponse
{
    public Guid Id { get; set; }

    public int[] Numbers { get; set; } = [];

    public DateTimeOffset StartedAt { get; set; }

    public DateTimeOffset? GotItAt { get; set; }

    public double? CapturedDurationSeconds { get; set; }
}