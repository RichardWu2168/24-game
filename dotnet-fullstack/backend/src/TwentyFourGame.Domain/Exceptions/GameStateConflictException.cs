namespace TwentyFourGame.Domain.Exceptions;

public sealed class GameStateConflictException : InvalidOperationException
{
    public GameStateConflictException(string message)
        : base(message)
    {
    }
}