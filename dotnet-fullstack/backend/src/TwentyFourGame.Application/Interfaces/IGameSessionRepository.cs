using TwentyFourGame.Domain.Entities;

namespace TwentyFourGame.Application.Interfaces;

public interface IGameSessionRepository
{
    Task<GameSession?> GetByIdAsync(
        Guid id,
        CancellationToken cancellationToken = default);

    Task AddAsync(
        GameSession session,
        CancellationToken cancellationToken = default);

    Task SaveChangesAsync(
        CancellationToken cancellationToken = default);
}