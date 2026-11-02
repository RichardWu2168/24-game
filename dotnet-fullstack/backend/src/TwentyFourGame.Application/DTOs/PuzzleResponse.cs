namespace TwentyFourGame.Application.DTOs;

public sealed record PuzzleResponse(
    Guid Id,
    int[] Numbers,
    DateTime StartedAt,
    DateTime? GotItAt,
    int? CapturedDurationSeconds
);