import type { RequestHandler } from "express";
import { HttpError } from "../../http/httpError.js";
import type { AnswerInput, GamePageInput } from "./game.types.js";

export function parseAnswer(body: unknown): AnswerInput {
    const { numbers, expression, gameId, durationSeconds } = (body ?? {}) as Partial<AnswerInput>;
    const invalid = (message: string): never => { throw new HttpError(400, { valid: false, message }); };
    if (!Array.isArray(numbers) || !numbers.every(number => typeof number === "number") || typeof expression !== "string") {
        return invalid('Please provide "numbers" as an array and "expression" as a string.');
    }
    if (expression.length > 100) return invalid("Expression must not exceed 100 characters.");
    if (numbers.length !== 4 || !numbers.every(number => Number.isInteger(number) && number >= 1 && number <= 10)) {
        return invalid("Please provide exactly four integers between 1 and 10.");
    }
    if (gameId !== undefined && typeof gameId !== "string") return invalid("gameId must be a string.");
    if (durationSeconds !== undefined && (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds) || durationSeconds < 0 || durationSeconds > 2147483647)) {
        return invalid("durationSeconds must be a non-negative number within the integer range.");
    }
    return { numbers, expression, ...(gameId !== undefined ? { gameId } : {}), ...(durationSeconds !== undefined ? { durationSeconds } : {}) };
}

export function parseGamePage(rawLimit: unknown, rawCursor: unknown): GamePageInput {
    let limit = 20;
    if (rawLimit !== undefined) {
        if (typeof rawLimit !== "string" || !/^\d+$/.test(rawLimit)) {
            throw new HttpError(400, { message: "limit must be a positive integer." });
        }
        limit = Number(rawLimit);
        if (limit < 1 || limit > 100) throw new HttpError(400, { message: "limit must be between 1 and 100." });
    }
    if (rawCursor !== undefined && (typeof rawCursor !== "string" || rawCursor.trim() === "")) {
        throw new HttpError(400, { message: "cursor must be a non-empty game ID." });
    }
    return { limit, ...(typeof rawCursor === "string" ? { cursor: rawCursor } : {}) };
}

export const validateAnswer: RequestHandler = (req, res, next) => {
    res.locals.answerRequest = true;
    const input = parseAnswer(req.body);
    if (input.gameId !== undefined && !res.locals.sessionId) {
        throw new HttpError(400, { valid: false, message: "Missing X-Session-Id header." });
    }
    res.locals.answer = input;
    next();
};

export const validateGamePage: RequestHandler = (req, res, next) => {
    res.locals.page = parseGamePage(req.query.limit, req.query.cursor);
    next();
};

export const validateGotIt: RequestHandler = (req, res, next) => {
    const durationSeconds: unknown = req.body?.durationSeconds;
    if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds) || durationSeconds < 0 || durationSeconds > 2147483647) {
        throw new HttpError(400, { message: "durationSeconds must be a finite, non-negative number of seconds." });
    }
    res.locals.durationSeconds = durationSeconds;
    next();
};
