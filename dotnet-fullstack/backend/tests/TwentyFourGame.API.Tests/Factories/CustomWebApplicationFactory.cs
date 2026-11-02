
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Npgsql;
using TwentyFourGame.Infrastructure.Persistence;

namespace TwentyFourGame.API.Tests.Factories;

public sealed class CustomWebApplicationFactory
    : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(
        IWebHostBuilder builder)
    {

        builder.ConfigureLogging(logging =>
        {
            logging.AddFilter(
                "Microsoft.Hosting.Lifetime",
                LogLevel.Warning);

            logging.AddFilter(
                "Microsoft.EntityFrameworkCore",
                LogLevel.Warning);

            logging.AddFilter(
                "Microsoft.AspNetCore.HttpsPolicy",
                LogLevel.Error);
        });

        builder.ConfigureServices((context, services) =>
        {
            // Read the existing connection string.
            var connectionString =
                context.Configuration.GetConnectionString(
                    "DefaultConnection")
                ?? throw new InvalidOperationException(
                    "DefaultConnection was not configured.");

            // Change only the database name.
            var testConnectionString =
                new NpgsqlConnectionStringBuilder(connectionString)
                {
                    Database = "twentyfourgame_dotnet_test"
                }.ConnectionString;

            // Replace the application's DbContext registration.
            services.RemoveAll<DbContextOptions<GameDbContext>>();
            services.RemoveAll<GameDbContext>();

            services.AddDbContext<GameDbContext>(options =>
                options.UseNpgsql(testConnectionString));
        });
    }
}
