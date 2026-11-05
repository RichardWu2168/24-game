namespace TwentyFourGame.Blazor.Models;

public enum ExpressionTokenType
{
    Number,
    Operator,
    OpenParenthesis,
    CloseParenthesis
}

public sealed record ExpressionToken(
    ExpressionTokenType Type,
    string Text,
    int? CardIndex = null
);