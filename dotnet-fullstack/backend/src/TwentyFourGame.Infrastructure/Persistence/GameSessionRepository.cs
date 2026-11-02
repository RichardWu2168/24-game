using Microsoft.EntityFrameworkCore;
using TwentyFourGame.Application.Interfaces;
using TwentyFourGame.Domain.Entities;

namespace TwentyFourGame.Infrastructure.Persistence;

public sealed class GameSessionRepository : IGameSessionRepository
{
    private readonly GameDbContext _context;

    public GameSessionRepository(GameDbContext context)
    {
        _context = context;
    }

    public async Task<GameSession?> GetByIdAsync(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        return await _context.GameSessions
            .FirstOrDefaultAsync(
                session => session.Id == id,
                cancellationToken);
    }

    public async Task AddAsync(
        GameSession session,
        CancellationToken cancellationToken = default)
    {
        await _context.GameSessions.AddAsync(
            session, cancellationToken);
    }

    public async Task SaveChangesAsync(
        CancellationToken cancellationToken = default)
    {
        await _context.SaveChangesAsync(cancellationToken);
    }
}