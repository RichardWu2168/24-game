using TwentyFourGame.Application.DTOs;
using TwentyFourGame.Application.Interfaces;
using TwentyFourGame.Domain.Entities;
using TwentyFourGame.Domain.Enums;
using TwentyFourGame.Domain.Exceptions;
using TwentyFourGame.Domain.Rules;

namespace TwentyFourGame.Application.Services;

public sealed class GameService : IGameService
{
    private readonly IGameRepository _gameRepository;
    private readonly IGameSessionRepository _sessionRepository;

    public GameService(
        IGameRepository gameRepository,
        IGameSessionRepository sessionRepository)
    {
        _gameRepository = gameRepository;
        _sessionRepository = sessionRepository;
    }

    // Session operations

    public async Task<GameSessionResponse> CreateSessionAsync(
        CancellationToken cancellationToken = default)
    {
        var session = new GameSession();

        await _sessionRepository.AddAsync(
            session, cancellationToken);

        await _sessionRepository.SaveChangesAsync(
            cancellationToken);

        return new GameSessionResponse(
            session.Id,
            session.CreatedAt);
    }


    public async Task<GameResponse?> GetGameByIdAsync(
        Guid sessionId,
        Guid gameId,
        CancellationToken cancellationToken = default)
    {
        var game = await _gameRepository.GetByIdAsync(
            gameId,
            cancellationToken);

        if (game is null || game.SessionId != sessionId)
        {
            return null;
        }

        return ToResponse(game);
    }

    public async Task<AnswerSubmissionResponse?> SubmitAnswerAsync(
        Guid sessionId,
        Guid gameId,
        SubmitAnswerRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var game = await _gameRepository.GetByIdAsync(
            gameId,
            cancellationToken);

        if (game is null || game.SessionId != sessionId)
        {
            return null;
        }

        if (game.Status != GameStatus.InProgress)
        {
            throw new GameStateConflictException(
                "This game is no longer in progress.");
        }

        // The submitted numbers must match the saved game.
        if (request.Numbers is null ||
            !request.Numbers.SequenceEqual(game.Numbers))
        {
            throw new ArgumentException(
                "Submitted numbers do not match the game.",
                nameof(request));
        }

        // Always evaluate against the numbers stored by the backend.
        var result = GameRules.CheckAnswer(
            request.Expression,
            game.Numbers);

        // Record both correct and incorrect attempts.
        game.AddAttempt(request.Expression, result.Valid);

        if (result.Valid)
        {
            // Use the duration captured by Got It, if available.
            // Otherwise, use the duration supplied with the answer.
            var duration = game.CapturedDurationSeconds
                ?? ConvertDuration(
                    request.DurationSeconds
                    ?? throw new ArgumentException(
                        "Duration is required for a correct answer.",
                        nameof(request)));

            game.Complete(duration);
        }

        await _gameRepository.SaveChangesAsync(
            cancellationToken);

        return new AnswerSubmissionResponse(
            result.Valid,
            result.Message,
            result.Value,
            ToResponse(game));
    }

    // Mapping and validation helpers

    private static GameResponse ToResponse(Game game)
    {
        var attempts = game.Attempts
            .OrderBy(attempt => attempt.CreatedAt)
            .Select(attempt => new GameAttemptResponse(
                attempt.Id,
                attempt.Expression,
                attempt.IsCorrect,
                attempt.CreatedAt))
            .ToArray();

        return new GameResponse(
            game.Id,
            game.SessionId,
            game.Numbers,
            game.Status,
            game.CreatedAt,
            game.CompletedAt,
            game.GotItAt,
            game.DurationSeconds,
            game.CapturedDurationSeconds,
            attempts);
    }

    private static double ConvertDuration(double durationSeconds)
    {
        if (!double.IsFinite(durationSeconds) ||
            durationSeconds < 0 ||
            durationSeconds > 604800)
        {
            throw new ArgumentOutOfRangeException(
                nameof(durationSeconds),
                "Duration must be a finite, non-negative number within the supported range.");
        }

        // Match the Node.js implementation: discard fractional seconds.
        return Math.Round(
            durationSeconds,
            1,
            MidpointRounding.AwayFromZero);
    }

    public async Task<PuzzleResponse?> GetPuzzleAsync(
        Guid sessionId,
        CancellationToken cancellationToken = default)
    {
        var session = await _sessionRepository.GetByIdAsync(
            sessionId, cancellationToken);

        if (session is null)
        {
            return null;
        }

        var activeGame = await _gameRepository.GetActiveBySessionIdAsync(
            sessionId, cancellationToken);

        return activeGame is null
            ? null
            : ToPuzzleResponse(activeGame);
    }

    public async Task<PuzzleResponse?> CreatePuzzleAsync(
        Guid sessionId,
        CancellationToken cancellationToken = default)
    {
        var session = await _sessionRepository.GetByIdAsync(
            sessionId, cancellationToken);

        if (session is null)
        {
            return null;
        }

        var activeGame = await _gameRepository.GetActiveBySessionIdAsync(
            sessionId, cancellationToken);

        // Abandon the previous active game when starting a new one.
        activeGame?.Abandon();

        var numbers = Enumerable
            .Range(0, 4)
            .Select(_ => Random.Shared.Next(1, 11))
            .ToArray();

        var newGame = new Game(sessionId, numbers);

        await _gameRepository.AddAsync(
            newGame, cancellationToken);

        await _gameRepository.SaveChangesAsync(
            cancellationToken);

        return ToPuzzleResponse(newGame);
    }

    private static PuzzleResponse ToPuzzleResponse(Game game)
    {
        return new PuzzleResponse(
            game.Id,
            game.Numbers,
            game.CreatedAt,
            game.GotItAt,
            game.CapturedDurationSeconds);
    }

    public async Task<PuzzleResponse?> RecordGotItAsync(
        Guid sessionId,
        Guid gameId,
        RecordGotItRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (request.DurationSeconds is null)
        {
            throw new ArgumentException(
                "DurationSeconds is required.",
                nameof(request));
        }

        if (request.DurationSeconds.Value > 604800)
        {
            throw new ArgumentOutOfRangeException(
                nameof(request.DurationSeconds),
                "DurationSeconds cannot exceed one week.");
        }

        var game = await _gameRepository.GetByIdAsync(
            gameId, cancellationToken);

        if (game is null || game.SessionId != sessionId)
        {
            return null;
        }

        game.RecordGotIt(ConvertDuration(request.DurationSeconds.Value));

        await _gameRepository.SaveChangesAsync(cancellationToken);

        return ToPuzzleResponse(game);
    }

    public async Task<GameHistoryResponse?> GetSessionHistoryPageAsync(
        Guid sessionId,
        Guid? cursor = null,
        int pageSize = 10,
        CancellationToken cancellationToken = default)
    {
        if (pageSize < 1 || pageSize > 100)
        {
            throw new ArgumentOutOfRangeException(
                nameof(pageSize),
                "Page size must be between 1 and 100.");
        }

        var session = await _sessionRepository.GetByIdAsync(
            sessionId, cancellationToken);

        if (session is null)
        {
            return null;
        }

        var games = await _gameRepository.GetHistoryPageAsync(
            sessionId,
            cursor,
            pageSize,
            cancellationToken);

        // The session exists, so null means the cursor is invalid.
        if (games is null)
        {
            throw new ArgumentException(
                "The cursor is invalid or does not belong to this session.",
                nameof(cursor));
        }

        var hasMore = games.Count > pageSize;

        var pageGames = games
            .Take(pageSize)
            .ToArray();

        Guid? nextCursor = hasMore
            ? pageGames[^1].Id
            : null;

        return new GameHistoryResponse(
            pageGames.Select(ToResponse).ToArray(),
            hasMore,
            nextCursor);
    }

    public async Task<GameStatsResponse?> GetStatsAsync(
        Guid sessionId,
        CancellationToken cancellationToken = default)
    {
        var session = await _sessionRepository.GetByIdAsync(
            sessionId, cancellationToken);

        if (session is null)
        {
            return null;
        }

        var stats = await _gameRepository.GetStatsAsync(
            sessionId, cancellationToken);

        var accuracyPercent = stats.TotalAttempts == 0
            ? 0
            : (int)Math.Floor(
                (double)stats.CorrectAttempts /
                stats.TotalAttempts * 100 + 0.5);

        return new GameStatsResponse(
            stats.TotalGames,
            stats.CompletedGames,
            stats.InProgressGames,
            stats.AbandonedGames,
            stats.TotalAttempts,
            stats.CorrectAttempts,
            accuracyPercent);
    }

    public async Task<int?> ClearHistoryAsync(
        Guid sessionId,
        CancellationToken cancellationToken = default)
    {
        var session = await _sessionRepository.GetByIdAsync(
            sessionId,
            cancellationToken);

        if (session is null)
        {
            return null;
        }

        return await _gameRepository.DeleteFinishedGamesAsync(
            sessionId,
            cancellationToken);
    }

    public Task<AnswerCheckResponse> CheckAnswerAsync(
        CheckAnswerRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        cancellationToken.ThrowIfCancellationRequested();

        var result = GameRules.CheckAnswer(
            request.Expression,
            request.Numbers);

        var response = new AnswerCheckResponse(
            result.Valid,
            result.Message,
            result.Value);

        return Task.FromResult(response);
    }

}