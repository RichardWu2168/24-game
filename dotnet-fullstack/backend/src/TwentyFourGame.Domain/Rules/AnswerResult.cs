namespace TwentyFourGame.Domain.Rules;

public sealed record AnswerResult(
    bool Valid,
    string Message,
    int? Value = null
);