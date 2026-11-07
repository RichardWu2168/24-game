using Microsoft.AspNetCore.Mvc;
using TwentyFourGame.Application.DTOs;
using TwentyFourGame.Application.Interfaces;

namespace TwentyFourGame.API.Controllers;

[ApiController]
[Route("api/gamesessions/{sessionId:guid}")]
public class GamesController : ControllerBase
{
    private readonly IGameService _gameService;

    public GamesController(IGameService gameService)
    {
        _gameService = gameService;
    }

    [HttpGet("puzzle")]
    public async Task<ActionResult<PuzzleResponse>> GetPuzzle(
        Guid sessionId,
        CancellationToken cancellationToken = default)
    {
        var puzzle = await _gameService.GetPuzzleAsync(
            sessionId,
            cancellationToken);

        if (puzzle is null)
        {
            return NotFound();
        }

        return Ok(puzzle);
    }

    [HttpPost("puzzle")]
    public async Task<ActionResult<PuzzleResponse>> CreatePuzzle(
        Guid sessionId,
        CancellationToken cancellationToken = default)
    {
        var puzzle = await _gameService.CreatePuzzleAsync(
            sessionId,
            cancellationToken);

        if (puzzle is null)
        {
            return NotFound();
        }

        return Ok(puzzle);
    }

    [HttpGet("games/{gameId:guid}")]
    public async Task<ActionResult<GameResponse>> GetGameById(
        Guid sessionId,
        Guid gameId,
        CancellationToken cancellationToken)
    {
        var game = await _gameService.GetGameByIdAsync(
            sessionId,
            gameId,
            cancellationToken);

        if (game is null)
        {
            return NotFound();
        }

        return Ok(game);
    }

    [HttpPost("games/{gameId:guid}/got-it")]
    public async Task<ActionResult<PuzzleResponse>> RecordGotIt(
        Guid sessionId,
        Guid gameId,
        [FromBody] RecordGotItRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _gameService.RecordGotItAsync(
            sessionId,
            gameId,
            request,
            cancellationToken);

        if (result is null)
        {
            return NotFound();
        }

        return Ok(result);
    }

    [HttpPost("games/{gameId:guid}/answers")]
    public async Task<ActionResult<AnswerSubmissionResponse>> SubmitAnswer(
        Guid sessionId,
        Guid gameId,
        [FromBody] SubmitAnswerRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _gameService.SubmitAnswerAsync(
            sessionId,
            gameId,
            request,
            cancellationToken);

        if (result is null)
        {
            return NotFound();
        }

        return Ok(result);
    }

    [HttpPost("games/{gameId:guid}/reveal-solution")]
    public async Task<ActionResult<RevealSolutionResponse>> RevealSolution(
        Guid sessionId,
        Guid gameId,
        CancellationToken cancellationToken)
    {
        var result = await _gameService.RevealSolutionAsync(
            sessionId,
            gameId,
            cancellationToken);

        if (result is null)
        {
            return NotFound();
        }

        return Ok(result);
    }
}