import cors from "cors";
import express from "express";
import type { GameStore } from "./database/gameStore.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { createGameRepository } from "./features/games/game.repository.js";
import { createGameService } from "./features/games/game.service.js";
import { createGameRouter } from "./features/games/game.routes.js";
import { getAllowedOrigins } from "./config/env.js";

export function createApp(gameStore?: GameStore) {
    const app = express();
    app.use(cors({
        origin: getAllowedOrigins(),
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type", "X-Session-Id"],
    }));
    app.use(express.json());
    app.get("/api/health", (_req, res) => {
        res.json({ status: "OK", message: "24 Game backend is running!" });
    });
    const repository = createGameRepository(gameStore);
    app.use("/api", createGameRouter(createGameService(repository)));
    app.use(errorHandler);
    return app;
}

export default createApp();
