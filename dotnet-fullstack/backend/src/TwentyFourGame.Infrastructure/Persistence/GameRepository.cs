using Microsoft.EntityFrameworkCore;
using TwentyFourGame.Application.DTOs;
using TwentyFourGame.Application.Interfaces;
using TwentyFourGame.Domain.Entities;
using TwentyFourGame.Domain.Enums;

namespace TwentyFourGame.Infrastructure.Persistence;

public sealed class GameRepository : IGameRepository
{
    private readonly GameDbContext _context;

    public GameRepository(GameDbContext context)
    {
        _context = context;
    }

    public async Task<Game?> GetByIdAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        return await _context.Games
            .Include(game => game.Attempts
                .OrderBy(attempt => attempt.CreatedAt)
                .ThenBy(attempt => attempt.Id)
                .Take(Game.MaxAttemptsPerGame))
            .FirstOrDefaultAsync(
                game => game.Id == id,
                cancellationToken);
    }

    public async Task AddAsync(
        Game game,
        CancellationToken cancellationToken = default)
    {
        await _context.Games.AddAsync(game, cancellationToken);
    }

    public async Task SaveChangesAsync(
        CancellationToken cancellationToken = default)
    {
        await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task<Game?> GetActiveBySessionIdAsync(
    Guid sessionId,
    CancellationToken cancellationToken = default)
    {
        return await _context.Games
            .FirstOrDefaultAsync(
                game => game.SessionId == sessionId &&
                        game.Status == GameStatus.InProgress,
                cancellationToken);
    }

    public async Task<IReadOnlyList<Game>?> GetHistoryPageAsync(
        Guid sessionId,
        Guid? cursor,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        var query = _context.Games
            .AsNoTracking()
            .Include(game => game.Attempts
                .OrderBy(attempt => attempt.CreatedAt)
                .ThenBy(attempt => attempt.Id)
                .Take(Game.MaxAttemptsPerGame))
            .Where(game => game.SessionId == sessionId);

        if (cursor.HasValue)
        {
            var cursorGame = await _context.Games
                .AsNoTracking()
                .FirstOrDefaultAsync(
                    game => game.Id == cursor.Value &&
                            game.SessionId == sessionId,
                    cancellationToken);

            // The cursor must belong to this session.
            if (cursorGame is null)
            {
                return null;
            }

            query = query.Where(game =>
                game.CreatedAt < cursorGame.CreatedAt ||
                (game.CreatedAt == cursorGame.CreatedAt &&
                 game.Id.CompareTo(cursorGame.Id) < 0));
        }

        return await query
            .OrderByDescending(game => game.CreatedAt)
            .ThenByDescending(game => game.Id)
            .Take(pageSize + 1)
            .ToListAsync(cancellationToken);
    }

    public async Task<GameStatsData> GetStatsAsync(
        Guid sessionId,
        CancellationToken cancellationToken = default)
    {
        var games = _context.Games
            .AsNoTracking()
            .Where(game => game.SessionId == sessionId);

        var totalGames = await games.CountAsync(cancellationToken);

        var completedGames = await games.CountAsync(
            game => game.Status == GameStatus.Completed,
            cancellationToken);

        var inProgressGames = await games.CountAsync(
            game => game.Status == GameStatus.InProgress,
            cancellationToken);

        var abandonedGames = await games.CountAsync(
            game => game.Status == GameStatus.Abandoned,
            cancellationToken);

        var attemptStats = await _context.GameAttempts
            .Where(attempt => attempt.Game!.SessionId == sessionId)
            .GroupBy(_ => 1)
            .Select(group => new
            {
                TotalAttempts = group.Count(),
                CorrectAttempts = group.Count(attempt => attempt.IsCorrect)
            })
            .SingleOrDefaultAsync(cancellationToken);

        return new GameStatsData(
            totalGames,
            completedGames,
            inProgressGames,
            abandonedGames,
            attemptStats?.TotalAttempts ?? 0,
            attemptStats?.CorrectAttempts ?? 0);
    }

    public async Task<int> DeleteFinishedGamesAsync(
        Guid sessionId,
        CancellationToken cancellationToken = default)
    {
        return await _context.Games
            .Where(game =>
                game.SessionId == sessionId &&
                (game.Status == GameStatus.Completed ||
                 game.Status == GameStatus.Abandoned))
            .ExecuteDeleteAsync(cancellationToken);
    }

}