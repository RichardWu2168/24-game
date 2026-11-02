namespace TwentyFourGame.Application.DTOs;

public sealed record GameStatsResponse(
    int TotalGames,
    int CompletedGames,
    int InProgressGames,
    int AbandonedGames,
    int TotalAttempts,
    int CorrectAttempts,
    int AccuracyPercent
);