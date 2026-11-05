namespace TwentyFourGame.Blazor.Models.Api;

public sealed record SubmitAnswerRequest(
    string Expression,
    int[] Numbers,
    double? DurationSeconds
);