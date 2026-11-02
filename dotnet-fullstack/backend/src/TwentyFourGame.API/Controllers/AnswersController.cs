using Microsoft.AspNetCore.Mvc;
using TwentyFourGame.Application.DTOs;
using TwentyFourGame.Application.Interfaces;

namespace TwentyFourGame.API.Controllers;

[ApiController]
[Route("api/answers")]
public class AnswersController : ControllerBase
{
    private readonly IGameService _gameService;

    public AnswersController(IGameService gameService)
    {
        _gameService = gameService;
    }

    [HttpPost("check")]
    public async Task<ActionResult<AnswerCheckResponse>> CheckAnswer(
        [FromBody] CheckAnswerRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _gameService.CheckAnswerAsync(
            request,
            cancellationToken);

        return Ok(result);
    }
}