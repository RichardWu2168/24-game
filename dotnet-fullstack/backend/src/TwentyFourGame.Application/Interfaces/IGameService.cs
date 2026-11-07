using TwentyFourGame.Application.DTOs;

namespace TwentyFourGame.Application.Interfaces;

public interface IGameService
{
    // Session operations
    Task<GameSessionResponse> CreateSessionAsync(
        CancellationToken cancellationToken = default);

    Task<GameResponse?> GetGameByIdAsync(
        Guid sessionId,
        Guid gameId,
        CancellationToken cancellationToken = default);

    Task<AnswerSubmissionResponse?> SubmitAnswerAsync(
        Guid sessionId,
        Guid gameId,
        SubmitAnswerRequest request,
        CancellationToken cancellationToken = default);

    Task<PuzzleResponse?> GetPuzzleAsync(
        Guid sessionId,
        CancellationToken cancellationToken = default);

    Task<PuzzleResponse?> CreatePuzzleAsync(
        Guid sessionId,
        CancellationToken cancellationToken = default);

    Task<PuzzleResponse?> RecordGotItAsync(
        Guid sessionId,
        Guid gameId,
        RecordGotItRequest request,
        CancellationToken cancellationToken = default);

    Task<GameHistoryResponse?> GetSessionHistoryPageAsync(
        Guid sessionId,
        Guid? cursor = null,
        int pageSize = 10,
        CancellationToken cancellationToken = default);

    Task<GameStatsResponse?> GetStatsAsync(
        Guid sessionId,
        CancellationToken cancellationToken = default);

    Task<int?> ClearHistoryAsync(
        Guid sessionId,
        CancellationToken cancellationToken = default);

    Task<AnswerCheckResponse> CheckAnswerAsync(
        CheckAnswerRequest request,
        CancellationToken cancellationToken = default);

    Task<RevealSolutionResponse?> RevealSolutionAsync(
        Guid sessionId,
        Guid gameId,
        CancellationToken cancellationToken = default);
}