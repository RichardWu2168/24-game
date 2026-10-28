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
        createAttempt: unexpected, listGames: unexpected, getCounts: unexpected,
        ...overrides,
    };
    return result;
}

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
    const result = await createGameService(outer).submitAnswer({ gameId: "game", numbers: [3, 5, 4, 1], expression: "(3+5)*(4-1)" }, "owner");
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
        service.submitAnswer({ gameId: "game", numbers: [3, 5, 4, 1], expression: "(3+5)*(4-1)" }, "other"),
        (error: unknown) => error instanceof GameError && error.code === "NOT_FOUND",
    );
});

test("resuming an active game does not create or abandon a game", async () => {
    const service = createGameService(repository({
        ensureSession: async () => {},
        findActiveGame: async () => ({ id: "existing", numbers: [1, 2, 3, 4] }),
    }));
    assert.deepEqual(await service.getPuzzle("owner", false), { gameId: "existing", numbers: [1, 2, 3, 4] });
});
