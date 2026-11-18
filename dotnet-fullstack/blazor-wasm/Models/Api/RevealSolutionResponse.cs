using TwentyFourGame.Blazor.Models;

namespace TwentyFourGame.Blazor.Models.Api;

public sealed class RevealSolutionResponse
{
    public Guid GameId { get; set; }

    public GameStatus Status { get; set; }

    public bool Solvable { get; set; }

    public List<string> Expressions { get; set; } = [];
}