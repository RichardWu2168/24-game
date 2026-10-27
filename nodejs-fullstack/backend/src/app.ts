
import cors from "cors";
import express from "express";
import { generatePuzzle } from "./game.js";
import { checkAnswer } from "./answerChecker.js";
import { prisma } from "./db.js";


export interface GameStore {
    game: {
        create(args: {
            data: {
                numbers: number[];
            };
        }): Promise<{ id: string }>;

        update(args: {
            where: { id: string };
            data: {
                status?: "COMPLETED";
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


        findMany?: (args: {
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
            };
        }) => Promise<number>;
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
            allowedHeaders: ["Content-Type"],
        })
    );

    app.use(express.json());

    app.get("/api/health", (_req, res) => {
        res.json({
            status: "OK",
            message: "24 Game backend is running!",
        });
    });

    app.get("/api/puzzle", async (_req, res, next) => {
        try {
            const numbers = generatePuzzle();

            const game = await gameStore.game.create({
                data: { numbers },
            });

            res.json({
                numbers,
                gameId: game.id,
            });
        } catch (error) {
            next(error);
        }
    });

    app.get("/api/games", async (req, res, next) => {
        try {
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

    app.get("/api/stats", async (_req, res, next) => {
        try {
            const [
                totalGames,
                completedGames,
                inProgressGames,
                abandonedGames,
                totalAttempts,
                correctAttempts,
            ] = await Promise.all([
                gameStore.game.count!(),
                gameStore.game.count!({
                    where: { status: "COMPLETED" },
                }),
                gameStore.game.count!({
                    where: { status: "IN_PROGRESS" },
                }),
                gameStore.game.count!({
                    where: { status: "ABANDONED" },
                }),
                gameStore.gameAttempt.count!(),
                gameStore.gameAttempt.count!({
                    where: { isCorrect: true },
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

    app.get("/api/games/:id", async (req, res, next) => {
        try {
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

            if (!game) {
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

    app.post("/api/check-answer", async (req, res, next) => {
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
        try {

            const { gameId } = req.body ?? {};

            if (gameId !== undefined && typeof gameId !== "string") {
                return res.status(400).json({
                    valid: false,
                    message: "gameId must be a string.",
                });
            }

            let numbersToCheck = numbers;

            if (typeof gameId === "string") {
                const game = await gameStore.game.findUnique({
                    where: { id: gameId },
                });

                if (!game) {
                    return res.status(404).json({
                        valid: false,
                        message: "Game not found.",
                    });
                }

                if (
                    game.numbers.length !== numbers.length ||
                    !game.numbers.every((number, index) => number === numbers[index])
                ) {
                    return res.status(400).json({
                        valid: false,
                        message: "Submitted numbers do not match the saved game.",
                    });
                }

                if (game.status !== "IN_PROGRESS") {
                    return res.status(400).json({
                        valid: false,
                        message: "This game is not in progress.",
                    });
                }

                numbersToCheck = game.numbers;
            }

            const result = checkAnswer(expression, numbersToCheck);

            if (gameId !== undefined && typeof gameId !== "string") {
                return res.status(400).json({
                    valid: false,
                    message: "gameId must be a string.",
                });
            }

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
                        where: { id: gameId },
                        data: {
                            status: "COMPLETED",
                            completedAt: new Date(),
                        },
                    });
                }
            }

            return res.json(result);
        } catch (error) {
            next(error);
        }
    });

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
