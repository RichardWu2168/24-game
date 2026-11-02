namespace TwentyFourGame.Application.DTOs;

public sealed record GameStatsData(
    int TotalGames,
    int CompletedGames,
    int InProgressGames,
    int AbandonedGames,
    int TotalAttempts,
    int CorrectAttempts
);