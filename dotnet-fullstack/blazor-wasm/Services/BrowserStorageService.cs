using Microsoft.JSInterop;

namespace TwentyFourGame.Blazor.Services;

public sealed class BrowserStorageService : IAsyncDisposable
{
    private const string SessionIdKey = "twentyfourgame.sessionId";
    private const string InputModeKey = "twentyfourgame.inputMode";

    private readonly IJSRuntime _jsRuntime;

    private IJSObjectReference? _module;

    public BrowserStorageService(IJSRuntime jsRuntime)
    {
        _jsRuntime = jsRuntime;
    }

    private async Task<IJSObjectReference> GetModuleAsync()
    {
        if (_module is null)
        {
            _module = await _jsRuntime.InvokeAsync<IJSObjectReference>(
                "import",
                "./js/browserStorage.js");
        }

        return _module;
    }

    public async Task<Guid?> GetSessionIdAsync()
    {
        IJSObjectReference module = await GetModuleAsync();

        string? value = await module.InvokeAsync<string?>(
            "getItem",
            SessionIdKey);

        return Guid.TryParse(value, out Guid sessionId)
            && sessionId != Guid.Empty
                ? sessionId
                : null;
    }

    public async Task SaveSessionIdAsync(Guid sessionId)
    {
        IJSObjectReference module = await GetModuleAsync();

        await module.InvokeVoidAsync(
            "setItem",
            SessionIdKey,
            sessionId.ToString());
    }

    public async Task RemoveSessionIdAsync()
    {
        IJSObjectReference module = await GetModuleAsync();

        await module.InvokeVoidAsync(
            "removeItem",
            SessionIdKey);
    }

    public async Task<string?> GetInputModeAsync()
    {
        IJSObjectReference module = await GetModuleAsync();

        return await module.InvokeAsync<string?>(
            "getItem",
            InputModeKey);
    }

    public async Task SaveInputModeAsync(string mode)
    {
        IJSObjectReference module = await GetModuleAsync();

        await module.InvokeVoidAsync(
            "setItem",
            InputModeKey,
            mode);
    }

    public async ValueTask DisposeAsync()
    {
        if (_module is null)
        {
            return;
        }

        try
        {
            await _module.DisposeAsync();
        }
        catch (JSDisconnectedException)
        {
            // The browser connection has already closed.
        }
    }
}