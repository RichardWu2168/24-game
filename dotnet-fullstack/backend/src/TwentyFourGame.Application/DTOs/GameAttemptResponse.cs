namespace TwentyFourGame.Application.DTOs;

public sealed record GameAttemptResponse(
    Guid Id,
    string Expression,
    bool IsCorrect,
    DateTime CreatedAt
);