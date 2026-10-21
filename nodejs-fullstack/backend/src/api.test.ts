
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import app, { errorHandler } from "./app.js";

async function withServer(
    run: (baseUrl: string) => Promise<void>,
    application: express.Express = app,
): Promise<void> {
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
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/puzzle`);

        assert.equal(response.status, 200);

        const body = await response.json() as {
            numbers: number[];
        };

        assert.equal(body.numbers.length, 4);
        assert.ok(body.numbers.every(
            (n) => Number.isInteger(n) && n >= 1 && n <= 10,
        ));

        const { canMake24 } = await import("./game.js");
        assert.equal(canMake24(body.numbers), true);
    });
});

test("POST /api/check-answer accepts a correct answer", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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
            headers: { "Content-Type": "application/json" },
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
            headers: { "Content-Type": "application/json" },
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
            headers: { "Content-Type": "application/json" },
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
            headers: { "Content-Type": "application/json" },
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
            headers: { "Content-Type": "application/json" },
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
            headers: { "Content-Type": "application/json" },
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
            headers: { "Content-Type": "application/json" },
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
});

test("missing request fields return 400", async () => {
    await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/check-answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
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
