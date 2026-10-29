import { test } from "node:test";
import assert from "node:assert/strict";
import { createGameService } from "./game.service.js";
import { GameError } from "./game.errors.js";
import type { GameRepository } from "./game.types.js";

function repository(overrides: Partial<GameRepository> = {}): GameRepository {
    const unexpected = async (): Promise<never> => { throw new Error("Unexpected repository operation"); };
    const result: GameRepository = {
        inSession: async (_session, work) => work(result),
        ensureSession: unexpected, findActiveGame: unexpected, findGame: unexpected,
        createGame: unexpected, abandonGame: unexpected, completeGame: unexpected,
        createAttempt: unexpected, listGames: unexpected, getCounts: unexpected, deleteFinishedGames: unexpected, recordGotIt: unexpected,
        ...overrides,
    };
    return result;
}

test("clearing history deletes through the transaction-scoped repository", async () => {
    const transaction = repository({ deleteFinishedGames: async sessionId => { assert.equal(sessionId, "owner"); return 3; } });
    const outer = repository({ inSession: async (sessionId, work) => { assert.equal(sessionId, "owner"); return work(transaction); } });
    assert.deepEqual(await createGameService(outer).clearHistory("owner"), { deletedGames: 3 });
});

test("saved answer operations use the transaction repository rather than the outer repository", async () => {
    const writes: string[] = [];
    const transaction = repository({
        findGame: async () => ({ id: "game", sessionId: "owner", numbers: [3, 5, 4, 1], status: "IN_PROGRESS" }),
        createAttempt: async (id, expression, correct) => {
            assert.equal(id, "game");
            assert.equal(expression, "(3+5)*(4-1)");
            assert.equal(correct, true);
            writes.push("attempt");
        },
        completeGame: async (sessionId, id) => {
            assert.equal(sessionId, "owner");
            assert.equal(id, "game");
            writes.push("completed");
        },
    });
    const outer = repository({
        inSession: async (sessionId, work) => {
            assert.equal(sessionId, "owner");
            return work(transaction);
        },
    });
    const result = await createGameService(outer).submitAnswer({ durationSeconds: 18, gameId: "game", numbers: [3, 5, 4, 1], expression: "(3+5)*(4-1)" }, "owner");
    assert.equal(result.valid, true);
    assert.deepEqual(writes, ["attempt", "completed"]);
});

test("a stateless answer needs neither a session nor database operations", async () => {
    const service = createGameService(repository({ inSession: async () => { throw new Error("Unexpected transaction"); } }));
    const result = await service.submitAnswer({ numbers: [3, 5, 4, 1], expression: "(3+5)*(4-1)" });
    assert.equal(result.valid, true);
});

test("the service rejects cross-session ownership before writing an attempt", async () => {
    const service = createGameService(repository({
        findGame: async () => ({ id: "game", sessionId: "owner", numbers: [3, 5, 4, 1], status: "IN_PROGRESS" }),
    }));
    await assert.rejects(
        service.submitAnswer({ durationSeconds: 18, gameId: "game", numbers: [3, 5, 4, 1], expression: "(3+5)*(4-1)" }, "other"),
        (error: unknown) => error instanceof GameError && error.code === "NOT_FOUND",
    );
});

test("resuming an active game does not create or abandon a game", async () => {
    const startedAt = new Date("2026-01-01T00:00:00Z");
    const service = createGameService(repository({
        ensureSession: async () => {},
        findActiveGame: async () => ({ id: "existing", numbers: [1, 2, 3, 4], createdAt: startedAt }),
    }));
    assert.deepEqual(await service.getPuzzle("owner", false), { gameId: "existing", numbers: [1, 2, 3, 4], startedAt, gotItAt: null, capturedDurationSeconds: null });
});

test("Got It captures thinking time once and duration stays null until a correct answer", async () => {
    const createdAt = new Date(Date.now() - 100_000);
    const game = { id: "game", sessionId: "owner", numbers: [3, 5, 4, 1], status: "IN_PROGRESS" as "IN_PROGRESS" | "COMPLETED", createdAt, gotItAt: null as Date | null, durationSeconds: null as number | null, capturedDurationSeconds: null as number | null };
    const service = createGameService(repository({
        findGame: async () => game,
        recordGotIt: async (_session, _id, gotItAt, duration) => { game.gotItAt = gotItAt; game.capturedDurationSeconds = duration; },
        createAttempt: async () => {},
        completeGame: async (_session, _id, duration) => { game.status = "COMPLETED"; game.durationSeconds = duration; },
    }));
    const captured = await service.recordGotIt("owner", "game", 18.125);
    assert.ok(captured.gotItAt instanceof Date);
    assert.equal(captured.capturedDurationSeconds, 18);
    assert.equal(game.status, "IN_PROGRESS");
    assert.equal(game.durationSeconds, null);
    assert.deepEqual(await service.recordGotIt("owner", "game", 99), captured);
    await service.submitAnswer({ durationSeconds: 18, gameId: "game", numbers: game.numbers, expression: "3+5+4+1" }, "owner");
    assert.equal(game.durationSeconds, null);
    await service.submitAnswer({ durationSeconds: 18, gameId: "game", numbers: game.numbers, expression: "(3+5)*(4-1)" }, "owner");
    assert.equal(game.status, "COMPLETED");
    assert.equal(game.durationSeconds, 18);
});

test("Got It validates ownership and status without comparing the UI timer to server timestamps", async () => {
    const game = { id: "game", sessionId: "owner", numbers: [1, 2, 3, 4], status: "IN_PROGRESS" as "IN_PROGRESS" | "ABANDONED", createdAt: new Date(Date.now() - 1000) };
    const service = createGameService(repository({ findGame: async () => game, recordGotIt: async () => {} }));
    await assert.rejects(service.recordGotIt("other", "game", 0), (error: unknown) => error instanceof GameError && error.code === "NOT_FOUND");
    assert.equal((await service.recordGotIt("owner", "game", 100)).capturedDurationSeconds, 100);
    game.status = "ABANDONED";
    await assert.rejects(service.recordGotIt("owner", "game", 0), (error: unknown) => error instanceof GameError && error.code === "NOT_IN_PROGRESS");
});

test("completion floors captured elapsed time to whole seconds before persistence", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    for (const [milliseconds, expected] of [[0, 0], [999, 0], [18_125, 18], [18_999, 18], [155_999, 155]]) {
        let saved: number | null | undefined;
        const service = createGameService(repository({
            findGame: async () => ({ id: "game", sessionId: "owner", numbers: [3, 5, 4, 1], status: "IN_PROGRESS", createdAt, gotItAt: new Date(), capturedDurationSeconds: expected }),
            createAttempt: async () => {},
            completeGame: async (_session, _game, duration) => { saved = duration; },
        }));
        await service.submitAnswer({ durationSeconds: 18, gameId: "game", numbers: [3, 5, 4, 1], expression: "(3+5)*(4-1)" }, "owner");
        assert.equal(saved, expected);
        assert.equal(Number.isInteger(saved), true);
    }
});

test("a correct answer without Got It stores the UI duration regardless of server time", async t => {
    const now = Date.parse("2026-10-28T12:00:18.999Z");
    t.mock.method(Date, "now", () => now);
    let duration: number | null = null;
    const service = createGameService(repository({
        findGame: async () => ({ id: "game", sessionId: "owner", numbers: [3, 5, 4, 1], status: "IN_PROGRESS", createdAt: new Date(now - 600_000), gotItAt: null }),
        createAttempt: async () => {},
        completeGame: async (_session, _id, seconds) => { duration = seconds; },
    }));
    await service.submitAnswer({ durationSeconds: 18, gameId: "game", numbers: [3, 5, 4, 1], expression: "3+5+4+1" }, "owner");
    assert.equal(duration, null);
    const result = await service.submitAnswer({ durationSeconds: 18.999, gameId: "game", numbers: [3, 5, 4, 1], expression: "(3+5)*(4-1)" }, "owner");
    assert.equal(result.valid, true);
    assert.equal(duration, 18);
});

test("a saved game cannot be completed without a UI duration or a captured UI time", async () => {
    const service = createGameService(repository({
        findGame: async () => ({ id: "game", sessionId: "owner", numbers: [3, 5, 4, 1], status: "IN_PROGRESS", createdAt: new Date("2000-01-01") }),
    }));
    await assert.rejects(service.submitAnswer({ gameId: "game", numbers: [3, 5, 4, 1], expression: "(3+5)*(4-1)" }, "owner"),
        (error: unknown) => error instanceof GameError && error.code === "INVALID_DURATION");
});
