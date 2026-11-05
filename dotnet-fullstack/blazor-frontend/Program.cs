using TwentyFourGame.Blazor.Components;
using TwentyFourGame.Blazor.Services;

var builder = WebApplication.CreateBuilder(args);

// Add Razor components and Interactive Server support.
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

// Configure HTTP communication with the existing backend API.
builder.Services.AddHttpClient("BackendApi", client =>
{
    var baseUrl = builder.Configuration["BackendApi:BaseUrl"]
        ?? throw new InvalidOperationException(
            "BackendApi:BaseUrl is not configured.");

    client.BaseAddress = new Uri(baseUrl);
});

// Register frontend services.
builder.Services.AddScoped<GameApiClient>();
builder.Services.AddScoped<BrowserStorageService>();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
}

app.UseStatusCodePagesWithReExecute(
    "/not-found",
    createScopeForStatusCodePages: true);

app.UseAntiforgery();

app.MapStaticAssets();

app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

app.Run();