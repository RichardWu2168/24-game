using System.ComponentModel.DataAnnotations;

namespace TwentyFourGame.Application.Validation;

[AttributeUsage(AttributeTargets.Parameter | AttributeTargets.Property)]
public sealed class EachNumberInRangeAttribute : ValidationAttribute
{
    private readonly int _minimum;
    private readonly int _maximum;

    public EachNumberInRangeAttribute(int minimum, int maximum)
    {
        _minimum = minimum;
        _maximum = maximum;
    }

    protected override ValidationResult? IsValid(
        object? value,
        ValidationContext validationContext)
    {
        if (value is not int[] numbers)
        {
            return ValidationResult.Success;
        }

        if (numbers.Any(number =>
            number < _minimum || number > _maximum))
        {
            return new ValidationResult(
                $"Each number must be between {_minimum} and {_maximum}.");
        }

        return ValidationResult.Success;
    }
}