using System.Net.Http.Json;
using TwentyFourGame.Blazor.Models.Api;

namespace TwentyFourGame.Blazor.Services;

public sealed class GameApiClient
{
    private readonly HttpClient _httpClient;

    public GameApiClient(IHttpClientFactory httpClientFactory)
    {
        _httpClient = httpClientFactory.CreateClient("BackendApi");
    }

    public async Task<SessionResponse> CreateSessionAsync()
    {
        using HttpResponseMessage response =
            await _httpClient.PostAsync("api/gamesessions", null);

        response.EnsureSuccessStatusCode();

        SessionResponse? session =
            await response.Content.ReadFromJsonAsync<SessionResponse>();

        return session ?? throw new InvalidOperationException(
            "The backend returned an empty session response.");
    }

    public async Task<PuzzleResponse> CreatePuzzleAsync(Guid sessionId)
    {
        string endpoint = $"api/gamesessions/{sessionId}/puzzle";

        using HttpResponseMessage response =
            await _httpClient.PostAsync(endpoint, null);

        response.EnsureSuccessStatusCode();

        PuzzleResponse? puzzle =
            await response.Content.ReadFromJsonAsync<PuzzleResponse>();

        return puzzle ?? throw new InvalidOperationException(
            "The backend returned an empty puzzle response.");
    }

    public async Task<PuzzleResponse> RecordGotItAsync(
        Guid sessionId,
        Guid gameId,
        double durationSeconds)
    {
        string endpoint =
            $"api/gamesessions/{sessionId}/games/{gameId}/got-it";

        GotItRequest request = new(durationSeconds);

        using HttpResponseMessage response =
            await _httpClient.PostAsJsonAsync(endpoint, request);

        response.EnsureSuccessStatusCode();

        PuzzleResponse? puzzle =
            await response.Content.ReadFromJsonAsync<PuzzleResponse>();

        return puzzle ?? throw new InvalidOperationException(
            "The backend returned an empty Got It response.");
    }

    public async Task<SubmitAnswerResponse> SubmitAnswerAsync(
        Guid sessionId,
        Guid gameId,
        SubmitAnswerRequest request)
    {
        string endpoint =
            $"api/gamesessions/{sessionId}/games/{gameId}/answers";

        using HttpResponseMessage response =
            await _httpClient.PostAsJsonAsync(endpoint, request);

        response.EnsureSuccessStatusCode();

        SubmitAnswerResponse? result =
            await response.Content
                .ReadFromJsonAsync<SubmitAnswerResponse>();

        if (result is null)
        {
            throw new InvalidOperationException(
                "The backend returned an empty answer response.");
        }

        if (result.Game is null)
        {
            throw new InvalidOperationException(
                "The backend answer response did not contain a game.");
        }

        return result;
    }

    public async Task<PuzzleResponse?> GetPuzzleAsync(Guid sessionId)
    {
        string endpoint = $"api/gamesessions/{sessionId}/puzzle";

        using HttpResponseMessage response =
            await _httpClient.GetAsync(endpoint);

        if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }

        response.EnsureSuccessStatusCode();

        return await response.Content
            .ReadFromJsonAsync<PuzzleResponse>();
    }

    public async Task<bool> SessionExistsAsync(Guid sessionId)
    {
        string endpoint =
            $"api/gamesessions/{sessionId}/stats";

        using HttpResponseMessage response =
            await _httpClient.GetAsync(endpoint);

        if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return false;
        }

        response.EnsureSuccessStatusCode();

        return true;
    }

}