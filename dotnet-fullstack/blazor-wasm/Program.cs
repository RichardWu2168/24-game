using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using TwentyFourGame.Blazor;
using TwentyFourGame.Blazor.Services;

var builder = WebAssemblyHostBuilder.CreateDefault(args);

builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

// Keep the template's same-origin client for local static resources.
builder.Services.AddScoped(sp => new HttpClient
{
    BaseAddress = new Uri(builder.HostEnvironment.BaseAddress)
});

// Configure the named client used by GameApiClient.
builder.Services.AddHttpClient("BackendApi", client =>
{
    var baseUrl = builder.Configuration["BackendApi:BaseUrl"]
        ?? throw new InvalidOperationException(
            "BackendApi:BaseUrl is not configured.");

    client.BaseAddress = new Uri(baseUrl);
});

builder.Services.AddScoped<GameApiClient>();
builder.Services.AddScoped<BrowserStorageService>();

await builder.Build().RunAsync();