using System.Globalization;

namespace TwentyFourGame.Domain.Rules;

public static class GameRules
{
    private const int MaxExpressionLength = 256;
    private const int MaxNestingDepth = 32;

    public static AnswerResult CheckAnswer(
        string? expression,
        IReadOnlyList<int>? cards)
    {
        // Validate the four cards.
        if (cards == null ||
            cards.Count != 4 ||
            cards.Any(card => card < 1 || card > 10))
        {
            return new AnswerResult(
                false,
                "The game requires four valid cards from 1 to 10.");
        }

        if (expression is { Length: > MaxExpressionLength })
        {
            return new AnswerResult(
                false,
                "The expression is too long.");
        }

        List<Token> tokens;

        // Convert the expression into tokens.
        try
        {
            tokens = Tokenize(expression ?? string.Empty);
        }
        catch (InvalidOperationException ex)
        {
            return new AnswerResult(false, ex.Message);
        }

        // Extract all numbers used in the expression.
        var numbersUsed = tokens
            .Where(token => token.Type == TokenType.Number)
            .Select(token => token.NumberValue)
            .ToList();

        // Check that each card is used exactly once.
        var remainingCards = cards.ToList();

        foreach (var number in numbersUsed)
        {
            int index = remainingCards.IndexOf(number);

            if (index == -1)
            {
                return new AnswerResult(
                    false,
                    "Use each card number exactly once.");
            }

            remainingCards.RemoveAt(index);
        }

        if (remainingCards.Count != 0)
        {
            return new AnswerResult(
                false,
                "You must use all four card numbers.");
        }

        // Evaluate the expression.
        try
        {
            var parser = new ExpressionParser(tokens);
            int value = parser.Parse();

            if (value != 24)
            {
                return new AnswerResult(
                    false,
                    $"Your expression equals {value}, not 24.",
                    value);
            }

            return new AnswerResult(
                true,
                "Correct! You made 24!",
                value);
        }
        catch (InvalidOperationException ex)
        {
            return new AnswerResult(false, ex.Message);
        }
    }

    // --------------------------------------------------
    // Tokenization
    // --------------------------------------------------

    private static List<Token> Tokenize(string expression)
    {
        var tokens = new List<Token>();
        int position = 0;

        while (position < expression.Length)
        {
            char character = expression[position];

            if (char.IsWhiteSpace(character))
            {
                position++;
                continue;
            }

            // Read a number.
            if (character >= '0' && character <= '9')
            {
                int start = position;

                while (position < expression.Length &&
                       expression[position] >= '0' &&
                       expression[position] <= '9')
                {
                    position++;
                }

                string numberText =
                    expression[start..position];

                if (!int.TryParse(
                    numberText,
                    NumberStyles.None,
                    CultureInfo.InvariantCulture,
                    out int number))
                {
                    throw new InvalidOperationException(
                        "Use each card number exactly once.");
                }

                tokens.Add(new Token(TokenType.Number, number));
                continue;
            }

            // Read an operator.
            if (character is '+' or '-' or '*' or '/')
            {
                tokens.Add(
                    new Token(TokenType.Operator, Operator: character));

                position++;
                continue;
            }

            if (character == '(')
            {
                tokens.Add(new Token(TokenType.LeftParen));
                position++;
                continue;
            }

            if (character == ')')
            {
                tokens.Add(new Token(TokenType.RightParen));
                position++;
                continue;
            }

            throw new InvalidOperationException(
                $"Invalid character: {character}");
        }

        return tokens;
    }

    // --------------------------------------------------
    // Token definitions
    // --------------------------------------------------

    private enum TokenType
    {
        Number,
        Operator,
        LeftParen,
        RightParen
    }

    private sealed record Token(
        TokenType Type,
        int NumberValue = 0,
        char Operator = '\0');

    // --------------------------------------------------
    // Expression Parser
    // --------------------------------------------------

    private sealed class ExpressionParser
    {
        private readonly List<Token> _tokens;
        private int _position;
        private int _nestingDepth;

        public ExpressionParser(List<Token> tokens)
        {
            _tokens = tokens;
            _position = 0;
        }

        public int Parse()
        {
            if (_tokens.Count == 0)
            {
                throw new InvalidOperationException(
                    "Please enter an expression.");
            }

            int value = ParseExpression();

            if (_position != _tokens.Count)
            {
                throw new InvalidOperationException(
                    "The expression is not valid.");
            }

            return value;
        }

        // Addition and subtraction.
        private int ParseExpression()
        {
            int value = ParseTerm();

            while (MatchOperator('+') || MatchOperator('-'))
            {
                char operation = _tokens[_position - 1].Operator;

                int right = ParseTerm();

                value = ApplyOperation(value, operation, right);
            }

            return value;
        }

        // Multiplication and division.
        private int ParseTerm()
        {
            int value = ParseFactor();

            while (MatchOperator('*') || MatchOperator('/'))
            {
                char operation = _tokens[_position - 1].Operator;

                int right = ParseFactor();

                value = ApplyOperation(value, operation, right);
            }

            return value;
        }

        // Numbers and parentheses.
        private int ParseFactor()
        {
            if (_position >= _tokens.Count)
            {
                throw new InvalidOperationException(
                    "The expression is incomplete.");
            }

            Token token = _tokens[_position];

            if (token.Type == TokenType.Number)
            {
                _position++;
                return token.NumberValue;
            }

            if (token.Type == TokenType.LeftParen)
            {
                _nestingDepth++;

                if (_nestingDepth > MaxNestingDepth)
                {
                    throw new InvalidOperationException(
                        "The expression has too many nested parentheses.");
                }

                _position++;

                int value = ParseExpression();

                if (_position >= _tokens.Count ||
                    _tokens[_position].Type != TokenType.RightParen)
                {
                    throw new InvalidOperationException(
                        "A closing parenthesis is missing.");
                }

                _position++;
                _nestingDepth--;

                return value;
            }

            if (token.Type == TokenType.Operator &&
                token.Operator == '-')
            {
                throw new InvalidOperationException(
                    "Negative numbers are not allowed.");
            }

            throw new InvalidOperationException(
                "Invalid expression.");
        }

        // Apply an arithmetic operation.
        private int ApplyOperation(
            int left,
            char operation,
            int right)
        {
            if (operation == '/' && right == 0)
            {
                throw new InvalidOperationException(
                    "Division by zero is not allowed.");
            }

            int result;

            checked
            {
                switch (operation)
                {
                    case '+':
                        result = left + right;
                        break;

                    case '-':
                        result = left - right;
                        break;

                    case '*':
                        result = left * right;
                        break;

                    case '/':
                        if (left % right != 0)
                        {
                            throw new InvalidOperationException(
                                "Every intermediate result must be an integer.");
                        }

                        result = left / right;
                        break;

                    default:
                        throw new InvalidOperationException(
                            "Invalid expression.");
                }
            }

            if (result < 0)
            {
                throw new InvalidOperationException(
                    "Intermediate results cannot be negative.");
            }

            return result;
        }

        private bool MatchOperator(char operation)
        {
            if (_position < _tokens.Count &&
                _tokens[_position].Type == TokenType.Operator &&
                _tokens[_position].Operator == operation)
            {
                _position++;
                return true;
            }

            return false;
        }
    }
}