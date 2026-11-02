using System.ComponentModel.DataAnnotations;

namespace TwentyFourGame.Application.DTOs;

public sealed record RecordGotItRequest(
    [param: Required]
    [param: Range(0d, 604800d)]
    double? DurationSeconds
);
