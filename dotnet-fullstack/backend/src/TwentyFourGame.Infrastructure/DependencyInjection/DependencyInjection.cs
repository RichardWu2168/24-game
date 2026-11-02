using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using TwentyFourGame.Application.Interfaces;
using TwentyFourGame.Infrastructure.Persistence;

namespace TwentyFourGame.Infrastructure.DependencyInjection;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString =
            configuration.GetConnectionString("DefaultConnection")
            ?? throw new InvalidOperationException(
                "Connection string 'DefaultConnection' was not configured.");

        services.AddDbContext<GameDbContext>(options =>
            options.UseNpgsql(connectionString));

        services.AddScoped<IGameRepository, GameRepository>();
        services.AddScoped<IGameSessionRepository, GameSessionRepository>();

        return services;
    }
}