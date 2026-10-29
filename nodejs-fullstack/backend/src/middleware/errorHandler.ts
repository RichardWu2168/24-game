import type { ErrorRequestHandler } from "express";
import { HttpError } from "../http/httpError.js";
import { GameError } from "../features/games/game.errors.js";

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof HttpError) {
        res.status(error.status).json(error.body);
        return;
    }
    if (error instanceof GameError) {
        const status = error.code === "NOT_FOUND" ? 404 : error.code === "LIST_UNAVAILABLE" ? 500 : 400;
        res.status(status).json({ ...(res.locals.answerRequest ? { valid: false } : {}), message: error.message });
        return;
    }
    if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.parse.failed") {
        res.status(400).json({ valid: false, message: "Invalid JSON request body." });
        return;
    }
    console.error("Unexpected API error:", error);
    res.status(500).json({ valid: false, message: "An unexpected server error occurred." });
};
