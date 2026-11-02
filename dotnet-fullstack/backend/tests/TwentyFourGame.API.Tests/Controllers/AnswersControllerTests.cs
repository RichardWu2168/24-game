using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;
using TwentyFourGame.API.Tests.Factories;
using TwentyFourGame.Application.DTOs;
using TwentyFourGame.Domain.Entities;
using TwentyFourGame.Domain.Enums;
using TwentyFourGame.Infrastructure.Persistence;

namespace TwentyFourGame.API.Tests.Controllers;

public class AnswersControllerTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;
    private readonly HttpClient _client;

    public AnswersControllerTests(CustomWebApplicationFactory factory)
    {
        _factory = factory;

        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<GameDbContext>();

        dbContext.Database.Migrate();
        dbContext.Database.ExecuteSqlRaw(
            "TRUNCATE TABLE game_attempts, games, game_sessions RESTART IDENTITY CASCADE;");

        _client = factory.CreateClient();
    }

    [Theory]
    [InlineData("1*2*3*4", true, 24, "Correct! You made 24!")]
    [InlineData("1+2+3+4", false, 10, "Your expression equals 10, not 24.")]
    [InlineData("1+2+3+4+", false, null, "The expression is incomplete.")]
    public async Task StatelessCheck_ReturnsResultWithoutPersisting(
        string expression,
        bool valid,
        int? value,
        string message)
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
        var response = await _client.PostAsJsonAsync(
            "/api/answers/check",
            new CheckAnswerRequest(expression, new[] { 1, 2, 3, 4 }));

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var result = await response.Content.ReadFromJsonAsync<AnswerCheckResponse>();

        Assert.Equal(
            new AnswerCheckResponse(valid, message, value),
            result);

        // Verify that the existing game remains unchanged.
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
            Assert.Single(await dbContext.Games.ToListAsync());
            Assert.Empty(await dbContext.GameAttempts.ToListAsync());
        }
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("{\"expression\":\"\",\"numbers\":[1,2,3,4]}")]
    [InlineData("{\"expression\":\"1*2*3*4\",\"numbers\":null}")]
    [InlineData("{\"expression\":\"1*2*3*4\",\"numbers\":[1,2,3]}")]
    [InlineData("{\"expression\":\"1*2*3*4\",\"numbers\":[1,2,3,4,5]}")]
    [InlineData("{\"expression\":\"1*2*3*4\",\"numbers\":[0,2,3,11]}")]
    public async Task StatelessCheck_WithInvalidDto_ReturnsValidationProblemWithoutPersistence(
        string json)
    {
        // Arrange
        using var content = new StringContent(
            json,
            System.Text.Encoding.UTF8,
            "application/json");

        // Act
        var response = await _client.PostAsync("/api/answers/check", content);

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var problem = await response.Content
            .ReadFromJsonAsync<ValidationProblemDetails>();

        Assert.NotNull(problem);
        Assert.Equal(400, problem.Status);
        Assert.NotEmpty(problem.Errors);

        // Verify that no data was persisted.
        using var scope = _factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<GameDbContext>();

        Assert.Empty(await dbContext.GameSessions.ToListAsync());
        Assert.Empty(await dbContext.Games.ToListAsync());
        Assert.Empty(await dbContext.GameAttempts.ToListAsync());
    }
}