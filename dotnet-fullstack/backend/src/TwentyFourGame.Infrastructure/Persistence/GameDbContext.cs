using Microsoft.EntityFrameworkCore;
using TwentyFourGame.Domain.Entities;

namespace TwentyFourGame.Infrastructure.Persistence;

public class GameDbContext : DbContext
{
    public GameDbContext(DbContextOptions<GameDbContext> options)
        : base(options)
    {
    }

    public DbSet<GameSession> GameSessions => Set<GameSession>();

    public DbSet<Game> Games => Set<Game>();

    public DbSet<GameAttempt> GameAttempts => Set<GameAttempt>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // GameSession entity
        modelBuilder.Entity<GameSession>(entity =>
        {
            entity.ToTable("game_sessions");

            entity.HasKey(session => session.Id);

            entity.Property(session => session.Id)
                .HasColumnName("id")
                .HasColumnType("uuid");

            entity.Property(session => session.CreatedAt)
                .HasColumnName("created_at")
                .HasColumnType("timestamp with time zone")
                .IsRequired();
        });

        // Game entity
        modelBuilder.Entity<Game>(entity =>
        {
            entity.ToTable("games");

            entity.HasKey(game => game.Id);

            entity.Property(game => game.Id)
                .HasColumnName("id")
                .HasColumnType("uuid");

            entity.Property(game => game.SessionId)
                .HasColumnName("session_id")
                .HasColumnType("uuid")
                .IsRequired();

            entity.Property(game => game.Numbers)
                .HasColumnName("numbers")
                .HasColumnType("integer[]")
                .IsRequired();

            entity.Property(game => game.Status)
                .HasColumnName("status")
                .HasConversion<string>()
                .HasMaxLength(20)
                .IsRequired();

            entity.Property(game => game.CreatedAt)
                .HasColumnName("created_at")
                .HasColumnType("timestamp with time zone")
                .IsRequired();

            entity.Property(game => game.CompletedAt)
                .HasColumnName("completed_at")
                .HasColumnType("timestamp with time zone");

            entity.Property(game => game.GotItAt)
                .HasColumnName("got_it_at")
                .HasColumnType("timestamp with time zone");

            entity.Property(game => game.DurationSeconds)
                .HasColumnName("duration_seconds")
                .HasColumnType("double precision");

            entity.Property(game => game.CapturedDurationSeconds)
                .HasColumnName("captured_duration_seconds")
                .HasColumnType("double precision");

            // One session can have many games.
            entity.HasOne(game => game.Session)
                .WithMany(session => session.Games)
                .HasForeignKey(game => game.SessionId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(game => new
            {
                game.SessionId,
                game.CreatedAt,
                game.Id
            });

            entity.HasIndex(game => new
            {
                game.SessionId,
                game.Status
            });
        });

        // GameAttempt entity
        modelBuilder.Entity<GameAttempt>(entity =>
        {
            entity.ToTable("game_attempts");

            entity.HasKey(attempt => attempt.Id);

            entity.Property(attempt => attempt.Id)
                .HasColumnName("id")
                .HasColumnType("uuid")
                .ValueGeneratedNever();

            entity.Property(attempt => attempt.GameId)
                .HasColumnName("game_id")
                .HasColumnType("uuid")
                .IsRequired();

            entity.Property(attempt => attempt.Expression)
                .HasColumnName("expression")
                .HasColumnType("text")
                .IsRequired();

            entity.Property(attempt => attempt.IsCorrect)
                .HasColumnName("is_correct")
                .HasColumnType("boolean")
                .IsRequired();

            entity.Property(attempt => attempt.CreatedAt)
                .HasColumnName("created_at")
                .HasColumnType("timestamp with time zone")
                .IsRequired();

            // One game can have many answer attempts.
            entity.HasOne(attempt => attempt.Game)
                .WithMany(game => game.Attempts)
                .HasForeignKey(attempt => attempt.GameId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasIndex(attempt => new
            {
                attempt.GameId,
                attempt.CreatedAt
            });
        });
    }
}