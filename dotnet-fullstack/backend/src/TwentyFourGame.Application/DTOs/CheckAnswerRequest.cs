using System.ComponentModel.DataAnnotations;
using TwentyFourGame.Application.Validation;

namespace TwentyFourGame.Application.DTOs;

public sealed record CheckAnswerRequest(
    [Required]
    string Expression,

    [Required]
    [MinLength(4)]
    [MaxLength(4)]
    [EachNumberInRange(1, 10)]
    int[] Numbers
);