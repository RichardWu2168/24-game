using System.ComponentModel.DataAnnotations;
using TwentyFourGame.Application.Validation;

public sealed record SubmitAnswerRequest(
    [Required]
    [MinLength(1)]
    string Expression,

    [Required]
    [MinLength(4)]
    [MaxLength(4)]
    [EachNumberInRange(1, 10)]
    int[] Numbers,

    [Range(0, double.MaxValue, ErrorMessage = "Duration cannot be negative.")]
    double? DurationSeconds
);