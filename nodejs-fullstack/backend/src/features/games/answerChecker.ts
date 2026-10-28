
export interface AnswerResult {
    valid: boolean;
    message: string;
    value?: number;
}

type Token =
    | { type: "number"; value: number }
    | { type: "operator"; value: "+" | "-" | "*" | "/" }
    | { type: "leftParen" }
    | { type: "rightParen" };

function tokenize(expression: string): Token[] {
    const tokens: Token[] = [];
    let position = 0;

    while (position < expression.length) {
        const char = expression[position];

        if (/\s/.test(char)) {
            position++;
            continue;
        }

        if (/[0-9]/.test(char)) {
            let numberText = "";

            while (
                position < expression.length &&
                /[0-9]/.test(expression[position])
            ) {
                numberText += expression[position];
                position++;
            }

            tokens.push({
                type: "number",
                value: Number(numberText),
            });
            continue;
        }

        if (["+", "-", "*", "/"].includes(char)) {
            tokens.push({
                type: "operator",
                value: char as "+" | "-" | "*" | "/",
            });
            position++;
            continue;
        }

        if (char === "(") {
            tokens.push({ type: "leftParen" });
            position++;
            continue;
        }

        if (char === ")") {
            tokens.push({ type: "rightParen" });
            position++;
            continue;
        }

        throw new Error(`Invalid character: ${char}`);
    }

    return tokens;
}

class ExpressionParser {
    private position = 0;

    constructor(private readonly tokens: Token[]) {}

    parse(): number {
        if (this.tokens.length === 0) {
            throw new Error("Please enter an expression.");
        }

        const value = this.parseExpression();

        if (this.position !== this.tokens.length) {
            throw new Error("The expression is not valid.");
        }

        return value;
    }

    private applyOperation(
        left: number,
        operator: "+" | "-" | "*" | "/",
        right: number,
    ): number {
        if (operator === "/" && right === 0) {
            throw new Error("Division by zero is not allowed.");
        }

        let result: number;

        switch (operator) {
            case "+":
                result = left + right;
                break;
            case "-":
                result = left - right;
                break;
            case "*":
                result = left * right;
                break;
            case "/":
                result = left / right;
                break;
        }

        if (!Number.isFinite(result)) {
            throw new Error("The result must be a finite number.");
        }

        if (!Number.isInteger(result)) {
            throw new Error(
                "Every intermediate result must be an integer.",
            );
        }

        if (result < 0) {
            throw new Error(
                "Intermediate results cannot be negative.",
            );
        }

        return result;
    }

    private parseExpression(): number {
        let value = this.parseTerm();

        while (this.matchOperator("+") || this.matchOperator("-")) {
            const token = this.tokens[this.position - 1];

            if (token.type !== "operator") {
                throw new Error("Invalid expression.");
            }

            const right = this.parseTerm();
            value = this.applyOperation(value, token.value, right);
        }

        return value;
    }

    private parseTerm(): number {
        let value = this.parseFactor();

        while (this.matchOperator("*") || this.matchOperator("/")) {
            const token = this.tokens[this.position - 1];

            if (token.type !== "operator") {
                throw new Error("Invalid expression.");
            }

            const right = this.parseFactor();
            value = this.applyOperation(value, token.value, right);
        }

        return value;
    }

    private parseFactor(): number {
        const token = this.tokens[this.position];

        if (!token) {
            throw new Error("The expression is incomplete.");
        }

        if (token.type === "number") {
            this.position++;
            return token.value;
        }

        if (token.type === "leftParen") {
            this.position++;

            const value = this.parseExpression();

            if (this.tokens[this.position]?.type !== "rightParen") {
                throw new Error("A closing parenthesis is missing.");
            }

            this.position++;
            return value;
        }
        
        if (token.type === "operator" && token.value === "-") {
            throw new Error("Negative numbers are not allowed.");
        }

        throw new Error("Invalid expression.");
    }

    private matchOperator(
        operator: "+" | "-" | "*" | "/",
    ): boolean {
        const token = this.tokens[this.position];

        if (token?.type === "operator" && token.value === operator) {
            this.position++;
            return true;
        }

        return false;
    }
}

export function checkAnswer(
    expression: string,
    cards: number[],
): AnswerResult {
    if (
        cards.length !== 4 ||
        cards.some(
            (card) =>
                !Number.isInteger(card) || card < 1 || card > 10,
        )
    ) {
        return {
            valid: false,
            message: "The game requires four valid cards from 1 to 10.",
        };
    }

    let tokens: Token[];

    try {
        tokens = tokenize(expression);
    } catch (error) {
        return {
            valid: false,
            message:
                error instanceof Error
                    ? error.message
                    : "Invalid expression.",
        };
    }

    const numbersUsed = tokens
        .filter(
            (token): token is Extract<Token, { type: "number" }> =>
                token.type === "number",
        )
        .map((token) => token.value);

    const remainingCards = [...cards];

    for (const number of numbersUsed) {
        const index = remainingCards.indexOf(number);

        if (index === -1) {
            return {
                valid: false,
                message: "Use each card number exactly once.",
            };
        }

        remainingCards.splice(index, 1);
    }

    if (remainingCards.length !== 0) {
        return {
            valid: false,
            message: "You must use all four card numbers.",
        };
    }

    try {
        const parser = new ExpressionParser(tokens);
        const value = parser.parse();

        if (value !== 24) {
            return {
                valid: false,
                message: `Your expression equals ${value}, not 24.`,
                value,
            };
        }

        return {
            valid: true,
            message: "Correct! You made 24!",
            value,
        };
    } catch (error) {
        return {
            valid: false,
            message:
                error instanceof Error
                    ? error.message
                    : "Invalid expression.",
        };
    }
}
