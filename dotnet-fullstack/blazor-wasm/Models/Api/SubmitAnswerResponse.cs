namespace TwentyFourGame.Blazor.Models.Api;

public sealed class SubmitAnswerResponse
{
    public bool Valid { get; set; }

    public string Message { get; set; } = "";

    public double? Value { get; set; }

    public GameResponse Game { get; set; } = null!;
}