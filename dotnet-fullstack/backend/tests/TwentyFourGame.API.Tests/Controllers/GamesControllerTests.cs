
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;
using TwentyFourGame.API.Tests.Factories;
using TwentyFourGame.Application.DTOs;
using TwentyFourGame.Domain.Entities;
using TwentyFourGame.Domain.Enums;
using TwentyFourGame.Domain.Rules;
using TwentyFourGame.Infrastructure.Persistence;

namespace TwentyFourGame.API.Tests.Controllers;

public class GamesControllerTests
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    private readonly HttpClient _client;

    public GamesControllerTests(
        CustomWebApplicationFactory factory)
    {
        _factory = factory;

        using var scope = factory.Services.CreateScope();

        var dbContext = scope.ServiceProvider
            .GetRequiredService<GameDbContext>();

        // Ensure the test database schema is current.
        dbContext.Database.Migrate();

        // Start each test with an empty database.
        dbContext.Database.ExecuteSqlRaw(
            """
            TRUNCATE TABLE game_attempts, games, game_sessions
            RESTART IDENTITY CASCADE;
            """);

        _client = factory.CreateClient();
    }

    public enum InvalidGameRoute
    {
        WrongSession,
        MissingSession,
        MissingGame
    }

    private async Task<Game> CreateGameAsync()
    {
        // Arrange: create a session and a game with known numbers.
        var session = new GameSession();
        var game = new Game(session.Id, new[] { 1, 2, 3, 4 });

        using var scope = _factory.Services.CreateScope();

        var dbContext = scope.ServiceProvider
            .GetRequiredService<GameDbContext>();

        dbContext.GameSessions.Add(session);
        dbContext.Games.Add(game);

        await dbContext.SaveChangesAsync();

        return game;
    }

    private static (Guid SessionId, Guid GameId) GetInvalidGameRoute(
        Game game,
        Game otherGame,
        InvalidGameRoute scenario)
    {
        return scenario switch
        {
            InvalidGameRoute.WrongSession =>
                (otherGame.SessionId, game.Id),

            InvalidGameRoute.MissingSession =>
                (Guid.Empty, game.Id),

            InvalidGameRoute.MissingGame =>
                (game.SessionId, Guid.Empty),

            _ => throw new ArgumentOutOfRangeException(nameof(scenario))
        };
    }

    private async Task AssertGameUnchangedAsync(Game expectedGame)
    {
        using var scope = _factory.Services.CreateScope();

        var dbContext = scope.ServiceProvider
            .GetRequiredService<GameDbContext>();

        var savedGame = await dbContext.Games
            .Include(game => game.Attempts)
            .SingleAsync(game => game.Id == expectedGame.Id);

        Assert.Equal(expectedGame.SessionId, savedGame.SessionId);
        Assert.Equal(expectedGame.Numbers, savedGame.Numbers);
        Assert.Equal(expectedGame.Status, savedGame.Status);

        Assert.Equal(
            expectedGame.CompletedAt?.Ticks / 10,
            savedGame.CompletedAt?.Ticks / 10);

        Assert.Equal(
            expectedGame.DurationSeconds,
            savedGame.DurationSeconds);

        Assert.Equal(
            expectedGame.GotItAt?.Ticks / 10,
            savedGame.GotItAt?.Ticks / 10);

        Assert.Equal(
            expectedGame.CapturedDurationSeconds,
            savedGame.CapturedDurationSeconds);

        var expectedAttempts = expectedGame.Attempts
            .OrderBy(attempt => attempt.Id)
            .ToList();

        var savedAttempts = savedGame.Attempts
            .OrderBy(attempt => attempt.Id)
            .ToList();

        Assert.Equal(expectedAttempts.Count, savedAttempts.Count);

        for (var i = 0; i < expectedAttempts.Count; i++)
        {
            Assert.Equal(expectedAttempts[i].Id, savedAttempts[i].Id);
            Assert.Equal(expectedAttempts[i].Expression, savedAttempts[i].Expression);
            Assert.Equal(expectedAttempts[i].IsCorrect, savedAttempts[i].IsCorrect);

            Assert.Equal(
                expectedAttempts[i].CreatedAt.Ticks / 10,
                savedAttempts[i].CreatedAt.Ticks / 10);
        }
    }

    [Fact]
    public async Task SubmitAnswer_WithIncorrectExpression_RecordsAttemptAndKeepsGameInProgress()
    {
        // Arrange: create a session and puzzle.
        var createResponse = await _client.PostAsync(
            "/api/gamesessions",
            null);

        createResponse.EnsureSuccessStatusCode();

        var session = await createResponse.Content
            .ReadFromJsonAsync<GameSessionResponse>();

        Assert.NotNull(session);

        var puzzleResponse = await _client.PostAsync(
            $"/api/gamesessions/{session.Id}/puzzle",
            null);

        puzzleResponse.EnsureSuccessStatusCode();

        var puzzle = await puzzleResponse.Content
            .ReadFromJsonAsync<PuzzleResponse>();

        Assert.NotNull(puzzle);

        // Create a valid arithmetic expression that does not equal 24.
        var numbers = puzzle.Numbers;

        var expression = string.Join("+", numbers);

        if (GameRules.CheckAnswer(expression, numbers).Valid)
        {
            expression = $"{numbers[0]}+{numbers[1]}+{numbers[2]}-{numbers[3]}";
        }

        var answerResult = GameRules.CheckAnswer(expression, numbers);

        Assert.False(answerResult.Valid);
        Assert.NotNull(answerResult.Value);

        // Act: submit the incorrect expression.
        var request = new SubmitAnswerRequest(
            expression,
            numbers,
            DurationSeconds: 12.5);

        var response = await _client.PostAsJsonAsync(
            $"/api/gamesessions/{session.Id}/games/{puzzle.Id}/answers",
            request);

        // Assert: the API accepts and reports the incorrect attempt.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        // Verify persisted game and attempt.
        using var scope = _factory.Services.CreateScope();

        var dbContext = scope.ServiceProvider
            .GetRequiredService<GameDbContext>();

        var game = await dbContext.Games
            .Include(game => game.Attempts)
            .SingleAsync(game => game.Id == puzzle.Id);

        Assert.Equal(GameStatus.InProgress, game.Status);

        Assert.Single(game.Attempts);

        var attempt = game.Attempts.Single();

        Assert.Equal(expression, attempt.Expression);
        Assert.False(attempt.IsCorrect);

        // An incorrect answer must not complete the game or capture time.
        Assert.Null(game.CompletedAt);
        Assert.Null(game.DurationSeconds);
        Assert.Null(game.GotItAt);
        Assert.Null(game.CapturedDurationSeconds);
    }


    [Fact]
    public async Task SubmitAnswer_WithCorrectExpression_CompletesGameAndRecordsAttempt()
    {
        // Arrange: create a session through the API.
        var createResponse = await _client.PostAsync(
            "/api/gamesessions",
            null);

        createResponse.EnsureSuccessStatusCode();

        var session = await createResponse.Content
            .ReadFromJsonAsync<GameSessionResponse>();

        Assert.NotNull(session);

        // Insert a game with known numbers into the test database.
        var numbers = new[] { 1, 2, 3, 4 };
        var game = new Game(session.Id, numbers);

        using (var scope = _factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider
                .GetRequiredService<GameDbContext>();

            dbContext.Games.Add(game);
            await dbContext.SaveChangesAsync();
        }

        // Act: submit an expression that evaluates to 24.
        var expression = "1*2*3*4";

        var request = new SubmitAnswerRequest(
            expression,
            numbers,
            DurationSeconds: 12.5);

        var response = await _client.PostAsJsonAsync(
            $"/api/gamesessions/{session.Id}/games/{game.Id}/answers",
            request);

        // Assert: the API accepts the correct answer.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        // Verify the persisted game and attempt.
        using var verificationScope = _factory.Services.CreateScope();

        var verificationDb = verificationScope.ServiceProvider
            .GetRequiredService<GameDbContext>();

        var savedGame = await verificationDb.Games
            .Include(game => game.Attempts)
            .SingleAsync(savedGame => savedGame.Id == game.Id);

        Assert.Equal(GameStatus.Completed, savedGame.Status);

        Assert.NotNull(savedGame.CompletedAt);
        Assert.Equal(12, savedGame.DurationSeconds);

        Assert.Single(savedGame.Attempts);

        var attempt = savedGame.Attempts.Single();

        Assert.Equal(expression, attempt.Expression);
        Assert.True(attempt.IsCorrect);
    }


    [Fact]
    public async Task SubmitAnswer_AfterGotIt_UsesCapturedDuration()
    {
        // Arrange: create a session through the API.
        var createResponse = await _client.PostAsync(
            "/api/gamesessions",
            null);

        createResponse.EnsureSuccessStatusCode();

        var session = await createResponse.Content
            .ReadFromJsonAsync<GameSessionResponse>();

        Assert.NotNull(session);

        // Insert a game with known numbers.
        var numbers = new[] { 1, 2, 3, 4 };
        var game = new Game(session.Id, numbers);

        using (var scope = _factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider
                .GetRequiredService<GameDbContext>();

            dbContext.Games.Add(game);
            await dbContext.SaveChangesAsync();
        }

        // Record the Got It duration.
        var gotItRequest = new RecordGotItRequest(
            DurationSeconds: 15.8);

        var gotItResponse = await _client.PostAsJsonAsync(
            $"/api/gamesessions/{session.Id}/games/{game.Id}/got-it",
            gotItRequest);

        Assert.Equal(HttpStatusCode.OK, gotItResponse.StatusCode);

        // Verify the captured timer.
        using (var verificationScope = _factory.Services.CreateScope())
        {
            var verificationDb = verificationScope.ServiceProvider
                .GetRequiredService<GameDbContext>();

            var savedGame = await verificationDb.Games
                .SingleAsync(savedGame => savedGame.Id == game.Id);

            Assert.NotNull(savedGame.GotItAt);
            Assert.Equal(15, savedGame.CapturedDurationSeconds);
            Assert.Equal(GameStatus.InProgress, savedGame.Status);
        }

        // Submit the correct answer with a different duration.
        var answerRequest = new SubmitAnswerRequest(
            "1*2*3*4",
            numbers,
            DurationSeconds: 20);

        var answerResponse = await _client.PostAsJsonAsync(
            $"/api/gamesessions/{session.Id}/games/{game.Id}/answers",
            answerRequest);

        Assert.Equal(HttpStatusCode.OK, answerResponse.StatusCode);

        // Verify that the captured Got It duration takes precedence.
        using var finalScope = _factory.Services.CreateScope();

        var finalDb = finalScope.ServiceProvider
            .GetRequiredService<GameDbContext>();

        var completedGame = await finalDb.Games
            .Include(savedGame => savedGame.Attempts)
            .SingleAsync(savedGame => savedGame.Id == game.Id);

        Assert.Equal(GameStatus.Completed, completedGame.Status);
        Assert.NotNull(completedGame.CompletedAt);
        Assert.Equal(15, completedGame.DurationSeconds);
        Assert.Equal(15, completedGame.CapturedDurationSeconds);
        Assert.NotNull(completedGame.GotItAt);

        Assert.Single(completedGame.Attempts);
        Assert.True(completedGame.Attempts.Single().IsCorrect);
    }

    [Fact]
    public async Task SubmitAnswer_WhenGameAlreadyHas100Attempts_ReturnsConflict()
    {
        // Arrange: create a session and puzzle.
        var createResponse = await _client.PostAsync(
            "/api/gamesessions",
            null);

        createResponse.EnsureSuccessStatusCode();

        var session = await createResponse.Content
            .ReadFromJsonAsync<GameSessionResponse>();

        Assert.NotNull(session);

        var puzzleResponse = await _client.PostAsync(
            $"/api/gamesessions/{session.Id}/puzzle",
            null);

        puzzleResponse.EnsureSuccessStatusCode();

        var puzzle = await puzzleResponse.Content
            .ReadFromJsonAsync<PuzzleResponse>();

        Assert.NotNull(puzzle);

        // Seed 100 attempts directly into the database.
        using (var scope = _factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider
                .GetRequiredService<GameDbContext>();

            var game = await dbContext.Games
                .SingleAsync(game => game.Id == puzzle.Id);

            for (var i = 0; i < Game.MaxAttemptsPerGame; i++)
            {
                game.AddAttempt("1+2+3+4", false);
            }

            await dbContext.SaveChangesAsync();
        }

        // Act: submit the 101st attempt.
        var request = new SubmitAnswerRequest(
            "1+2+3+4",
            puzzle.Numbers,
            DurationSeconds: 12.5);

        var response = await _client.PostAsJsonAsync(
            $"/api/gamesessions/{session.Id}/games/{puzzle.Id}/answers",
            request);

        // Assert: the attempt limit is enforced.
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);

        using var verifyScope = _factory.Services.CreateScope();

        var verifyDb = verifyScope.ServiceProvider
            .GetRequiredService<GameDbContext>();

        var savedAttempts = await verifyDb.GameAttempts
            .CountAsync(attempt => attempt.GameId == puzzle.Id);

        Assert.Equal(Game.MaxAttemptsPerGame, savedAttempts);
    }

    [Fact]
    public async Task RecordGotIt_WhenCalledMultipleTimes_PreservesOriginalDurationAndTimestamp()
    {
        // Arrange: create a session through the API.
        var createResponse = await _client.PostAsync(
            "/api/gamesessions",
            null);

        createResponse.EnsureSuccessStatusCode();

        var session = await createResponse.Content
            .ReadFromJsonAsync<GameSessionResponse>();

        Assert.NotNull(session);

        // Insert a game with known numbers.
        var game = new Game(session.Id, new[] { 1, 2, 3, 4 });

        using (var scope = _factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider
                .GetRequiredService<GameDbContext>();

            dbContext.Games.Add(game);
            await dbContext.SaveChangesAsync();
        }

        // Act: record Got It for the first time.
        var firstRequest = new RecordGotItRequest(
            DurationSeconds: 15.8);

        var firstResponse = await _client.PostAsJsonAsync(
            $"/api/gamesessions/{session.Id}/games/{game.Id}/got-it",
            firstRequest);

        Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);

        // Read the first captured values from the database.
        DateTime firstGotItAt;
        int? firstCapturedDuration;

        using (var scope = _factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider
                .GetRequiredService<GameDbContext>();

            var savedGame = await dbContext.Games
                .SingleAsync(savedGame => savedGame.Id == game.Id);

            Assert.NotNull(savedGame.GotItAt);
            Assert.Equal(15, savedGame.CapturedDurationSeconds);

            firstGotItAt = savedGame.GotItAt.Value;
            firstCapturedDuration = savedGame.CapturedDurationSeconds;
        }

        // Act: call Got It again with a different duration.
        var secondRequest = new RecordGotItRequest(
            DurationSeconds: 25.5);

        var secondResponse = await _client.PostAsJsonAsync(
            $"/api/gamesessions/{session.Id}/games/{game.Id}/got-it",
            secondRequest);

        Assert.Equal(HttpStatusCode.OK, secondResponse.StatusCode);

        // Assert: the original values are preserved.
        using var verificationScope = _factory.Services.CreateScope();

        var verificationDb = verificationScope.ServiceProvider
            .GetRequiredService<GameDbContext>();

        var finalGame = await verificationDb.Games
            .SingleAsync(savedGame => savedGame.Id == game.Id);

        Assert.Equal(firstGotItAt, finalGame.GotItAt);
        Assert.Equal(firstCapturedDuration, finalGame.CapturedDurationSeconds);
        Assert.Equal(15, finalGame.CapturedDurationSeconds);
        Assert.Equal(GameStatus.InProgress, finalGame.Status);
    }


    [Theory]
    [InlineData(InvalidGameRoute.WrongSession)]
    [InlineData(InvalidGameRoute.MissingSession)]
    [InlineData(InvalidGameRoute.MissingGame)]
    public async Task GetGame_WhenSessionOrGameIdIsInvalid_ReturnsNotFoundWithoutMutation(
        InvalidGameRoute scenario)
    {
        // Arrange: create two independent games.
        var game = await CreateGameAsync();
        var otherGame = await CreateGameAsync();

        var (sessionId, gameId) = GetInvalidGameRoute(
            game,
            otherGame,
            scenario);

        // Act: request the game using invalid route IDs.
        var response = await _client.GetAsync(
            $"/api/gamesessions/{sessionId}/games/{gameId}");

        // Assert: the API returns 404.
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        // Verify that neither game was changed.
        await AssertGameUnchangedAsync(game);
        await AssertGameUnchangedAsync(otherGame);
    }

    [Theory]
    [InlineData(InvalidGameRoute.WrongSession)]
    [InlineData(InvalidGameRoute.MissingSession)]
    [InlineData(InvalidGameRoute.MissingGame)]
    public async Task SubmitAnswer_WhenSessionOrGameIdIsInvalid_ReturnsNotFoundWithoutMutation(
        InvalidGameRoute scenario)
    {
        // Arrange: create two independent games.
        var game = await CreateGameAsync();
        var otherGame = await CreateGameAsync();

        var (sessionId, gameId) = GetInvalidGameRoute(
            game,
            otherGame,
            scenario);

        var request = new SubmitAnswerRequest(
            "1*2*3*4",
            new[] { 1, 2, 3, 4 },
            DurationSeconds: 12);

        // Act: submit an answer using invalid route IDs.
        var response = await _client.PostAsJsonAsync(
            $"/api/gamesessions/{sessionId}/games/{gameId}/answers",
            request);

        // Assert: the API returns 404.
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        // Verify that neither game nor its attempts were changed.
        await AssertGameUnchangedAsync(game);
        await AssertGameUnchangedAsync(otherGame);
    }

    [Theory]
    [InlineData(InvalidGameRoute.WrongSession)]
    [InlineData(InvalidGameRoute.MissingSession)]
    [InlineData(InvalidGameRoute.MissingGame)]
    public async Task RecordGotIt_WhenSessionOrGameIdIsInvalid_ReturnsNotFoundWithoutMutation(
        InvalidGameRoute scenario)
    {
        // Arrange: create two independent games.
        var game = await CreateGameAsync();
        var otherGame = await CreateGameAsync();

        var (sessionId, gameId) = GetInvalidGameRoute(
            game,
            otherGame,
            scenario);

        var request = new RecordGotItRequest(
            DurationSeconds: 12);

        // Act: record Got It using invalid route IDs.
        var response = await _client.PostAsJsonAsync(
            $"/api/gamesessions/{sessionId}/games/{gameId}/got-it",
            request);

        // Assert: the API returns 404.
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);

        // Verify that neither game was changed.
        await AssertGameUnchangedAsync(game);
        await AssertGameUnchangedAsync(otherGame);
    }

    [Fact]
    public async Task GetGame_ReturnsSavedFieldsAndOrderedAttempts()
    {
        // Arrange: create a game with known numbers.
        var game = await CreateGameAsync();

        // Record an incorrect attempt.
        game.AddAttempt("1+2+3+4", false);

        // Capture the Got It duration.
        game.RecordGotIt(7);

        // Record a correct attempt and complete the game.
        game.AddAttempt("1*2*3*4", true);
        game.Complete(7);

        using (var scope = _factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider
                .GetRequiredService<GameDbContext>();

            dbContext.Update(game);
            dbContext.GameAttempts.AddRange(game.Attempts);

            await dbContext.SaveChangesAsync();
        }

        // Act: retrieve the saved game.
        var response = await _client.GetAsync(
            $"/api/gamesessions/{game.SessionId}/games/{game.Id}");

        // Assert: verify the response.
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var result = await response.Content
            .ReadFromJsonAsync<GameResponse>();

        Assert.NotNull(result);

        Assert.Equal(game.Id, result.Id);
        Assert.Equal(game.SessionId, result.SessionId);
        Assert.Equal(game.Numbers, result.Numbers);
        Assert.Equal(GameStatus.Completed, result.Status);

        Assert.Equal(7, result.DurationSeconds);
        Assert.Equal(7, result.CapturedDurationSeconds);

        Assert.NotNull(result.CompletedAt);
        Assert.NotNull(result.GotItAt);

        Assert.Equal(
            new[] { "1+2+3+4", "1*2*3*4" },
            result.Attempts.Select(attempt => attempt.Expression));

        Assert.Equal(
            new[] { false, true },
            result.Attempts.Select(attempt => attempt.IsCorrect));

        Assert.All(
            result.Attempts,
            attempt => Assert.NotEqual(Guid.Empty, attempt.Id));

        // Verify that retrieving the game did not change persisted data.
        await AssertGameUnchangedAsync(game);
    }

    [Theory]
    [InlineData(GameStatus.Completed)]
    [InlineData(GameStatus.Abandoned)]
    public async Task SubmitAnswer_WhenGameIsFinished_ReturnsConflictWithoutMutation(
        GameStatus status)
    {
        // Arrange: create a finished game.
        var game = await CreateGameAsync();

        if (status == GameStatus.Completed)
        {
            game.AddAttempt("1*2*3*4", true);
            game.Complete(12);
        }
        else
        {
            game.Abandon();
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider
                .GetRequiredService<GameDbContext>();

            dbContext.Update(game);
            dbContext.GameAttempts.AddRange(game.Attempts);

            await dbContext.SaveChangesAsync();
        }

        var request = new SubmitAnswerRequest(
            "1*2*3*4",
            new[] { 1, 2, 3, 4 },
            DurationSeconds: 10);

        // Act: submit another answer.
        var response = await _client.PostAsJsonAsync(
            $"/api/gamesessions/{game.SessionId}/games/{game.Id}/answers",
            request);

        // Assert: the API rejects the mutation.
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);

        var problem = await response.Content
            .ReadFromJsonAsync<Microsoft.AspNetCore.Mvc.ProblemDetails>();

        Assert.NotNull(problem);
        Assert.Equal(409, problem.Status);
        Assert.Equal("Conflict", problem.Title);
        Assert.Equal("This game is no longer in progress.", problem.Detail);

        // Verify that the original game and attempts remain unchanged.
        await AssertGameUnchangedAsync(game);
    }

    [Theory]
    [InlineData(GameStatus.Completed)]
    [InlineData(GameStatus.Abandoned)]
    public async Task RecordGotIt_WhenGameIsFinished_ReturnsConflictWithoutMutation(
        GameStatus status)
    {
        // Arrange: create a finished game.
        var game = await CreateGameAsync();

        if (status == GameStatus.Completed)
        {
            game.AddAttempt("1*2*3*4", true);
            game.Complete(12);
        }
        else
        {
            game.Abandon();
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider
                .GetRequiredService<GameDbContext>();

            dbContext.Update(game);
            dbContext.GameAttempts.AddRange(game.Attempts);

            await dbContext.SaveChangesAsync();
        }

        var request = new RecordGotItRequest(
            DurationSeconds: 10);

        // Act: record Got It for a finished game.
        var response = await _client.PostAsJsonAsync(
            $"/api/gamesessions/{game.SessionId}/games/{game.Id}/got-it",
            request);

        // Assert: the API rejects the mutation.
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);

        var problem = await response.Content
            .ReadFromJsonAsync<Microsoft.AspNetCore.Mvc.ProblemDetails>();

        Assert.NotNull(problem);
        Assert.Equal(409, problem.Status);
        Assert.Equal("Conflict", problem.Title);
        Assert.Equal(
            "Got It can only be recorded for an in-progress game.",
            problem.Detail);

        // Verify that the original game and attempts remain unchanged.
        await AssertGameUnchangedAsync(game);
    }

    [Theory]
    [InlineData(new[] { 1, 2, 3, 5 })]
    [InlineData(new[] { 4, 3, 2, 1 })]
    public async Task SubmitAnswer_WithDifferentSavedNumbers_Returns400WithoutAttempt(
        int[] submittedNumbers)
    {
        // Arrange
        var game = await CreateGameAsync();

        var request = new SubmitAnswerRequest(
            "1*2*3*4",
            submittedNumbers,
            DurationSeconds: 12);

        // Act
        var response = await _client.PostAsJsonAsync(
            $"/api/gamesessions/{game.SessionId}/games/{game.Id}/answers",
            request);

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<
            Microsoft.AspNetCore.Mvc.ProblemDetails>();

        Assert.NotNull(problem);
        Assert.Equal(400, problem.Status);
        Assert.Equal("Invalid Request", problem.Title);
        Assert.Equal(
            "Submitted numbers do not match the game.",
            problem.Detail);

        await AssertGameUnchangedAsync(game);
    }

    [Theory]
    [InlineData("1+2+3+4", 10, "Your expression equals 10, not 24.")]
    [InlineData("1+2+3+4+", null, "The expression is incomplete.")]
    [InlineData("1+2+3+x", null, "Invalid character: x")]
    [InlineData("1+2+3", null, "You must use all four card numbers.")]
    [InlineData("1+2+3+3", null, "Use each card number exactly once.")]
    [InlineData("1/2+3+4", null, "Every intermediate result must be an integer.")]
    public async Task SubmitAnswer_WithUnsuccessfulExpression_ReturnsResultAndPersistsAttempt(
    string expression,
    int? expectedValue,
    string expectedMessage)
    {
        // Arrange
        var game = await CreateGameAsync();

        var request = new SubmitAnswerRequest(
            expression,
            new[] { 1, 2, 3, 4 },
            DurationSeconds: null);

        // Act
        var response = await _client.PostAsJsonAsync(
            $"/api/gamesessions/{game.SessionId}/games/{game.Id}/answers",
            request);

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content
            .ReadFromJsonAsync<AnswerSubmissionResponse>();

        Assert.NotNull(body);
        Assert.False(body.Valid);
        Assert.Equal(expectedValue, body.Value);
        Assert.Equal(expectedMessage, body.Message);
        Assert.Equal(game.Id, body.Game.Id);
        Assert.Equal(GameStatus.InProgress, body.Game.Status);

        var returnedAttempt = Assert.Single(body.Game.Attempts);

        Assert.Equal(expression, returnedAttempt.Expression);
        Assert.False(returnedAttempt.IsCorrect);

        using var scope = _factory.Services.CreateScope();

        var dbContext = scope.ServiceProvider
            .GetRequiredService<GameDbContext>();

        var savedGame = await dbContext.Games
            .Include(g => g.Attempts)
            .SingleAsync(g => g.Id == game.Id);

        var savedAttempt = Assert.Single(savedGame.Attempts);

        Assert.Equal(returnedAttempt.Id, savedAttempt.Id);
        Assert.Equal(expression, savedAttempt.Expression);
        Assert.False(savedAttempt.IsCorrect);

        Assert.Equal(GameStatus.InProgress, savedGame.Status);
        Assert.Null(savedGame.CompletedAt);
        Assert.Null(savedGame.DurationSeconds);
        Assert.Null(savedGame.GotItAt);
        Assert.Null(savedGame.CapturedDurationSeconds);
    }

    [Fact]
    public async Task CorrectAnswer_WithoutDuration_Returns400AndDoesNotPersistAttempt()
    {
        // Arrange
        var game = await CreateGameAsync();

        var request = new SubmitAnswerRequest(
            "1*2*3*4",
            new[] { 1, 2, 3, 4 },
            DurationSeconds: null);

        // Act
        var response = await _client.PostAsJsonAsync(
            $"/api/gamesessions/{game.SessionId}/games/{game.Id}/answers",
            request);

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();

        Assert.NotNull(problem);
        Assert.Equal("Invalid Request", problem.Title);
        Assert.Equal(
            "Duration is required for a correct answer.",
            problem.Detail);

        await AssertGameUnchangedAsync(game);
    }

    [Fact]
    public async Task CorrectAnswer_WithCapturedDuration_DoesNotRequireSubmittedDuration()
    {
        // Arrange
        var game = await CreateGameAsync();

        game.RecordGotIt(0);

        using (var scope = _factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider
                .GetRequiredService<GameDbContext>();

            dbContext.Games.Update(game);
            await dbContext.SaveChangesAsync();
        }

        var request = new SubmitAnswerRequest(
            "1*2*3*4",
            new[] { 1, 2, 3, 4 },
            DurationSeconds: null);

        // Act
        var response = await _client.PostAsJsonAsync(
            $"/api/gamesessions/{game.SessionId}/games/{game.Id}/answers",
            request);

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var body = await response.Content
            .ReadFromJsonAsync<AnswerSubmissionResponse>();

        Assert.NotNull(body);
        Assert.True(body.Valid);
        Assert.Equal(24, body.Value);
        Assert.Equal(GameStatus.Completed, body.Game.Status);
        Assert.Equal(0, body.Game.DurationSeconds);

        using (var scope = _factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider
                .GetRequiredService<GameDbContext>();

            var savedGame = await dbContext.Games
                .Include(g => g.Attempts)
                .SingleAsync(g => g.Id == game.Id);

            Assert.Equal(GameStatus.Completed, savedGame.Status);
            Assert.Equal(0, savedGame.DurationSeconds);

            var savedAttempt = Assert.Single(savedGame.Attempts);
            Assert.True(savedAttempt.IsCorrect);
        }
    }

    [Theory]
    [InlineData("answers", "{\"expression\":\"1*2*3*4\",\"numbers\":[1,2,3,4],\"durationSeconds\":-1}")]
    [InlineData("answers", "{\"expression\":\"1*2*3*4\",\"numbers\":[1,2,3,4],\"durationSeconds\":2147483648}")]
    [InlineData("got-it", "{\"durationSeconds\":-1}")]
    [InlineData("got-it", "{\"durationSeconds\":2147483648}")]
    [InlineData("got-it", "{\"durationSeconds\":null}")]
    [InlineData("got-it", "{\"durationSeconds\":\"NaN\"}")]
    [InlineData("answers", "{\"expression\":\"\",\"numbers\":[1,2,3,4]}")]
    [InlineData("answers", "{\"numbers\":[1,2,3,4]}")]
    [InlineData("answers", "{\"expression\":\"1*2*3*4\"}")]
    [InlineData("answers", "{\"expression\":\"1*2*3*4\",\"numbers\":[1,2,3]}")]
    [InlineData("answers", "{\"expression\":\"1*2*3*4\",\"numbers\":[1,2,3,4,5]}")]
    [InlineData("answers", "{\"expression\":\"1*2*3*4\",\"numbers\":[0,2,3,11]}")]
    public async Task InvalidMutationRequest_Returns400WithoutPersistence(
        string operation,
        string json)
    {
        // Arrange
        var game = await CreateGameAsync();

        using var content = new StringContent(
            json,
            System.Text.Encoding.UTF8,
            "application/json");

        // Act
        var response = await _client.PostAsync(
            $"/api/gamesessions/{game.SessionId}/games/{game.Id}/{operation}",
            content);

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var problem = await response.Content
            .ReadFromJsonAsync<ProblemDetails>();

        Assert.NotNull(problem);
        Assert.Equal(400, problem.Status);

        await AssertGameUnchangedAsync(game);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("""{"durationSeconds": null}""")]
    public async Task RecordGotIt_WithMissingOrNullDuration_Returns400WithoutMutation(
        string json)
    {
        // Arrange
        var game = await CreateGameAsync();

        using var content = new StringContent(
            json,
            System.Text.Encoding.UTF8,
            "application/json");

        // Act
        var response = await _client.PostAsync(
            $"/api/gamesessions/{game.SessionId}/games/{game.Id}/got-it",
            content);

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var scope = _factory.Services.CreateScope();

        var dbContext = scope.ServiceProvider
            .GetRequiredService<GameDbContext>();

        var savedGame = await dbContext.Games
            .Include(g => g.Attempts)
            .SingleAsync(g => g.Id == game.Id);

        Assert.Equal(GameStatus.InProgress, savedGame.Status);
        Assert.Null(savedGame.GotItAt);
        Assert.Null(savedGame.CapturedDurationSeconds);
        Assert.Null(savedGame.DurationSeconds);
        Assert.Empty(savedGame.Attempts);
    }

    [Theory]
    [InlineData(0, true)]
    [InlineData(604800, true)]
    [InlineData(604800.1, false)]
    [InlineData(604801, false)]
    public async Task RecordGotIt_WithDurationBoundaryValues_ValidatesCorrectly(
        double durationSeconds,
        bool expectedSuccess)
    {
        // Arrange
        var game = await CreateGameAsync();

        var json = System.Text.Json.JsonSerializer.Serialize(new
        {
            durationSeconds
        });

        using var content = new StringContent(
            json,
            System.Text.Encoding.UTF8,
            "application/json");

        // Act
        var response = await _client.PostAsync(
            $"/api/gamesessions/{game.SessionId}/games/{game.Id}/got-it",
            content);

        // Assert
        if (expectedSuccess)
        {
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);

            var body = await response.Content
                .ReadFromJsonAsync<PuzzleResponse>();

            Assert.NotNull(body);
            Assert.Equal((int)durationSeconds, body.CapturedDurationSeconds);
            Assert.NotNull(body.GotItAt);
        }
        else
        {
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }

        using var scope = _factory.Services.CreateScope();

        var dbContext = scope.ServiceProvider
            .GetRequiredService<GameDbContext>();

        var savedGame = await dbContext.Games
            .SingleAsync(g => g.Id == game.Id);

        Assert.Equal(GameStatus.InProgress, savedGame.Status);

        if (expectedSuccess)
        {
            Assert.Equal((int)durationSeconds, savedGame.CapturedDurationSeconds);
            Assert.NotNull(savedGame.GotItAt);
        }
        else
        {
            Assert.Null(savedGame.CapturedDurationSeconds);
            Assert.Null(savedGame.GotItAt);
        }
    }

}
