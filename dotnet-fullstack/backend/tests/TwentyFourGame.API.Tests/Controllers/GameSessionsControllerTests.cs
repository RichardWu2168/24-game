
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using TwentyFourGame.API.Tests.Factories;
using TwentyFourGame.Application.DTOs;
using TwentyFourGame.Domain.Entities;
using TwentyFourGame.Domain.Enums;
using TwentyFourGame.Infrastructure.Persistence;

namespace TwentyFourGame.API.Tests.Controllers;

public class GameSessionsControllerTests
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient _client;
    private readonly CustomWebApplicationFactory _factory;

    public GameSessionsControllerTests(
        CustomWebApplicationFactory factory)
    {
        _factory = factory;

        // Apply database migrations before running the test.
        using var scope = factory.Services.CreateScope();

        var dbContext = scope.ServiceProvider
            .GetRequiredService<GameDbContext>();

        // Ensure the database schema is up to date.
        dbContext.Database.Migrate();

        // Clear all game data before each test.
        dbContext.Database.ExecuteSqlRaw(
            """
            TRUNCATE TABLE game_attempts, games, game_sessions
            RESTART IDENTITY CASCADE;
            """);

        _client = factory.CreateClient();
    }

    [Fact]
    public async Task CreateSession_ReturnsCreatedSession()
    {
        // Act
        var response = await _client.PostAsync(
            "/api/gamesessions",
            null);

        // Assert
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var session = await response.Content
            .ReadFromJsonAsync<GameSessionResponse>();

        Assert.NotNull(session);
        Assert.NotEqual(Guid.Empty, session.Id);
    }

    [Fact]
    public async Task GetPuzzle_WhenNoActiveGameExists_ReturnsNotFoundWithoutCreatingGame()
    {
        // Arrange: create a session without creating a puzzle.
        var createResponse = await _client.PostAsync(
            "/api/gamesessions",
            null);

        createResponse.EnsureSuccessStatusCode();

        var session = await createResponse.Content
            .ReadFromJsonAsync<GameSessionResponse>();

        Assert.NotNull(session);

        // Act: request a puzzle.
        var response = await _client.GetAsync(
            $"/api/gamesessions/{session.Id}/puzzle");

        // Assert: GET returns 404 and does not create a game.
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        using var scope = _factory.Services.CreateScope();

        var dbContext = scope.ServiceProvider
            .GetRequiredService<GameDbContext>();

        var gameCount = await dbContext.Games
            .CountAsync(game => game.SessionId == session.Id);

        Assert.Equal(0, gameCount);
    }

    [Fact]
    public async Task GetPuzzle_WithExistingSession_ReturnsPuzzle()
    {
        // Arrange: create a session.
        var createResponse = await _client.PostAsync(
            "/api/gamesessions",
            null);

        createResponse.EnsureSuccessStatusCode();

        var session = await createResponse.Content
            .ReadFromJsonAsync<GameSessionResponse>();

        Assert.NotNull(session);

        // Act: request a puzzle.
        var response = await _client.PostAsync(
            $"/api/gamesessions/{session.Id}/puzzle",
            null);

        // Assert: verify the HTTP response.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var puzzle = await response.Content
            .ReadFromJsonAsync<PuzzleResponse>();

        Assert.NotNull(puzzle);
        Assert.NotEqual(Guid.Empty, puzzle.Id);
        Assert.Equal(4, puzzle.Numbers.Length);
        Assert.All(puzzle.Numbers, number =>
            Assert.InRange(number, 1, 10));

        // Verify that the game was persisted.
        using var scope = _factory.Services.CreateScope();

        var dbContext = scope.ServiceProvider
            .GetRequiredService<GameDbContext>();

        var game = await dbContext.Games
            .FirstOrDefaultAsync(game => game.Id == puzzle.Id);

        Assert.NotNull(game);
        Assert.Equal(session.Id, game.SessionId);
    }


    [Fact]
    public async Task GetPuzzle_WhenActiveGameExists_ResumesSameGame()
    {
        // Arrange: create a session.
        var createResponse = await _client.PostAsync(
            "/api/gamesessions",
            null);

        createResponse.EnsureSuccessStatusCode();

        var session = await createResponse.Content
            .ReadFromJsonAsync<GameSessionResponse>();

        Assert.NotNull(session);

        // Act: request the first puzzle.
        var firstResponse = await _client.PostAsync(
            $"/api/gamesessions/{session.Id}/puzzle",
            null);

        firstResponse.EnsureSuccessStatusCode();

        var firstPuzzle = await firstResponse.Content
            .ReadFromJsonAsync<PuzzleResponse>();

        Assert.NotNull(firstPuzzle);

        // Request another puzzle without forceNew.
        var secondResponse = await _client.GetAsync(
            $"/api/gamesessions/{session.Id}/puzzle");

        secondResponse.EnsureSuccessStatusCode();

        var secondPuzzle = await secondResponse.Content
            .ReadFromJsonAsync<PuzzleResponse>();

        // Assert: the same active puzzle is returned.
        Assert.NotNull(secondPuzzle);
        Assert.Equal(firstPuzzle.Id, secondPuzzle.Id);
        Assert.Equal(firstPuzzle.Numbers, secondPuzzle.Numbers);

        // Verify that only one game was created.
        using var scope = _factory.Services.CreateScope();

        var dbContext = scope.ServiceProvider
            .GetRequiredService<GameDbContext>();

        var gameCount = await dbContext.Games
            .CountAsync(game => game.SessionId == session.Id);

        Assert.Equal(1, gameCount);
    }


    [Fact]
    public async Task GetPuzzle_WithForceNew_AbandonsPreviousGameAndCreatesNewOne()
    {
        // Arrange: create a session.
        var createResponse = await _client.PostAsync(
            "/api/gamesessions",
            null);

        createResponse.EnsureSuccessStatusCode();

        var session = await createResponse.Content
            .ReadFromJsonAsync<GameSessionResponse>();

        Assert.NotNull(session);

        // Create the first puzzle.
        var firstResponse = await _client.PostAsync(
            $"/api/gamesessions/{session.Id}/puzzle",
            null);

        firstResponse.EnsureSuccessStatusCode();

        var firstPuzzle = await firstResponse.Content
            .ReadFromJsonAsync<PuzzleResponse>();

        Assert.NotNull(firstPuzzle);

        // Act: request a new puzzle.
        var secondResponse = await _client.PostAsync(
            $"/api/gamesessions/{session.Id}/puzzle",
            null);

        // Assert: a different puzzle is returned.
        Assert.Equal(HttpStatusCode.OK, secondResponse.StatusCode);

        var secondPuzzle = await secondResponse.Content
            .ReadFromJsonAsync<PuzzleResponse>();

        Assert.NotNull(secondPuzzle);
        Assert.NotEqual(firstPuzzle.Id, secondPuzzle.Id);

        // Verify both games in PostgreSQL.
        using var scope = _factory.Services.CreateScope();

        var dbContext = scope.ServiceProvider
            .GetRequiredService<GameDbContext>();

        var games = await dbContext.Games
            .Where(game => game.SessionId == session.Id)
            .OrderBy(game => game.CreatedAt)
            .ToListAsync();

        Assert.Equal(2, games.Count);

        Assert.Equal(GameStatus.Abandoned, games[0].Status);
        Assert.Equal(GameStatus.InProgress, games[1].Status);
    }

    [Theory]
    [InlineData("0")]
    [InlineData("101")]
    [InlineData("-1")]
    [InlineData("abc")]
    public async Task History_WithInvalidPageSize_Returns400(string size)
    {
        // Arrange
        var session = new GameSession();
        var game = new Game(session.Id, new[] { 1, 2, 3, 4 });

        using (var scope = _factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider
                .GetRequiredService<GameDbContext>();

            dbContext.GameSessions.Add(session);
            dbContext.Games.Add(game);

            await dbContext.SaveChangesAsync();
        }

        // Act
        var response = await _client.GetAsync(
            $"/api/gamesessions/{session.Id}/history?pageSize={size}");

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using (var scope = _factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider
                .GetRequiredService<GameDbContext>();

            var savedGame = await dbContext.Games
                .Include(g => g.Attempts)
                .SingleAsync(g => g.Id == game.Id);

            Assert.Equal(GameStatus.InProgress, savedGame.Status);
            Assert.Equal(new[] { 1, 2, 3, 4 }, savedGame.Numbers);
            Assert.Null(savedGame.CompletedAt);
            Assert.Null(savedGame.DurationSeconds);
            Assert.Null(savedGame.GotItAt);
            Assert.Null(savedGame.CapturedDurationSeconds);
            Assert.Empty(savedGame.Attempts);

            Assert.Single(await dbContext.GameSessions.ToListAsync());
        }
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("other-session")]
    [InlineData("malformed")]
    public async Task History_WithInvalidCursor_Returns400(string scenario)
    {
        // Arrange
        var session = new GameSession();
        var game = new Game(session.Id, new[] { 1, 2, 3, 4 });

        var otherSession = new GameSession();
        var otherGame = new Game(otherSession.Id, new[] { 5, 6, 7, 8 });

        using (var scope = _factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider
                .GetRequiredService<GameDbContext>();

            dbContext.GameSessions.AddRange(session, otherSession);
            dbContext.Games.AddRange(game, otherGame);

            await dbContext.SaveChangesAsync();
        }

        var cursor = scenario switch
        {
            "missing" => Guid.Empty.ToString(),
            "other-session" => otherGame.Id.ToString(),
            _ => "invalid"
        };

        // Act
        var response = await _client.GetAsync(
            $"/api/gamesessions/{session.Id}/history?cursor={cursor}");

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        if (scenario != "malformed")
        {
            var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();

            Assert.NotNull(problem);
            Assert.Equal("Invalid Request", problem.Title);
            Assert.Equal(
                "The cursor is invalid or does not belong to this session.",
                problem.Detail);
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider
                .GetRequiredService<GameDbContext>();

            var savedGames = await dbContext.Games
                .Include(g => g.Attempts)
                .ToListAsync();

            Assert.Equal(2, savedGames.Count);

            foreach (var expectedGame in new[] { game, otherGame })
            {
                var savedGame = Assert.Single(
                    savedGames,
                    g => g.Id == expectedGame.Id);

                Assert.Equal(GameStatus.InProgress, savedGame.Status);
                Assert.Equal(expectedGame.SessionId, savedGame.SessionId);
                Assert.Equal(expectedGame.Numbers, savedGame.Numbers);
                Assert.Null(savedGame.CompletedAt);
                Assert.Null(savedGame.DurationSeconds);
                Assert.Null(savedGame.GotItAt);
                Assert.Null(savedGame.CapturedDurationSeconds);
                Assert.Empty(savedGame.Attempts);
            }

            Assert.Equal(2, await dbContext.GameSessions.CountAsync());
        }
    }

    [Theory]
    [InlineData(1)]
    [InlineData(100)]
    public async Task History_PaginatesWithTimestampTies_WithoutDuplicatesOrOtherSessions(int pageSize)
    {
        // Arrange
        var session = new GameSession();
        var game = new Game(session.Id, new[] { 1, 2, 3, 4 });

        var otherSession = new GameSession();
        var otherGame = new Game(otherSession.Id, new[] { 5, 6, 7, 8 });

        var timestamp = new DateTime(
            2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

        var games = Enumerable.Range(1, pageSize + 2)
            .Select(_ => new Game(session.Id, new[] { 1, 2, 3, 4 }))
            .ToArray();

        using (var scope = _factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider
                .GetRequiredService<GameDbContext>();

            dbContext.GameSessions.AddRange(session, otherSession);
            dbContext.Games.AddRange(game, otherGame);
            await dbContext.SaveChangesAsync();

            dbContext.Games.AddRange(games);

            for (var index = 0; index < games.Length; index++)
            {
                dbContext.Entry(games[index])
                    .Property(g => g.Id)
                    .CurrentValue = Guid.Parse(
                        $"00000000-0000-0000-0000-{index + 1:D12}");

                dbContext.Entry(games[index])
                    .Property(g => g.CreatedAt)
                    .CurrentValue = timestamp;
            }

            dbContext.Entry(game)
                .Property(g => g.CreatedAt)
                .CurrentValue = timestamp.AddDays(1);

            await dbContext.SaveChangesAsync();
        }

        var expectedIds = new[] { game.Id }
            .Concat(games.OrderByDescending(g => g.Id).Select(g => g.Id))
            .ToArray();

        var seen = new List<Guid>();
        Guid? cursor = null;

        // Act
        do
        {
            var url = $"/api/gamesessions/{session.Id}/history?pageSize={pageSize}";

            if (cursor.HasValue)
            {
                url += $"&cursor={cursor}";
            }

            var response = await _client.GetAsync(url);

            // Assert
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);

            var page = await response.Content.ReadFromJsonAsync<GameHistoryResponse>();

            Assert.NotNull(page);
            Assert.InRange(page.Games.Count, 1, pageSize);
            Assert.All(page.Games, g => Assert.Equal(session.Id, g.SessionId));

            seen.AddRange(page.Games.Select(g => g.Id));

            Assert.Equal(seen.Count < expectedIds.Length, page.HasMore);
            Assert.Equal(
                page.HasMore ? page.Games.Last().Id : (Guid?)null,
                page.NextCursor);

            cursor = page.NextCursor;
        }
        while (cursor.HasValue && seen.Count <= expectedIds.Length);

        Assert.Equal(expectedIds, seen);
        Assert.Equal(seen.Count, seen.Distinct().Count());

        // Verify the terminal page.
        var terminal = await _client.GetFromJsonAsync<GameHistoryResponse>(
            $"/api/gamesessions/{session.Id}/history?cursor={seen.Last()}");

        Assert.NotNull(terminal);
        Assert.Empty(terminal.Games);
        Assert.False(terminal.HasMore);
        Assert.Null(terminal.NextCursor);
    }

    [Fact]
    public async Task EmptySession_ReturnsEmptyHistoryZeroStatsAndZeroDeleted()
    {
        // Arrange & Act: Create a new session.
        var response = await _client.PostAsync("/api/gamesessions", null);

        // Assert: Session creation.
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        var session = await response.Content.ReadFromJsonAsync<GameSessionResponse>();

        Assert.NotNull(session);

        // Assert: Session was persisted.
        using (var scope = _factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider
                .GetRequiredService<GameDbContext>();

            var savedSession = await dbContext.GameSessions
                .SingleAsync();

            Assert.Equal(session.Id, savedSession.Id);
            Assert.Equal(
                session.CreatedAt.Ticks / 10,
                savedSession.CreatedAt.Ticks / 10);
        }

        // Assert: Empty history.
        var history = await _client.GetFromJsonAsync<GameHistoryResponse>(
            $"/api/gamesessions/{session.Id}/history");

        Assert.NotNull(history);
        Assert.Empty(history.Games);
        Assert.False(history.HasMore);
        Assert.Null(history.NextCursor);

        // Assert: Zero statistics.
        var stats = await _client.GetFromJsonAsync<GameStatsResponse>(
            $"/api/gamesessions/{session.Id}/stats");

        Assert.Equal(
            new GameStatsResponse(0, 0, 0, 0, 0, 0, 0),
            stats);

        // Assert: Deleting empty history deletes zero records.
        var deleted = await _client.DeleteAsync(
            $"/api/gamesessions/{session.Id}/history");

        Assert.Equal(HttpStatusCode.OK, deleted.StatusCode);

        var deleteResult = await deleted.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(0, deleteResult.GetProperty("deletedCount").GetInt32());
    }


    [Fact]
    public async Task StatsAndClearHistory_AggregateOnlySessionAndPreserveActiveGameAndAttempts()
    {
        // Arrange
        var session = new GameSession();
        var active = new Game(session.Id, new[] { 1, 2, 3, 4 });
        active.RecordGotIt(9);
        active.AddAttempt("1+2+3+4", false);

        var completed = new Game(session.Id, new[] { 1, 2, 3, 4 });
        completed.AddAttempt("1+2+3+4", false);
        completed.AddAttempt("1*2*3*4", true);
        completed.Complete(8);

        var abandoned = new Game(session.Id, new[] { 1, 2, 3, 4 });
        abandoned.Abandon();

        var otherSession = new GameSession();
        var other = new Game(otherSession.Id, new[] { 1, 2, 3, 4 });
        other.AddAttempt("1*2*3*4", true);
        other.Complete(12);

        using (var scope = _factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider
                .GetRequiredService<GameDbContext>();

            dbContext.GameSessions.AddRange(session, otherSession);
            dbContext.Games.AddRange(active, completed, abandoned, other);

            await dbContext.SaveChangesAsync();
        }

        var prefix = $"/api/gamesessions/{session.Id}";

        // Assert: Statistics include only games in this session.
        var stats = await _client.GetFromJsonAsync<GameStatsResponse>(
            prefix + "/stats");

        Assert.Equal(
            new GameStatsResponse(3, 1, 1, 1, 3, 1, 33),
            stats);

        // Assert: History contains all three games and their attempts.
        var history = await _client.GetFromJsonAsync<GameHistoryResponse>(
            prefix + "/history");

        Assert.NotNull(history);
        Assert.Equal(3, history.Games.Count);

        Assert.Equal(
            2,
            history.Games.Single(g => g.Id == completed.Id).Attempts.Count);

        // Act: Clear history.
        var response = await _client.DeleteAsync(prefix + "/history");

        // Assert: Only the completed and abandoned games are deleted.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var deleteResult = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(2, deleteResult.GetProperty("deletedCount").GetInt32());

        // Verify the active game and its attempt are preserved.
        using (var scope = _factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider
                .GetRequiredService<GameDbContext>();

            var savedActive = await dbContext.Games
                .Include(g => g.Attempts)
                .SingleAsync(g => g.Id == active.Id);

            Assert.Equal(GameStatus.InProgress, savedActive.Status);
            Assert.Equal(new[] { 1, 2, 3, 4 }, savedActive.Numbers);
            Assert.NotNull(savedActive.GotItAt);
            Assert.Equal(9, savedActive.CapturedDurationSeconds);
            Assert.Null(savedActive.DurationSeconds);

            var activeAttempt = Assert.Single(savedActive.Attempts);
            Assert.Equal("1+2+3+4", activeAttempt.Expression);
            Assert.False(activeAttempt.IsCorrect);

            // Verify the other session remains untouched.
            var savedOther = await dbContext.Games
                .Include(g => g.Attempts)
                .SingleAsync(g => g.Id == other.Id);

            Assert.Equal(GameStatus.Completed, savedOther.Status);
            Assert.Equal(12, savedOther.DurationSeconds);
            Assert.Single(savedOther.Attempts);
            Assert.True(savedOther.Attempts.Single().IsCorrect);

            Assert.Equal(2, await dbContext.Games.CountAsync());
            Assert.Equal(2, await dbContext.GameAttempts.CountAsync());
            Assert.Equal(2, await dbContext.GameSessions.CountAsync());

            Assert.False(await dbContext.Games.AnyAsync(
                g => g.Id == completed.Id || g.Id == abandoned.Id));
        }

        // Verify statistics after clearing history.
        var updatedStats = await _client.GetFromJsonAsync<GameStatsResponse>(
            prefix + "/stats");

        Assert.Equal(
            new GameStatsResponse(1, 0, 1, 0, 1, 0, 0),
            updatedStats);

        // Verify the active puzzle can still be retrieved.
        var puzzle = await _client.GetFromJsonAsync<PuzzleResponse>(
            prefix + "/puzzle");

        Assert.NotNull(puzzle);
        Assert.Equal(active.Id, puzzle.Id);
        Assert.Equal(9, puzzle.CapturedDurationSeconds);

        // Verify repeated deletion is safe.
        var repeated = await _client.DeleteAsync(prefix + "/history");

        Assert.Equal(HttpStatusCode.OK, repeated.StatusCode);

        var repeatedResult =
            await repeated.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(0, repeatedResult.GetProperty("deletedCount").GetInt32());
    }

    [Theory]
    [InlineData("puzzle")]
    [InlineData("history")]
    [InlineData("stats")]
    [InlineData("delete-history")]
    public async Task SessionEndpoints_WithMissingSession_Return404(string operation)
    {
        // Arrange
        var path =
            $"/api/gamesessions/{Guid.Empty}/{(operation == "delete-history" ? "history" : operation)}";

        // Act
        var response = operation == "delete-history"
            ? await _client.DeleteAsync(path)
            : await _client.GetAsync(path);

        // Assert
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<GameDbContext>();

        Assert.Empty(await dbContext.Games.ToListAsync());
        Assert.Empty(await dbContext.GameSessions.ToListAsync());
    }

}
