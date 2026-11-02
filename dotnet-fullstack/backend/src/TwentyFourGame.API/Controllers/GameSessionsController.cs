using Microsoft.AspNetCore.Mvc;
using TwentyFourGame.Application.DTOs;
using TwentyFourGame.Application.Interfaces;

namespace TwentyFourGame.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class GameSessionsController : ControllerBase
{
    private readonly IGameService _gameService;

    public GameSessionsController(IGameService gameService)
    {
        _gameService = gameService;
    }

    [HttpPost]
    public async Task<ActionResult<GameSessionResponse>> CreateSession(
        CancellationToken cancellationToken)
    {
        var session = await _gameService.CreateSessionAsync(cancellationToken);

        return StatusCode(StatusCodes.Status201Created, session);
    }

    [HttpGet("{sessionId:guid}/history")]
    public async Task<ActionResult<GameHistoryResponse>> GetSessionHistory(
        Guid sessionId,
        [FromQuery] Guid? cursor = null,
        [FromQuery] int pageSize = 10,
        CancellationToken cancellationToken = default)
    {
        var history = await _gameService.GetSessionHistoryPageAsync(
            sessionId,
            cursor,
            pageSize,
            cancellationToken);

        if (history is null)
        {
            return NotFound();
        }

        return Ok(history);
    }

    [HttpGet("{sessionId:guid}/stats")]
    public async Task<ActionResult<GameStatsResponse>> GetStats(
        Guid sessionId,
        CancellationToken cancellationToken = default)
    {
        var stats = await _gameService.GetStatsAsync(
            sessionId,
            cancellationToken);

        if (stats is null)
        {
            return NotFound();
        }

        return Ok(stats);
    }

    [HttpDelete("{sessionId:guid}/history")]
    public async Task<ActionResult> ClearHistory(
        Guid sessionId,
        CancellationToken cancellationToken = default)
    {
        var deletedCount = await _gameService.ClearHistoryAsync(
            sessionId,
            cancellationToken);

        if (deletedCount is null)
        {
            return NotFound();
        }

        return Ok(new { deletedCount });
    }
}