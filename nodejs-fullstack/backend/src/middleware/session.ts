import type { RequestHandler } from "express";
import { HttpError } from "../http/httpError.js";

export const readSession: RequestHandler = (req, res, next) => {
    res.locals.sessionId = req.header("X-Session-Id");
    next();
};

export function requireSession(field: "message" | "error" = "message"): RequestHandler {
    return (_req, res, next) => {
        if (!res.locals.sessionId) {
            next(new HttpError(400, { [field]: "Missing X-Session-Id header." }));
            return;
        }
        next();
    };
}
