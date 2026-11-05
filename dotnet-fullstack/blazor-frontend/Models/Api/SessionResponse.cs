namespace TwentyFourGame.Blazor.Models.Api;

public sealed class SessionResponse
{
    public Guid Id { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}