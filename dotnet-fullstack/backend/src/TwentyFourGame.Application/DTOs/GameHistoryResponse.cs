namespace TwentyFourGame.Application.DTOs;

public sealed record GameHistoryResponse(
    IReadOnlyList<GameResponse> Games,
    bool HasMore,
    Guid? NextCursor
);