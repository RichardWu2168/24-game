import { Router } from "express";
import { readSession, requireSession } from "../../middleware/session.js";
import { createGameController } from "./game.controller.js";
import type { GameService } from "./game.service.js";
import { validateAnswer, validateGamePage } from "./game.validation.js";

export function createGameRouter(service: GameService) {
    const router = Router();
    const controller = createGameController(service);
    router.use(readSession);
    router.get("/puzzle", requireSession("error"), controller.resumePuzzle);
    router.post("/puzzle", requireSession("error"), controller.newPuzzle);
    router.post("/check-answer", validateAnswer, controller.submitAnswer);
    router.get("/games", requireSession(), validateGamePage, controller.listGames);
    router.get("/games/:id", requireSession(), controller.getGame);
    router.get("/stats", requireSession(), controller.getStats);
    return router;
}
