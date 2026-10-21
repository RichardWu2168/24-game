
import express from "express";
import { generatePuzzle } from "./game.js";
import { checkAnswer } from "./answerChecker.js";

const app = express();

app.use(express.json());

app.get("/api/health", (_req, res) => {
    res.json({
        status: "OK",
        message: "24 Game backend is running!"
    });
});

app.get("/api/puzzle", (_req, res) => {
    const numbers = generatePuzzle();
    res.json({ numbers });
});

app.post("/api/check-answer", (req, res) => {
    const { numbers, expression } = req.body ?? {};

    if (
        !Array.isArray(numbers) ||
        !numbers.every((number: unknown) => typeof number === "number") ||
        typeof expression !== "string"
    ) {
        return res.status(400).json({
            valid: false,
            message:
                'Please provide "numbers" as an array and "expression" as a string.',
        });
    }

    if (expression.length > 100) {
        return res.status(400).json({
            valid: false,
            message: "Expression must not exceed 100 characters.",
        });
    }

    if (
        numbers.length !== 4 ||
        !numbers.every(
            (number: number) =>
                Number.isInteger(number) && number >= 1 && number <= 10,
        )
    ) {
        return res.status(400).json({
            valid: false,
            message: "Please provide exactly four integers between 1 and 10.",
        });
    }

    const result = checkAnswer(expression, numbers);

    return res.json(result);
});

export function errorHandler(
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
) {
    if (
        typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "entity.parse.failed"
    ) {
        return res.status(400).json({
            valid: false,
            message: "Invalid JSON request body.",
        });
    }

    console.error("Unexpected API error:", error);

    return res.status(500).json({
        valid: false,
        message: "An unexpected server error occurred.",
    });
}

app.use(errorHandler);

export default app;
