namespace TwentyFourGame.Domain.Rules;

public static class GameSolver
{
    public static string? FindSolution(IReadOnlyList<int> numbers)
    {
        ValidateNumbers(numbers);

        var nodes = CreateInitialNodes(numbers);

        return Search(nodes, numbers);
    }

    public static IReadOnlyList<string> FindAllSolutions(
        IReadOnlyList<int> numbers)
    {
        ValidateNumbers(numbers);

        var nodes = CreateInitialNodes(numbers);

        // Canonical key -> first valid expression.
        var solutions = new Dictionary<string, string>(
            StringComparer.Ordinal);

        SearchAll(nodes, numbers, solutions);

        return solutions.Values
            .OrderBy(expression => expression, StringComparer.Ordinal)
            .ToArray();
    }

    private static void ValidateNumbers(
        IReadOnlyList<int> numbers)
    {
        if (numbers is null ||
            numbers.Count != 4 ||
            numbers.Any(number => number < 1 || number > 10))
        {
            throw new ArgumentException(
                "The game requires four numbers between 1 and 10.",
                nameof(numbers));
        }
    }

    private static List<ExpressionNode> CreateInitialNodes(
        IReadOnlyList<int> numbers)
    {
        return numbers
            .Select(number => new ExpressionNode(
                number,
                number.ToString(),
                new CanonicalNumber(number)))
            .ToList();
    }

    // Preserve the existing first-solution behavior.
    private static string? Search(
        List<ExpressionNode> nodes,
        IReadOnlyList<int> originalNumbers)
    {
        if (nodes.Count == 1)
        {
            if (nodes[0].Value != 24)
            {
                return null;
            }

            string expression = nodes[0].Expression;

            return GameRules.CheckAnswer(
                expression,
                originalNumbers).Valid
                    ? expression
                    : null;
        }

        for (int i = 0; i < nodes.Count; i++)
        {
            for (int j = i + 1; j < nodes.Count; j++)
            {
                ExpressionNode left = nodes[i];
                ExpressionNode right = nodes[j];

                var remaining = CreateRemainingNodes(nodes, i, j);

                foreach (ExpressionNode candidate in Combine(left, right))
                {
                    remaining.Add(candidate);

                    string? solution = Search(
                        remaining,
                        originalNumbers);

                    if (solution is not null)
                    {
                        return solution;
                    }

                    remaining.RemoveAt(remaining.Count - 1);
                }
            }
        }

        return null;
    }

    private static void SearchAll(
        List<ExpressionNode> nodes,
        IReadOnlyList<int> originalNumbers,
        Dictionary<string, string> solutions)
    {
        if (nodes.Count == 1)
        {
            ExpressionNode node = nodes[0];

            if (node.Value != 24)
            {
                return;
            }

            if (!GameRules.CheckAnswer(
                node.Expression,
                originalNumbers).Valid)
            {
                return;
            }

            string key = Canonicalize(node.Canonical);

            solutions.TryAdd(key, node.Expression);

            return;
        }

        for (int i = 0; i < nodes.Count; i++)
        {
            for (int j = i + 1; j < nodes.Count; j++)
            {
                ExpressionNode left = nodes[i];
                ExpressionNode right = nodes[j];

                var remaining = CreateRemainingNodes(nodes, i, j);

                foreach (ExpressionNode candidate in Combine(left, right))
                {
                    remaining.Add(candidate);

                    SearchAll(
                        remaining,
                        originalNumbers,
                        solutions);

                    remaining.RemoveAt(remaining.Count - 1);
                }
            }
        }
    }

    private static List<ExpressionNode> CreateRemainingNodes(
        List<ExpressionNode> nodes,
        int firstIndex,
        int secondIndex)
    {
        var remaining = new List<ExpressionNode>();

        for (int k = 0; k < nodes.Count; k++)
        {
            if (k != firstIndex && k != secondIndex)
            {
                remaining.Add(nodes[k]);
            }
        }

        return remaining;
    }

    private static IEnumerable<ExpressionNode> Combine(
        ExpressionNode left,
        ExpressionNode right)
    {
        int a = left.Value;
        int b = right.Value;

        yield return Create(left, '+', right, a + b);

        yield return Create(left, '*', right, a * b);

        if (a >= b)
        {
            yield return Create(left, '-', right, a - b);
        }

        if (b >= a)
        {
            yield return Create(right, '-', left, b - a);
        }

        if (b != 0 && a % b == 0)
        {
            yield return Create(left, '/', right, a / b);
        }

        if (a != 0 && b % a == 0)
        {
            yield return Create(right, '/', left, b / a);
        }
    }

    private static ExpressionNode Create(
        ExpressionNode left,
        char operation,
        ExpressionNode right,
        int value)
    {
        return new ExpressionNode(
            value,
            $"({left.Expression} {operation} {right.Expression})",
            new CanonicalOperation(
                operation,
                left.Canonical,
                right.Canonical));
    }

    // --------------------------------------------------
    // Canonicalization
    // --------------------------------------------------

    private static string Canonicalize(CanonicalNode node)
    {
        return node switch
        {
            CanonicalNumber number =>
                number.Value.ToString(
                    System.Globalization.CultureInfo.InvariantCulture),

            CanonicalOperation operation
                when operation.Operator is '+' or '-' =>
                    CanonicalizeAddition(operation),

            CanonicalOperation operation
                when operation.Operator is '*' or '/' =>
                    CanonicalizeMultiplication(operation),

            _ => throw new InvalidOperationException(
                "Unsupported canonical expression.")
        };
    }

    private static string CanonicalizeAddition(
        CanonicalOperation operation)
    {
        var terms = new List<string>();

        CollectAdditiveTerms(operation, 1, terms);

        terms.Sort(StringComparer.Ordinal);

        return $"add[{string.Join(",", terms)}]";
    }

    private static void CollectAdditiveTerms(
        CanonicalNode node,
        int sign,
        List<string> terms)
    {
        if (node is CanonicalOperation operation)
        {
            if (operation.Operator == '+')
            {
                CollectAdditiveTerms(operation.Left, sign, terms);
                CollectAdditiveTerms(operation.Right, sign, terms);
                return;
            }

            if (operation.Operator == '-')
            {
                CollectAdditiveTerms(operation.Left, sign, terms);
                CollectAdditiveTerms(operation.Right, -sign, terms);
                return;
            }
        }

        string term = Canonicalize(node);

        terms.Add($"{(sign == 1 ? "+" : "-")}{term}");
    }

    private static string CanonicalizeMultiplication(
        CanonicalOperation operation)
    {
        var factors = new List<string>();

        CollectMultiplicativeFactors(operation, 1, factors);

        factors.Sort(StringComparer.Ordinal);

        if (factors.Count == 0)
        {
            return "1";
        }

        return $"mul[{string.Join(",", factors)}]";
    }

    private static void CollectMultiplicativeFactors(
        CanonicalNode node,
        int sign,
        List<string> factors)
    {
        if (node is CanonicalOperation operation)
        {
            if (operation.Operator == '*')
            {
                CollectMultiplicativeFactors(
                    operation.Left, sign, factors);

                CollectMultiplicativeFactors(
                    operation.Right, sign, factors);

                return;
            }

            if (operation.Operator == '/')
            {
                CollectMultiplicativeFactors(
                    operation.Left, sign, factors);

                CollectMultiplicativeFactors(
                    operation.Right, -sign, factors);

                return;
            }
        }

        string factor = Canonicalize(node);

        // Multiplication or division by 1 does not
        // change the mathematical value.
        if (factor == "1")
        {
            return;
        }

        factors.Add($"{(sign == 1 ? "*" : "/")}{factor}");
    }

    private sealed record ExpressionNode(
        int Value,
        string Expression,
        CanonicalNode Canonical);

    private abstract record CanonicalNode;

    private sealed record CanonicalNumber(int Value)
        : CanonicalNode;

    private sealed record CanonicalOperation(
        char Operator,
        CanonicalNode Left,
        CanonicalNode Right)
        : CanonicalNode;
}