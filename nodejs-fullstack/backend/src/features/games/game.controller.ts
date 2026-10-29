import type { RequestHandler } from "express";
import type { GameService } from "./game.service.js";
import type { AnswerInput, GamePageInput } from "./game.types.js";

export function createGameController(service: GameService) {
    const recordGotIt: RequestHandler<{ id: string }> = async (req, res) => {
        res.json(await service.recordGotIt(res.locals.sessionId, req.params.id, res.locals.durationSeconds));
    };
    const clearHistory: RequestHandler = async (_req, res) => {
        res.json(await service.clearHistory(res.locals.sessionId));
    };
    const puzzle = (forceNew: boolean): RequestHandler => async (_req, res) => {
        res.json(await service.getPuzzle(res.locals.sessionId, forceNew));
    };
    const submitAnswer: RequestHandler = async (_req, res) => {
        res.json(await service.submitAnswer(res.locals.answer as AnswerInput, res.locals.sessionId));
    };
    const listGames: RequestHandler = async (_req, res) => {
        res.json(await service.listGames(res.locals.sessionId, res.locals.page as GamePageInput));
    };
    const getGame: RequestHandler<{ id: string }> = async (req, res) => {
        res.json(await service.getGame(res.locals.sessionId, req.params.id));
    };
    const getStats: RequestHandler = async (_req, res) => {
        res.json(await service.getStats(res.locals.sessionId));
    };
    return { resumePuzzle: puzzle(false), newPuzzle: puzzle(true), submitAnswer, listGames, getGame, getStats, clearHistory, recordGotIt };
}
