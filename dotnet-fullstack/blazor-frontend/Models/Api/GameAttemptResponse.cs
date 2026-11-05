namespace TwentyFourGame.Blazor.Models.Api;

public sealed class GameAttemptResponse
{
    public Guid Id { get; set; }

    public string Expression { get; set; } = "";

    public bool IsCorrect { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}