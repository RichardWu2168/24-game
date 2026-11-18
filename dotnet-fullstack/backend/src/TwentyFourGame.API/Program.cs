using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using TwentyFourGame.API.Exceptions;
using TwentyFourGame.Application.DependencyInjection;
using TwentyFourGame.Infrastructure.DependencyInjection;
using TwentyFourGame.Infrastructure.Persistence;
using TwentyFourGame.API.HealthChecks;

var builder = WebApplication.CreateBuilder(args);

const string BlazorWasmCorsPolicy = "BlazorWasm";

string[] allowedCorsOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ?? [];

builder.Services.AddCors(options =>
{
    options.AddPolicy(BlazorWasmCorsPolicy, policy =>
    {
        policy
            .WithOrigins(allowedCorsOrigins)
            .WithMethods("GET", "POST")
            .AllowAnyHeader();
    });
});

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddOpenApi();

// Register application and infrastructure services.
builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services
    .AddHealthChecks()
    .AddCheck<PostgresHealthCheck>(
        "postgresql",
        tags: new[] { "database" });

var app = builder.Build();
app.UseExceptionHandler();

app.MapHealthChecks("/health", new HealthCheckOptions
{
    Predicate = check => !check.Tags.Contains("database")
});

app.MapHealthChecks("/health/db", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("database")
});
// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.UseRouting();
app.UseCors(BlazorWasmCorsPolicy);

app.UseAuthorization();

app.MapControllers();

app.Run();

public partial class Program { }