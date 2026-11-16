using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using TwentyFourGame.Infrastructure.Persistence;

namespace TwentyFourGame.API.HealthChecks;

public sealed class PostgresHealthCheck : IHealthCheck
{
    private readonly GameDbContext _db;

    public PostgresHealthCheck(GameDbContext db)
    {
        _db = db;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            bool canConnect = await _db.Database.CanConnectAsync(cancellationToken);

            return canConnect
                ? HealthCheckResult.Healthy("PostgreSQL connection successful.")
                : HealthCheckResult.Unhealthy("PostgreSQL connection failed.");
        }
        catch (Exception)
        {
            return HealthCheckResult.Unhealthy("PostgreSQL connection failed.");
        }
    }
}