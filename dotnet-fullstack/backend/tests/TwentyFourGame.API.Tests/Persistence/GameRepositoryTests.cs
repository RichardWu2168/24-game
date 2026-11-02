
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using TwentyFourGame.API.Tests.Factories;
using TwentyFourGame.Domain.Entities;
using TwentyFourGame.Infrastructure.Persistence;

namespace TwentyFourGame.API.Tests.Persistence;

public class GameRepositoryTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public GameRepositoryTests(CustomWebApplicationFactory factory)
    {
        _factory = factory;

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();

        db.Database.Migrate();
        db.Database.ExecuteSqlRaw(
            "TRUNCATE TABLE game_attempts, games, game_sessions RESTART IDENTITY CASCADE;");
    }

    [Fact]
    public async Task GetByIdAsync_WhenGameHasMoreThan100Attempts_LoadsOnlyEarliest100()
    {
        var session = new GameSession();
        var game = new Game(session.Id, [1, 2, 3, 4]);

        // Create the maximum number of attempts through the Domain API.
        for (var i = 0; i < Game.MaxAttemptsPerGame; i++)
        {
            game.AddAttempt($"attempt-{i}", false);
        }

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();

            db.GameSessions.Add(session);
            db.Games.Add(game);

            await db.SaveChangesAsync();

            // Insert one additional attempt directly into the database,
            // bypassing the Domain limit for this integration test.
            db.GameAttempts.Add(
                new GameAttempt(game.Id, "attempt-100", false));

            await db.SaveChangesAsync();
        }

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();

            // Determine the expected order using persisted PostgreSQL values.
            var expectedAttempts = await db.GameAttempts
                .AsNoTracking()
                .Where(attempt => attempt.GameId == game.Id)
                .OrderBy(attempt => attempt.CreatedAt)
                .ThenBy(attempt => attempt.Id)
                .Take(Game.MaxAttemptsPerGame)
                .Select(attempt => attempt.Id)
                .ToListAsync();

            db.ChangeTracker.Clear();

            var repository = new GameRepository(db);

            var loadedGame = await repository.GetByIdAsync(game.Id);

            Assert.NotNull(loadedGame);
            Assert.Equal(Game.MaxAttemptsPerGame, loadedGame.Attempts.Count);

            var actualAttempts = loadedGame.Attempts
                .Select(attempt => attempt.Id)
                .ToList();

            Assert.Equal(expectedAttempts, actualAttempts);
        }
    }
}
