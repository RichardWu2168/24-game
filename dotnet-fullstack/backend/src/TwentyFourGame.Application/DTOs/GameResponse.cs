using TwentyFourGame.Domain.Entities;
using TwentyFourGame.Domain.Enums;

namespace TwentyFourGame.Application.DTOs;

public sealed record GameResponse(
    Guid Id,
    Guid SessionId,
    int[] Numbers,
    GameStatus Status,
    DateTime CreatedAt,
    DateTime? CompletedAt,
    DateTime? GotItAt,
    int? DurationSeconds,
    int? CapturedDurationSeconds,
    IReadOnlyList<GameAttemptResponse> Attempts
);