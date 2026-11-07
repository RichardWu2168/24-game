using TwentyFourGame.Domain.Enums;

namespace TwentyFourGame.Application.DTOs;

public sealed record RevealSolutionResponse(
    Guid GameId,
    GameStatus Status,
    bool Solvable,
    IReadOnlyList<string> Expressions
);