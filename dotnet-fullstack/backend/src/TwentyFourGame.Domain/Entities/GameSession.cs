namespace TwentyFourGame.Domain.Entities;

public class GameSession
{
    public Guid Id { get; private set; }

    public DateTime CreatedAt { get; private set; }

    public ICollection<Game> Games { get; private set; } = new List<Game>();

    public GameSession()
    {
        Id = Guid.NewGuid();
        CreatedAt = DateTime.UtcNow;
    }

    public void AddGame(Game game)
    {
        ArgumentNullException.ThrowIfNull(game);

        if (game.SessionId != Id)
        {
            throw new InvalidOperationException(
                "The game belongs to a different session.");
        }

        Games.Add(game);
    }
}