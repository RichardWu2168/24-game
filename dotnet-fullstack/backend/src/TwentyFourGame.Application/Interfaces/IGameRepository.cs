using TwentyFourGame.Application.DTOs;
using TwentyFourGame.Domain.Entities;

namespace TwentyFourGame.Application.Interfaces;

public interface IGameRepository
{
    Task<Game?> GetByIdAsync(
        Guid id,
        CancellationToken cancellationToken = default);

    Task AddAsync(
        Game game,
        CancellationToken cancellationToken = default);

    Task SaveChangesAsync(
        CancellationToken cancellationToken = default);

    Task<Game?> GetActiveBySessionIdAsync(
        Guid sessionId,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<Game>?> GetHistoryPageAsync(
        Guid sessionId,
        Guid? cursor,
        int pageSize,
        CancellationToken cancellationToken = default);

    Task<GameStatsData> GetStatsAsync(
        Guid sessionId,
        CancellationToken cancellationToken = default);

    Task<int> DeleteFinishedGamesAsync(
        Guid sessionId,
        CancellationToken cancellationToken = default);

}