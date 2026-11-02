namespace TwentyFourGame.Application.DTOs;

public sealed record AnswerCheckResponse(
    bool Valid,
    string Message,
    int? Value
);