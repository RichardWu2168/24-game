namespace TwentyFourGame.Application.DTOs;

public sealed record GameSessionResponse(
    Guid Id,
    DateTime CreatedAt
);