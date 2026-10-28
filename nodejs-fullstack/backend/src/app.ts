
import cors from "cors";
import express from "express";
import { generatePuzzle } from "./game.js";
import { checkAnswer } from "./answerChecker.js";
import { prisma, withSessionTransaction } from "./db.js";


export interface GameStore {
    withSessionTransaction?<T>(sessionId: string, work: (store: GameStore) => Promise<T>): Promise<T>;
    gameSession?: {
        upsert(args: {
            where: { id: string };
            create: { id: string };
            update: Record<string, never>;
        }): Promise<{ id: string }>;
    };

    game: {
        create(args: {
            data: {
                numbers: number[];
                session: {
                    connect: { id: string };
                };
            };
        }): Promise<{ id: string }>;

        update(args: {
            where: { id: string; status?: "IN_PROGRESS"; sessionId?: string };
            data: {
                status?: "COMPLETED" | "ABANDONED";
                completedAt?: Date;
            };
        }): Promise<unknown>;

        findUnique(args: {
            where: { id: string };
            include?: {
                attempts: {
                    orderBy: {
                        createdAt: "asc";
                    };
                };
            };
        }): Promise<{
            id: string;
            sessionId: string;
            numbers: number[];
            status: "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
            createdAt?: Date;
            completedAt?: Date | null;
            attempts?: {
                id: string;
                expression: string;
                isCorrect: boolean;
                createdAt: Date;
            }[];
        } | null>;

        findFirst?: (args: {
            where: {
                sessionId: string;
                status: "IN_PROGRESS";
            };
        }) => Promise<{
            id: string;
            numbers: number[];
            status: "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
        } | null>;

        findMany?: (args: {
            where: { sessionId: string };
            take: number;
            skip?: number;
            cursor?: {
                id: string;
            };
            orderBy: (
                | { createdAt: "desc" }
                | { id: "desc" }
            )[];
            include: {
                _count: {
                    select: {
                        attempts: true;
                    };
                };
            };
        }) => Promise<{
            id: string;
            numbers: number[];
            status: "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
            createdAt: Date;
            completedAt: Date | null;
            _count: {
                attempts: number;
            };
        }[]>;

        count?: (args?: {
            where?: {
                sessionId?: string;
                status?: "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
            };
        }) => Promise<number>;

    };

    gameAttempt: {
        create(args: {
            data: {
                gameId: string;
                expression: string;
                isCorrect: boolean;
            };
        }): Promise<unknown>;

        count?: (args?: {
            where?: {
                isCorrect?: boolean;
                game?: {
                    sessionId: string;
                };
            };
        }) => Promise<number>;

    };
}

type ApiReply = { status: number; body: unknown };

// Serialize all state changes for a session across server processes. Send the
// HTTP response only after the transaction commits successfully.
function sessionRoute(
    store: GameStore,
    handler: (req: express.Request, store: GameStore) => Promise<ApiReply>,
): express.RequestHandler {
    return async (req, res, next) => {
        try {
            const sessionId = req.header("X-Session-Id");
            const work = (transactionStore: GameStore) => handler(req, transactionStore);
            let result: ApiReply;
            if (sessionId && Object.is(store, prisma)) {
                result = await withSessionTransaction(sessionId, work);
            } else if (sessionId && store.withSessionTransaction) {
                result = await store.withSessionTransaction(sessionId, work);
            } else {
                result = await work(store);
            }
            res.status(result.status).json(result.body);
        } catch (error) {
            next(error);
        }
    };
}

export function createApp(gameStore: GameStore = prisma) {
    const app = express();

    const allowedOrigins = (process.env.FRONTEND_URL ?? "")
        .split(",")
        .map((url) => url.trim())
        .filter(Boolean);

    app.use(
        cors({
            origin: allowedOrigins,
            methods: ["GET", "POST"],
            allowedHeaders: ["Content-Type", "X-Session-Id"],
        })
    );

    app.use(express.json());

    app.get("/api/health", (_req, res) => {
        res.json({
            status: "OK",
            message: "24 Game backend is running!",
        });
    });

    const handlePuzzleRequest = (forceNew: boolean) => sessionRoute(gameStore, async (req, gameStore) => {
        const reply = (status: number, body: unknown): ApiReply => ({ status, body });
        const sessionId = req.header("X-Session-Id");

        if (!sessionId) {
            return reply(400, {
                error: "Missing X-Session-Id header.",
            });

        }

        if (!gameStore.gameSession) {
            throw new Error("Session store is not configured.");
        }

        const session = await gameStore.gameSession.upsert({
            where: { id: sessionId },
            create: { id: sessionId },
            update: {},
        });

        const findActiveGame = async () => {
            if (!gameStore.game.findFirst) {
                throw new Error("Game store does not support finding active games.");
            }

            return gameStore.game.findFirst({
                where: {
                    sessionId: session.id,
                    status: "IN_PROGRESS",
                },
            });
        };

        // GET resumes the existing game unless explicitly creating a new one.
        if (!forceNew) {
            const activeGame = await findActiveGame();

            if (activeGame) {
                return reply(200, {
                    numbers: activeGame.numbers,
                    gameId: activeGame.id,
                });

            }
        } else {
            // POST starts a fresh game and abandons the previous unfinished game.
            const activeGame = await findActiveGame();

            if (activeGame) {
                await gameStore.game.update({
                    where: { id: activeGame.id, status: "IN_PROGRESS", sessionId },
                    data: { status: "ABANDONED" },
                });
            }
        }

        const numbers = generatePuzzle();

        const game = await gameStore.game.create({
            data: {
                numbers,
                session: { connect: { id: session.id } },
            },
        });

        return reply(200, { numbers, gameId: game.id });

    });

    app.get("/api/puzzle", handlePuzzleRequest(false));
    app.post("/api/puzzle", handlePuzzleRequest(true));

    app.get("/api/games", async (req, res, next) => {
        try {
            const sessionId = req.header("X-Session-Id");

            if (!sessionId) {
                return res.status(400).json({
                    message: "Missing X-Session-Id header.",
                });
            }
            const rawLimit = req.query.limit;
            let limit = 20;

            if (rawLimit !== undefined) {
                if (typeof rawLimit !== "string" || !/^\d+$/.test(rawLimit)) {
                    return res.status(400).json({
                        message: "limit must be a positive integer.",
                    });
                }

                limit = Number(rawLimit);

                if (limit < 1 || limit > 100) {
                    return res.status(400).json({
                        message: "limit must be between 1 and 100.",
                    });
                }
            }

            const rawCursor = req.query.cursor;

            if (
                rawCursor !== undefined &&
                (typeof rawCursor !== "string" || rawCursor.trim() === "")
            ) {
                return res.status(400).json({
                    message: "cursor must be a non-empty game ID.",
                });
            }

            if (!gameStore.game.findMany) {
                return res.status(500).json({
                    message: "Game listing is unavailable.",
                });
            }

            const cursor = typeof rawCursor === "string" ? rawCursor : undefined;


            let games;

            try {
                games = await gameStore.game.findMany({
                    where: {
                        sessionId,
                    },
                    take: limit + 1,
                    ...(cursor
                        ? {
                            cursor: { id: cursor },
                            skip: 1,
                        }
                        : {}),
                    orderBy: [
                        { createdAt: "desc" },
                        { id: "desc" },
                    ],
                    include: {
                        _count: {
                            select: {
                                attempts: true,
                            },
                        },
                    },
                });

            } catch (error) {
                if (
                    cursor &&
                    typeof error === "object" &&
                    error !== null &&
                    "code" in error &&
                    error.code === "P2025"
                ) {
                    return res.status(400).json({
                        message: "Invalid cursor. The referenced game was not found.",
                    });
                }

                return next(error);
            }

            const hasMore = games.length > limit;
            const pageGames = hasMore ? games.slice(0, limit) : games;
            const nextCursor =
                hasMore && pageGames.length > 0
                    ? pageGames[pageGames.length - 1].id
                    : null;

            return res.json({
                games: pageGames.map((game) => ({
                    id: game.id,
                    numbers: game.numbers,
                    status: game.status,
                    createdAt: game.createdAt,
                    completedAt: game.completedAt,
                    attemptCount: game._count.attempts,
                })),
                nextCursor,
                hasMore,
            });

        } catch (error) {
            return next(error);
        }
    });


    app.get("/api/games/:id", async (req, res, next) => {
        try {
            const sessionId = req.header("X-Session-Id");

            if (!sessionId) {
                return res.status(400).json({
                    message: "Missing X-Session-Id header.",
                });
            }

            const game = await gameStore.game.findUnique({
                where: { id: req.params.id },
                include: {
                    attempts: {
                        orderBy: {
                            createdAt: "asc",
                        },
                    },
                },
            });

            if (!game || game.sessionId !== sessionId) {
                return res.status(404).json({
                    message: "Game not found.",
                });
            }

            return res.json({
                id: game.id,
                numbers: game.numbers,
                status: game.status,
                createdAt: game.createdAt,
                completedAt: game.completedAt ?? null,
                attempts: game.attempts ?? [],
            });
        } catch (error) {
            next(error);
        }
    });

    app.get("/api/stats", async (req, res, next) => {
        try {
            const sessionId = req.header("X-Session-Id");

            if (!sessionId) {
                return res.status(400).json({
                    message: "Missing X-Session-Id header.",
                });
            }

            const [
                totalGames,
                completedGames,
                inProgressGames,
                abandonedGames,
                totalAttempts,
                correctAttempts,
            ] = await Promise.all([
                gameStore.game.count!({
                    where: { sessionId },
                }),
                gameStore.game.count!({
                    where: { sessionId, status: "COMPLETED" },
                }),
                gameStore.game.count!({
                    where: { sessionId, status: "IN_PROGRESS" },
                }),
                gameStore.game.count!({
                    where: { sessionId, status: "ABANDONED" },
                }),
                gameStore.gameAttempt.count!({
                    where: { game: { sessionId } },
                }),
                gameStore.gameAttempt.count!({
                    where: {
                        isCorrect: true,
                        game: { sessionId },
                    },
                }),
            ]);

            const accuracyPercent =
                totalAttempts === 0
                    ? 0
                    : Math.round((correctAttempts / totalAttempts) * 100);

            return res.json({
                totalGames,
                completedGames,
                inProgressGames,
                abandonedGames,
                totalAttempts,
                correctAttempts,
                accuracyPercent,
            });
        } catch (error) {
            return next(error);
        }
    });

    app.post("/api/check-answer", sessionRoute(gameStore, async (req, gameStore) => {
        const reply = (status: number, body: unknown): ApiReply => ({ status, body });
        const { numbers, expression } = req.body ?? {};

        if (
            !Array.isArray(numbers) ||
            !numbers.every((number: unknown) => typeof number === "number") ||
            typeof expression !== "string"
        ) {
            return reply(400, {
                valid: false,
                message:
                    'Please provide "numbers" as an array and "expression" as a string.',
            });
        }

        if (expression.length > 100) {
            return reply(400, {
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
            return reply(400, {
                valid: false,
                message: "Please provide exactly four integers between 1 and 10.",
            });
        }

        const { gameId } = req.body ?? {};

        if (gameId !== undefined && typeof gameId !== "string") {
            return reply(400, {
                valid: false,
                message: "gameId must be a string.",
            });
        }

        let numbersToCheck = numbers;

        if (typeof gameId === "string") {
            const sessionId = req.header("X-Session-Id");

            if (!sessionId) {
                return reply(400, {
                    valid: false,
                    message: "Missing X-Session-Id header.",
                });
            }

            const game = await gameStore.game.findUnique({
                where: { id: gameId },
            });

            if (!game || game.sessionId !== sessionId) {
                return reply(404, {
                    valid: false,
                    message: "Game not found.",
                });
            }

            if (
                game.numbers.length !== numbers.length ||
                !game.numbers.every((number, index) => number === numbers[index])
            ) {
                return reply(400, {
                    valid: false,
                    message: "Submitted numbers do not match the saved game.",
                });
            }

            if (game.status !== "IN_PROGRESS") {
                return reply(400, {
                    valid: false,
                    message: "This game is not in progress.",
                });
            }

            numbersToCheck = game.numbers;
        }

        const result = checkAnswer(expression, numbersToCheck);

        if (typeof gameId === "string") {
            await gameStore.gameAttempt.create({
                data: {
                    gameId,
                    expression,
                    isCorrect: result.valid,
                },
            });

            if (result.valid) {
                await gameStore.game.update({
                    where: { id: gameId, status: "IN_PROGRESS", sessionId: req.header("X-Session-Id") },
                    data: {
                        status: "COMPLETED",
                        completedAt: new Date(),
                    },
                });
            }
        }

        return reply(200, result);

    }));

    app.use(errorHandler);

    return app;
}

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

const app = createApp();

export default app;
