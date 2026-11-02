using Microsoft.Extensions.DependencyInjection;
using TwentyFourGame.Application.Interfaces;
using TwentyFourGame.Application.Services;

namespace TwentyFourGame.Application.DependencyInjection;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(
        this IServiceCollection services)
    {
        services.AddScoped<IGameService, GameService>();

        return services;
    }
}