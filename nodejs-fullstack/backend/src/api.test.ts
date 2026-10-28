
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createApp, errorHandler, type GameStore } from "./app.js";

function createFakeStore(): GameStore {
    return {
        game: {
            create: async (_args) => ({
                id: "test-game-id",
            }),

            findUnique: async ({ where }) => ({
                id: where.id,
                sessionId: "test-session-id",
                numbers: [3, 5, 4, 1],
                status: "IN_PROGRESS",
            }),

            update: async (_args) => ({}),
        },

        gameAttempt: {
            create: async (_args) => ({}),
        },
    };
}

async function withServer(
    run: (baseUrl: string) => Promise<void>,
    application: express.Express = createApp(createFakeStore()),): Promise<void> {
    const server = application.listen(0);

    try {
        await new Promise<void>((resolve) => {
            server.once("listening", resolve);
        });

        const address = server.address();
        assert.ok(address && typeof address !== "string");

        await run(`http://127.0.0.1:${address.port}`);
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }
}

test("GET /api/puzzle returns a valid solvable puzzle", async () => {
    const fakeStore = {
        gameSession: {
            upsert: async (args: { where: { id: string } }) => ({
                id: args.where.id,
            }),
        },

        game: {
            findFirst: async (_args: {
                where: {
                    sessionId: string;
                    status: "IN_PROGRESS";
                };
            }) => null,
            create: async (_args: {
                data: {
                    numbers: number[];
                    session: { connect: { id: string } };
                };
            }) => ({
                id: "test-game-id",
            }),
            update: async (_args: {
                where: { id: string };
                data: {
                    status?: "COMPLETED" | "ABANDONED";
                    completedAt?: Date;
                };
            }) => ({}),
            findUnique: async (_args: {
                where: { id: string };
            }) => ({
                id: "test-game-id",
                sessionId: "test-session-id",
                numbers: [3, 5, 4, 1],
                status: "IN_PROGRESS" as const,
            }),
        },
        gameAttempt: {
            create: async (_args: {
                data: {
                    gameId: string;
                    expression: string;
                    isCorrect: boolean;
                };
            }) => ({}),
        },
    };

    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/puzzle`, {
            method: "POST",
            headers: {
                "X-Session-Id": "test-session-id",
            },
        });

        assert.equal(response.status, 200);

        const body = await response.json() as {
            numbers: number[];
            gameId: string;
        };

        assert.equal(body.numbers.length, 4);
        assert.ok(body.numbers.every(
            (n) => Number.isInteger(n) && n >= 1 && n <= 10,
        ));
        assert.equal(body.gameId, "test-game-id");

        const { canMake24 } = await import("./game.js");
        assert.equal(canMake24(body.numbers), true);
    }, createApp(fakeStore));
});

test("POST /api/puzzle abandons the previous active game in the same session", async () => {
    const games: {
        id: string;
        numbers: number[];
        sessionId: string;
        status: "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
    }[] = [];

    let nextGameId = 1;

    const fakeStore = {
        gameSession: {
            upsert: async (args: { where: { id: string } }) => ({
                id: args.where.id,
            }),
        },
        game: {
            findFirst: async (args: {
                where: { sessionId: string; status: "IN_PROGRESS" };
            }) =>
                games.find(
                    (game) =>
                        game.sessionId === args.where.sessionId &&
                        game.status === args.where.status,
                ) ?? null,

            create: async (args: {
                data: {
                    numbers: number[];
                    session: { connect: { id: string } };
                };
            }) => {
                const game = {
                    id: `test-game-${nextGameId++}`,
                    numbers: args.data.numbers,
                    sessionId: args.data.session.connect.id,
                    status: "IN_PROGRESS" as const,
                };

                games.push(game);
                return { id: game.id };
            },

            update: async (args: {
                where: { id: string };
                data: {
                    status?: "COMPLETED" | "ABANDONED";
                    completedAt?: Date;
                };
            }) => {
                const game = games.find(
                    (item) => item.id === args.where.id,
                );

                if (game && args.data.status) {
                    game.status = args.data.status;
                }

                return game ?? {};
            },

            findUnique: async (args: { where: { id: string } }) => {
                const game = games.find(
                    (item) => item.id === args.where.id,
                );

                if (!game) return null;

                return {
                    id: game.id,
                    sessionId: "test-session-id",
                    numbers: game.numbers,
                    status: game.status,
                };
            },
        },
        gameAttempt: {
            create: async () => ({}),
        },
    };

    await withServer(async (baseUrl) => {
        async function requestPuzzle(
            sessionId: string,
            method: "GET" | "POST" = "GET",
        ) {
            const response = await fetch(`${baseUrl}/api/puzzle`, {
                method,
                headers: { "X-Session-Id": sessionId },
            });

            assert.equal(response.status, 200);

            return await response.json() as {
                numbers: number[];
                gameId: string;
            };
        }
        const first = await requestPuzzle("session-a");
        const second = await requestPuzzle("session-a", "POST");

        assert.notEqual(first.gameId, second.gameId);
        assert.equal(
            games.find((game) => game.id === first.gameId)?.status,
            "ABANDONED",
        );
        assert.equal(
            games.find((game) => game.id === second.gameId)?.status,
            "IN_PROGRESS",
        );

        const otherSessionGame = await requestPuzzle("session-b", "POST");
        assert.equal(
            games.find((game) => game.id === otherSessionGame.gameId)?.status,
            "IN_PROGRESS",
        );
        assert.equal(
            games.find((game) => game.id === second.gameId)?.status,
            "IN_PROGRESS",
        );
    }, createApp(fakeStore));
});


test("repeated GET /api/puzzle resumes the active game without creating or abandoning another", async () => {
    const games: {
        id: string;
        numbers: number[];
        sessionId: string;
        status: "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
    }[] = [];

    let nextGameId = 1;
    let createCount = 0;
    let updateCount = 0;

    const fakeStore = {
        gameSession: {
            upsert: async (args: { where: { id: string } }) => ({
                id: args.where.id,
            }),
        },
        game: {
            findFirst: async (args: {
                where: { sessionId: string; status: "IN_PROGRESS" };
            }) =>
                games.find(
                    (game) =>
                        game.sessionId === args.where.sessionId &&
                        game.status === args.where.status,
                ) ?? null,

            create: async (args: {
                data: {
                    numbers: number[];
                    session: { connect: { id: string } };
                };
            }) => {
                createCount++;

                const game = {
                    id: `test-game-${nextGameId++}`,
                    numbers: args.data.numbers,
                    sessionId: args.data.session.connect.id,
                    status: "IN_PROGRESS" as const,
                };

                games.push(game);
                return { id: game.id };
            },

            update: async (args: {
                where: { id: string };
                data: {
                    status?: "COMPLETED" | "ABANDONED";
                    completedAt?: Date;
                };
            }) => {
                updateCount++;

                const game = games.find(
                    (item) => item.id === args.where.id,
                );

                if (game && args.data.status) {
                    game.status = args.data.status;
                }

                return game ?? {};
            },

            findUnique: async (args: { where: { id: string } }) => {
                const game = games.find(
                    (item) => item.id === args.where.id,
                );

                if (!game) return null;

                return {
                    id: game.id,
                    sessionId: game.sessionId,
                    numbers: game.numbers,
                    status: game.status,
                };
            },
        },
        gameAttempt: {
            create: async () => ({}),
        },
    };

    await withServer(async (baseUrl) => {
        async function getPuzzle() {
            const response = await fetch(`${baseUrl}/api/puzzle`, {
                headers: { "X-Session-Id": "regression-session" },
            });

            assert.equal(response.status, 200);

            return await response.json() as {
                numbers: number[];
                gameId: string;
            };
        }

        const first = await getPuzzle();
        const second = await getPuzzle();

        assert.equal(second.gameId, first.gameId);
        assert.deepEqual(second.numbers, first.numbers);
        assert.equal(createCount, 1);
        assert.equal(updateCount, 0);
        assert.equal(games.length, 1);
        assert.equal(games[0].status, "IN_PROGRESS");
    }, createApp(fakeStore));
});

test("POST /api/check-answer accepts a correct answer", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({
                numbers: [3, 5, 4, 1],
                expression: "(3 + 5) * (4 - 1)",
            }),
        });

        assert.equal(response.status, 200);

        const body = await response.json() as {
            valid: boolean;
            message: string;
            value?: number;
        };

        assert.equal(body.valid, true);
        assert.equal(body.value, 24);
        assert.equal(body.message, "Correct! You made 24!");
    });
});

test("POST /api/check-answer rejects an incorrect answer", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({
                numbers: [1, 2, 3, 4],
                expression: "1 + 2 + 3 + 4",
            }),
        });

        assert.equal(response.status, 200);

        const body = await response.json() as {
            valid: boolean;
            message: string;
            value?: number;
        };

        assert.equal(body.valid, false);
        assert.equal(body.value, 10);
        assert.match(body.message, /not 24/i);
    });
});

test("POST /api/check-answer rejects malformed request fields", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({
                numbers: "1,2,3,4",
                expression: "1 + 2 + 3 + 4",
            }),
        });

        assert.equal(response.status, 400);

        const body = await response.json() as {
            valid: boolean;
            message: string;
        };

        assert.equal(body.valid, false);
        assert.match(body.message, /numbers.*array/i);
    });
});

test("POST /api/check-answer returns JSON for malformed JSON", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: '{"numbers":[1,2,3,4],"expression":',
        });

        assert.equal(response.status, 400);
        assert.match(
            response.headers.get("content-type") ?? "",
            /application\/json/,
        );

        const body = await response.json() as {
            valid: boolean;
            message: string;
        };

        assert.equal(body.valid, false);
        assert.equal(body.message, "Invalid JSON request body.");
    });
});

test("POST /api/check-answer rejects an invalid card count", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({
                numbers: [1, 2, 3],
                expression: "1 + 2 + 3",
            }),
        });

        assert.equal(response.status, 400);

        const body = await response.json() as {
            valid: boolean;
            message: string;
        };

        assert.equal(body.valid, false);
        assert.match(body.message, /exactly four integers/i);
    });
});

test("POST /api/check-answer rejects card values outside 1 to 10", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({
                numbers: [0, 2, 3, 11],
                expression: "0 + 2 + 3 + 11",
            }),
        });

        assert.equal(response.status, 400);

        const body = await response.json() as {
            valid: boolean;
            message: string;
        };

        assert.equal(body.valid, false);
        assert.match(body.message, /exactly four integers/i);
    });
});

test("POST /api/check-answer rejects a missing expression", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({
                numbers: [3, 5, 4, 1],
            }),
        });

        assert.equal(response.status, 400);

        const body = await response.json() as {
            valid: boolean;
            message: string;
        };

        assert.equal(body.valid, false);
        assert.match(body.message, /expression.*string/i);
    });
});

test("POST /api/check-answer rejects an expression that is too long", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({
                numbers: [3, 5, 4, 1],
                expression: "1".repeat(101),
            }),
        });

        assert.equal(response.status, 400);

        const body = await response.json() as {
            valid: boolean;
            message: string;
        };

        assert.equal(body.valid, false);
        assert.equal(
            body.message,
            "Expression must not exceed 100 characters.",
        );
    });
});


test("unexpected errors return a generic JSON 500 response", async () => {
    const testApp = express();

    testApp.get("/test-error", (_req, _res, next) => {
        next(new Error("Sensitive internal implementation detail"));
    });

    testApp.use(errorHandler);

    const originalConsoleError = console.error;
    console.error = () => { };

    try {
        await withServer(async (baseUrl) => {
            const response = await fetch(`${baseUrl}/test-error`);

            assert.equal(response.status, 500);
            assert.match(
                response.headers.get("content-type") ?? "",
                /application\/json/,
            );

            const body = await response.json() as {
                valid: boolean;
                message: string;
            };

            assert.equal(body.valid, false);
            assert.equal(
                body.message,
                "An unexpected server error occurred.",
            );
            assert.doesNotMatch(
                JSON.stringify(body),
                /Sensitive internal implementation detail/,
            );
        }, testApp);
    } finally {
        console.error = originalConsoleError;
    }
});

test("missing request fields return 400", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({}),
        });

        assert.equal(response.status, 400);

        const body = await response.json() as {
            valid: boolean;
            message: string;
        };

        assert.equal(body.valid, false);
        assert.equal(
            body.message,
            'Please provide "numbers" as an array and "expression" as a string.',
        );
    });
});

test("invalid card numbers return 400", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({
                numbers: [1, 2, 3, 11],
                expression: "1 + 2 + 3 + 11",
            }),
        });

        assert.equal(response.status, 400);

        const body = await response.json() as {
            valid: boolean;
            message: string;
        };

        assert.equal(body.valid, false);
        assert.equal(
            body.message,
            "Please provide exactly four integers between 1 and 10.",
        );
    });
});

test("a missing expression returns 400", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({
                numbers: [1, 2, 3, 4],
            }),
        });

        assert.equal(response.status, 400);

        const body = await response.json() as {
            valid: boolean;
            message: string;
        };

        assert.equal(body.valid, false);
        assert.equal(
            body.message,
            'Please provide "numbers" as an array and "expression" as a string.',
        );
    });
});

test("expressions longer than 100 characters return 400", async () => {
    await withServer(async (baseUrl) => {
        const expression = "1".repeat(101);

        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({
                numbers: [1, 2, 3, 4],
                expression,
            }),
        });

        assert.equal(response.status, 400);

        const body = await response.json() as {
            valid: boolean;
            message: string;
        };

        assert.equal(body.valid, false);
        assert.equal(
            body.message,
            "Expression must not exceed 100 characters.",
        );
    });
});

test("invalid expression syntax returns a validation error", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({
                numbers: [1, 2, 3, 4],
                expression: "1 + 2 + 3 + @",
            }),
        });

        assert.equal(response.status, 200);

        const body = await response.json() as {
            valid: boolean;
            message: string;
        };

        assert.equal(body.valid, false);
        assert.equal(body.message, "Invalid character: @");
    });
});

test("malformed JSON returns 400", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: '{"numbers":[1,2,3,4],"expression":',
        });

        assert.equal(response.status, 400);

        const body = await response.json() as {
            valid: boolean;
            message: string;
        };

        assert.equal(body.valid, false);
        assert.equal(body.message, "Invalid JSON request body.");
    });
});

test("decimal card numbers return 400", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({
                numbers: [1, 2, 2.5, 4],
                expression: "1 + 2 + 2.5 + 4",
            }),
        });

        assert.equal(response.status, 400);

        const body = await response.json() as {
            valid: boolean;
            message: string;
        };

        assert.equal(body.valid, false);
        assert.equal(
            body.message,
            "Please provide exactly four integers between 1 and 10.",
        );
    });
});

test("negative card numbers return 400", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({
                numbers: [-1, 2, 3, 4],
                expression: "-1 + 2 + 3 + 4",
            }),
        });

        assert.equal(response.status, 400);

        const body = await response.json() as {
            valid: boolean;
            message: string;
        };

        assert.equal(body.valid, false);
        assert.equal(
            body.message,
            "Please provide exactly four integers between 1 and 10.",
        );
    });
});

test("fewer than four card numbers return 400", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({
                numbers: [1, 2, 3],
                expression: "1 + 2 + 3",
            }),
        });

        assert.equal(response.status, 400);

        const body = await response.json() as {
            valid: boolean;
            message: string;
        };

        assert.equal(body.valid, false);
        assert.equal(
            body.message,
            "Please provide exactly four integers between 1 and 10.",
        );
    });
});

test("more than four card numbers return 400", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({
                numbers: [1, 2, 3, 4, 5],
                expression: "1 + 2 + 3 + 4 + 5",
            }),
        });

        assert.equal(response.status, 400);

        const body = await response.json() as {
            valid: boolean;
            message: string;
        };

        assert.equal(body.valid, false);
        assert.equal(
            body.message,
            "Please provide exactly four integers between 1 and 10.",
        );
    });
});

test("card number 10 is accepted by input validation", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({
                numbers: [1, 2, 3, 10],
                expression: "1 + 2 + 3 + 10",
            }),
        });

        assert.equal(response.status, 200);

        const body = await response.json() as {
            valid: boolean;
            message: string;
            value?: number;
        };

        assert.equal(body.valid, false);
        assert.equal(body.value, 16);
        assert.equal(body.message, "Your expression equals 16, not 24.");
    });
});

test("numbers provided as a string return 400", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({
                numbers: "1,2,3,4",
                expression: "1 + 2 + 3 + 4",
            }),
        });

        assert.equal(response.status, 400);

        const body = await response.json() as {
            valid: boolean;
            message: string;
        };

        assert.equal(body.valid, false);
        assert.equal(
            body.message,
            'Please provide "numbers" as an array and "expression" as a string.',
        );
    });
});

test("a non-string expression returns 400", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({
                numbers: [1, 2, 3, 4],
                expression: 24,
            }),
        });

        assert.equal(response.status, 400);

        const body = await response.json() as {
            valid: boolean;
            message: string;
        };

        assert.equal(body.valid, false);
        assert.equal(
            body.message,
            'Please provide "numbers" as an array and "expression" as a string.',
        );
    });
});

test("POST /api/check-answer records an answer attempt", async () => {
    let recordedAttempt: {
        gameId: string;
        expression: string;
        isCorrect: boolean;
    } | undefined;

    const fakeStore = {
        game: {
            create: async (_args: { data: { numbers: number[] } }) => ({
                id: "test-game-id",
            }),
            update: async (_args: {
                where: { id: string };
                data: {
                    status?: "COMPLETED";
                    completedAt?: Date;
                };
            }) => ({}),
            findUnique: async (_args: {
                where: { id: string };
            }) => ({
                id: "test-game-id",
                sessionId: "test-session-id",
                numbers: [3, 5, 4, 1],
                status: "IN_PROGRESS" as const,
            }),
        },
        gameAttempt: {
            create: async (args: {
                data: {
                    gameId: string;
                    expression: string;
                    isCorrect: boolean;
                };
            }) => {
                recordedAttempt = args.data;
                return {};
            },
        },
    };

    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({
                gameId: "test-game-id",
                numbers: [3, 5, 4, 1],
                expression: "(3 + 5) * (4 - 1)",
            }),
        });

        assert.equal(response.status, 200);

        const body = await response.json() as {
            valid: boolean;
            message: string;
        };

        assert.equal(body.valid, true);
        assert.ok(recordedAttempt);
        assert.deepEqual(recordedAttempt, {
            gameId: "test-game-id",
            expression: "(3 + 5) * (4 - 1)",
            isCorrect: true,
        });
    }, createApp(fakeStore));
});

test("POST /api/check-answer records an incorrect answer attempt", async () => {
    let recordedAttempt: {
        gameId: string;
        expression: string;
        isCorrect: boolean;
    } | undefined;

    const fakeStore = {
        game: {
            create: async (_args: { data: { numbers: number[] } }) => ({
                id: "test-game-id",
            }),
            update: async (_args: {
                where: { id: string };
                data: {
                    status?: "COMPLETED";
                    completedAt?: Date;
                };
            }) => ({}),
            findUnique: async (_args: {
                where: { id: string };
            }) => ({
                id: "test-game-id",
                sessionId: "test-session-id",
                numbers: [1, 2, 3, 4],
                status: "IN_PROGRESS" as const,
            }),
        },
        gameAttempt: {
            create: async (args: {
                data: {
                    gameId: string;
                    expression: string;
                    isCorrect: boolean;
                };
            }) => {
                recordedAttempt = args.data;
                return {};
            },
        },
    };

    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({
                gameId: "test-game-id",
                numbers: [1, 2, 3, 4],
                expression: "1 + 2 + 3 + 4",
            }),
        });

        assert.equal(response.status, 200);

        const body = await response.json() as {
            valid: boolean;
            message: string;
            value?: number;
        };

        assert.equal(body.valid, false);
        assert.equal(body.value, 10);
        assert.ok(recordedAttempt);

        assert.deepEqual(recordedAttempt, {
            gameId: "test-game-id",
            expression: "1 + 2 + 3 + 4",
            isCorrect: false,
        });
    }, createApp(fakeStore));
});

test("POST /api/check-answer marks a game completed after a correct answer", async () => {
    let updatedGame: {
        where: { id: string };
        data: {
            status?: "COMPLETED";
            completedAt?: Date;
        };
    } | undefined;

    const fakeStore = {
        game: {
            create: async (_args: { data: { numbers: number[] } }) => ({
                id: "test-game-id",
            }),
            update: async (args: {
                where: { id: string };
                data: {
                    status?: "COMPLETED";
                    completedAt?: Date;
                };
            }) => {
                updatedGame = args;
                return {};
            },
            findUnique: async (_args: {
                where: { id: string };
            }) => ({
                id: "test-game-id",
                sessionId: "test-session-id",
                numbers: [3, 5, 4, 1],
                status: "IN_PROGRESS" as const,
            }),
        },
        gameAttempt: {
            create: async (_args: {
                data: {
                    gameId: string;
                    expression: string;
                    isCorrect: boolean;
                };
            }) => ({}),
        },
    };

    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({
                gameId: "test-game-id",
                numbers: [3, 5, 4, 1],
                expression: "(3 + 5) * (4 - 1)",
            }),
        });

        assert.equal(response.status, 200);

        const body = await response.json() as {
            valid: boolean;
            message: string;
            value?: number;
        };

        assert.equal(body.valid, true);
        assert.ok(updatedGame);
        assert.equal(updatedGame.where.id, "test-game-id");
        assert.equal(updatedGame.data.status, "COMPLETED");
        assert.ok(updatedGame.data.completedAt instanceof Date);
    }, createApp(fakeStore));
});

test("POST /api/check-answer does not complete a game after an incorrect answer", async () => {
    let updateCalled = false;

    const fakeStore = {
        game: {
            create: async (_args: { data: { numbers: number[] } }) => ({
                id: "test-game-id",
            }),
            update: async (_args: {
                where: { id: string };
                data: {
                    status?: "COMPLETED";
                    completedAt?: Date;
                };
            }) => {
                updateCalled = true;
                return {};
            },
            findUnique: async (_args: {
                where: { id: string };
            }) => ({
                id: "test-game-id",
                sessionId: "test-session-id",
                numbers: [1, 2, 3, 4],
                status: "IN_PROGRESS" as const,
            }),
        },
        gameAttempt: {
            create: async (_args: {
                data: {
                    gameId: string;
                    expression: string;
                    isCorrect: boolean;
                };
            }) => ({}),
        },
    };

    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({
                gameId: "test-game-id",
                numbers: [1, 2, 3, 4],
                expression: "1 + 2 + 3 + 4",
            }),
        });

        assert.equal(response.status, 200);

        const body = await response.json() as {
            valid: boolean;
            message: string;
            value?: number;
        };

        assert.equal(body.valid, false);
        assert.equal(body.value, 10);
        assert.equal(updateCalled, false);
    }, createApp(fakeStore));
});

test("POST /api/check-answer returns 404 for an unknown game", async () => {
    const fakeStore = {
        game: {
            create: async (_args: { data: { numbers: number[] } }) => ({
                id: "test-game-id",
            }),
            findUnique: async (_args: { where: { id: string } }) => null,
            update: async (_args: {
                where: { id: string };
                data: {
                    status?: "COMPLETED";
                    completedAt?: Date;
                };
            }) => ({}),
        },
        gameAttempt: {
            create: async (_args: {
                data: {
                    gameId: string;
                    expression: string;
                    isCorrect: boolean;
                };
            }) => ({}),
        },
    };

    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({
                gameId: "unknown-game-id",
                numbers: [3, 5, 4, 1],
                expression: "(3 + 5) * (4 - 1)",
            }),
        });

        assert.equal(response.status, 404);

        const body = await response.json() as {
            valid: boolean;
            message: string;
        };

        assert.equal(body.valid, false);
        assert.equal(body.message, "Game not found.");
    }, createApp(fakeStore));
});

test("POST /api/check-answer rejects numbers that differ from the saved game", async () => {
    const fakeStore = {
        game: {
            create: async (_args: { data: { numbers: number[] } }) => ({
                id: "test-game-id",
            }),
            findUnique: async (_args: { where: { id: string } }) => ({
                id: "test-game-id",
                sessionId: "test-session-id",
                numbers: [3, 5, 4, 1],
                status: "IN_PROGRESS" as const,
            }),
            update: async (_args: {
                where: { id: string };
                data: {
                    status?: "COMPLETED";
                    completedAt?: Date;
                };
            }) => ({}),
        },
        gameAttempt: {
            create: async (_args: {
                data: {
                    gameId: string;
                    expression: string;
                    isCorrect: boolean;
                };
            }) => ({}),
        },
    };

    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({
                gameId: "test-game-id",
                numbers: [1, 2, 3, 4],
                expression: "1 + 2 + 3 + 4",
            }),
        });

        assert.equal(response.status, 400);

        const body = await response.json() as {
            valid: boolean;
            message: string;
        };

        assert.equal(body.valid, false);
        assert.equal(
            body.message,
            "Submitted numbers do not match the saved game.",
        );
    }, createApp(fakeStore));
});

test("POST /api/check-answer rejects an already completed game", async () => {
    const fakeStore = {
        game: {
            create: async (_args: { data: { numbers: number[] } }) => ({
                id: "test-game-id",
            }),
            findUnique: async (_args: { where: { id: string } }) => ({
                id: "test-game-id",
                sessionId: "test-session-id",
                numbers: [3, 5, 4, 1],
                status: "COMPLETED" as const,
            }),
            update: async (_args: {
                where: { id: string };
                data: {
                    status?: "COMPLETED";
                    completedAt?: Date;
                };
            }) => ({}),
        },
        gameAttempt: {
            create: async (_args: {
                data: {
                    gameId: string;
                    expression: string;
                    isCorrect: boolean;
                };
            }) => ({}),
        },
    };

    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Session-Id": "test-session-id",
            },
            body: JSON.stringify({
                gameId: "test-game-id",
                numbers: [3, 5, 4, 1],
                expression: "(3 + 5) * (4 - 1)",
            }),
        });

        assert.equal(response.status, 400);

        const body = await response.json() as {
            valid: boolean;
            message: string;
        };

        assert.equal(body.valid, false);
        assert.equal(body.message, "This game is not in progress.");
    }, createApp(fakeStore));
});

test("GET /api/games/:id returns game details and answer attempts", async () => {
    const createdAt = new Date("2026-10-27T14:00:00.000Z");
    const completedAt = new Date("2026-10-27T14:05:00.000Z");

    const fakeStore = {
        game: {
            create: async (_args: { data: { numbers: number[] } }) => ({
                id: "test-game-id",
            }),
            findUnique: async (_args: {
                where: { id: string };
                include?: {
                    attempts: {
                        orderBy: { createdAt: "asc" };
                    };
                };
            }) => ({
                id: "test-game-id",
                sessionId: "test-session-id",
                numbers: [3, 5, 4, 1],
                status: "COMPLETED" as const,
                createdAt,
                completedAt,
                attempts: [
                    {
                        id: "attempt-1",
                        expression: "1 + 2 + 3 + 4",
                        isCorrect: false,
                        createdAt,
                    },
                    {
                        id: "attempt-2",
                        expression: "(3 + 5) * (4 - 1)",
                        isCorrect: true,
                        createdAt: completedAt,
                    },
                ],
            }),
            update: async (_args: {
                where: { id: string };
                data: {
                    status?: "COMPLETED";
                    completedAt?: Date;
                };
            }) => ({}),
        },
        gameAttempt: {
            create: async (_args: {
                data: {
                    gameId: string;
                    expression: string;
                    isCorrect: boolean;
                };
            }) => ({}),
        },
    };

    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/games/test-game-id`, {
            headers: {
                "X-Session-Id": "test-session-id",
            },
        });

        assert.equal(response.status, 200);

        const body = await response.json() as {
            id: string;
            numbers: number[];
            status: string;
            createdAt: string;
            completedAt: string | null;
            attempts: {
                id: string;
                expression: string;
                isCorrect: boolean;
                createdAt: string;
            }[];
        };

        assert.equal(body.id, "test-game-id");
        assert.deepEqual(body.numbers, [3, 5, 4, 1]);
        assert.equal(body.status, "COMPLETED");
        assert.equal(body.createdAt, createdAt.toISOString());
        assert.equal(body.completedAt, completedAt.toISOString());
        assert.equal(body.attempts.length, 2);
        assert.equal(body.attempts[0].isCorrect, false);
        assert.equal(body.attempts[1].isCorrect, true);
    }, createApp(fakeStore));
});

test("GET /api/games/:id returns 404 when the game does not exist", async () => {
    const fakeStore = {
        game: {
            create: async (_args: { data: { numbers: number[] } }) => ({
                id: "test-game-id",
                sessionId: "test-session-id",
            }),
            findUnique: async (_args: {
                where: { id: string };
                include?: {
                    attempts: {
                        orderBy: { createdAt: "asc" };
                    };
                };
            }) => null,
            update: async (_args: {
                where: { id: string };
                data: {
                    status?: "COMPLETED";
                    completedAt?: Date;
                };
            }) => ({}),
        },
        gameAttempt: {
            create: async (_args: {
                data: {
                    gameId: string;
                    expression: string;
                    isCorrect: boolean;
                };
            }) => ({}),
        },
    };

    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/games/nonexistent-id`, {
            headers: {
                "X-Session-Id": "test-session-id",
            },
        });

        assert.equal(response.status, 404);

        const body = await response.json() as {
            message: string;
        };

        assert.equal(body.message, "Game not found.");
    }, createApp(fakeStore));
});

test("rejects an invalid game history limit", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(
            `${baseUrl}/api/games?limit=101`, {
            headers: {
                "X-Session-Id": "test-session-id",
            },
        });

        assert.equal(response.status, 400);

        const body = await response.json() as {
            message: string;
        };

        assert.equal(
            body.message,
            "limit must be between 1 and 100.",
        );
    });
});

test("lists recent games with their attempt counts", async () => {
    const fakeStore = {
        game: {
            create: async () => ({ id: "new-game" }),
            update: async () => ({}),
            findUnique: async () => null,
            findMany: async (args: {
                take: number;
                skip?: number;
                cursor?: { id: string };
            }) => {
                const allGames = [
                    {
                        id: "game-2",
                        numbers: [7, 7, 3, 10],
                        status: "COMPLETED" as const,
                        createdAt: new Date("2026-10-25T12:00:00Z"),
                        completedAt: new Date("2026-10-25T12:01:00Z"),
                        _count: { attempts: 2 },
                    },
                    {
                        id: "game-1",
                        numbers: [1, 2, 3, 4],
                        status: "IN_PROGRESS" as const,
                        createdAt: new Date("2026-10-24T12:00:00Z"),
                        completedAt: null,
                        _count: { attempts: 0 },
                    },
                ];

                let startIndex = 0;

                if (args.cursor) {
                    const cursorIndex = allGames.findIndex(
                        (game) => game.id === args.cursor?.id,
                    );

                    if (cursorIndex === -1) {
                        const error = new Error("Cursor not found") as Error & {
                            code: string;
                        };
                        error.code = "P2025";
                        throw error;
                    }

                    startIndex = cursorIndex + (args.skip ?? 0);
                }

                return allGames.slice(startIndex, startIndex + args.take);
            },

        },
        gameAttempt: {
            create: async () => ({}),
        },
    };

    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/games`, {
            headers: {
                "X-Session-Id": "test-session-id",
            },
        });
        const body = await response.json() as {
            games: {
                id: string;
                numbers: number[];
                status: string;
                attemptCount: number;
            }[];
            hasMore: boolean;
            nextCursor: string | null;
        };

        assert.equal(response.status, 200);
        assert.equal(body.games.length, 2);
        assert.equal(body.games[0].id, "game-2");
        assert.equal(body.games[0].attemptCount, 2);
        assert.equal(body.games[1].id, "game-1");
        assert.equal(body.games[1].attemptCount, 0);
        assert.equal(body.hasMore, false);
        assert.equal(body.nextCursor, null);
    }, createApp(fakeStore));
});

test("returns game statistics", async () => {
    const fakeStore = {
        game: {
            create: async () => ({ id: "new-game" }),
            update: async () => ({}),
            findUnique: async () => null,
            findMany: async () => [],
            count: async (args?: {
                where?: {
                    status?: "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
                };
            }) => {
                if (args?.where?.status === "COMPLETED") return 18;
                if (args?.where?.status === "IN_PROGRESS") return 5;
                if (args?.where?.status === "ABANDONED") return 2;
                return 25;
            },
        },
        gameAttempt: {
            create: async () => ({}),
            count: async (args?: { where?: { isCorrect?: boolean } }) => {
                if (args?.where?.isCorrect === true) return 18;
                return 60;
            },
        },
    };

    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/stats`, {
            headers: {
                "X-Session-Id": "test-session-id",
            },
        });
        const body = await response.json() as {
            totalGames: number;
            completedGames: number;
            inProgressGames: number;
            abandonedGames: number;
            totalAttempts: number;
            correctAttempts: number;
            accuracyPercent: number;
        };

        assert.equal(response.status, 200);
        assert.equal(body.totalGames, 25);
        assert.equal(body.completedGames, 18);
        assert.equal(body.inProgressGames, 5);
        assert.equal(body.abandonedGames, 2);
        assert.equal(body.totalAttempts, 60);
        assert.equal(body.correctAttempts, 18);
        assert.equal(body.accuracyPercent, 30);
    }, createApp(fakeStore));
});

test("returns zero accuracy when there are no attempts", async () => {
    const fakeStore = {
        game: {
            create: async () => ({ id: "new-game" }),
            update: async () => ({}),
            findUnique: async () => null,
            findMany: async () => [],
            count: async (args?: {
                where?: {
                    status?: "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
                };
            }) => {
                if (args?.where?.status === "COMPLETED") return 0;
                if (args?.where?.status === "IN_PROGRESS") return 1;
                if (args?.where?.status === "ABANDONED") return 0;
                return 1;
            },
        },
        gameAttempt: {
            create: async () => ({}),
            count: async () => 0,
        },
    };

    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/stats`, {
            headers: {
                "X-Session-Id": "test-session-id",
            },
        });
        const body = await response.json() as {
            totalAttempts: number;
            accuracyPercent: number;
        };

        assert.equal(response.status, 200);
        assert.equal(body.totalAttempts, 0);
        assert.equal(body.accuracyPercent, 0);
    }, createApp(fakeStore));
});

test("paginates game history using a cursor", async () => {
    const allGames = [
        {
            id: "game-3",
            numbers: [3, 4, 5, 6],
            status: "COMPLETED" as const,
            createdAt: new Date("2026-10-26T12:00:00Z"),
            completedAt: new Date("2026-10-26T12:01:00Z"),
            _count: { attempts: 1 },
        },
        {
            id: "game-2",
            numbers: [7, 7, 3, 10],
            status: "IN_PROGRESS" as const,
            createdAt: new Date("2026-10-25T12:00:00Z"),
            completedAt: null,
            _count: { attempts: 0 },
        },
        {
            id: "game-1",
            numbers: [1, 2, 3, 4],
            status: "COMPLETED" as const,
            createdAt: new Date("2026-10-24T12:00:00Z"),
            completedAt: new Date("2026-10-24T12:01:00Z"),
            _count: { attempts: 2 },
        },
    ];

    const fakeStore = {
        game: {
            create: async () => ({ id: "new-game" }),
            update: async () => ({}),
            findUnique: async () => null,
            findMany: async (args: {
                take: number;
                skip?: number;
                cursor?: { id: string };
            }) => {
                let startIndex = 0;

                if (args.cursor) {
                    const cursorIndex = allGames.findIndex(
                        (game) => game.id === args.cursor?.id,
                    );

                    if (cursorIndex === -1) {
                        const error = new Error("Cursor not found") as Error & {
                            code: string;
                        };
                        error.code = "P2025";
                        throw error;
                    }

                    startIndex = cursorIndex + (args.skip ?? 0);
                }

                return allGames.slice(
                    startIndex,
                    startIndex + args.take,
                );
            },
        },
        gameAttempt: {
            create: async () => ({}),
        },
    };

    await withServer(async (baseUrl) => {
        const firstResponse = await fetch(
            `${baseUrl}/api/games?limit=2`, {
            headers: {
                "X-Session-Id": "test-session-id",
            },
        });
        const firstBody = await firstResponse.json() as {
            games: { id: string }[];
            nextCursor: string | null;
            hasMore: boolean;
        };

        assert.equal(firstResponse.status, 200);
        assert.deepEqual(
            firstBody.games.map((game) => game.id),
            ["game-3", "game-2"],
        );
        assert.equal(firstBody.hasMore, true);
        assert.equal(firstBody.nextCursor, "game-2");

        const secondResponse = await fetch(
            `${baseUrl}/api/games?limit=2&cursor=${firstBody.nextCursor}`, {
            headers: {
                "X-Session-Id": "test-session-id",
            },
        });
        const secondBody = await secondResponse.json() as {
            games: { id: string }[];
            nextCursor: string | null;
            hasMore: boolean;
        };

        assert.equal(secondResponse.status, 200);
        assert.deepEqual(
            secondBody.games.map((game) => game.id),
            ["game-1"],
        );
        assert.equal(secondBody.hasMore, false);
        assert.equal(secondBody.nextCursor, null);
    }, createApp(fakeStore));
});

test("rejects an unknown game history cursor", async () => {
    const fakeStore = {
        game: {
            create: async () => ({ id: "new-game" }),
            update: async () => ({}),
            findUnique: async () => null,
            findMany: async () => {
                const error = new Error("Cursor not found") as Error & {
                    code: string;
                };
                error.code = "P2025";
                throw error;
            },
        },
        gameAttempt: {
            create: async () => ({}),
        },
    };

    await withServer(async (baseUrl) => {
        const response = await fetch(
            `${baseUrl}/api/games?cursor=nonexistent-id`, {
            headers: {
                "X-Session-Id": "test-session-id",
            },
        });

        const body = await response.json() as {
            message: string;
        };

        assert.equal(response.status, 400);
        assert.equal(
            body.message,
            "Invalid cursor. The referenced game was not found.",
        );
    }, createApp(fakeStore));
});
