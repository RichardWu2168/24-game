namespace TwentyFourGame.Application.DTOs;

public sealed record AnswerSubmissionResponse(
    bool Valid,
    string Message,
    int? Value,
    GameResponse Game
);