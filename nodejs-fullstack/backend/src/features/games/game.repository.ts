import { prisma } from "../../database/prisma.js";
import { withSessionTransaction } from "../../database/transaction.js";
import type { GameStore } from "../../database/gameStore.js";
import type { GamePageInput, GameRepository, GameStatus } from "./game.types.js";
import { GameRepositoryError } from "./game.errors.js";

export function createGameRepository(store: GameStore = prisma): GameRepository {
    return {
        async deleteFinishedGames(sessionId) {
            if (!store.game.deleteMany) throw new Error("Clearing game history is unavailable.");
            // GameAttempt rows are removed by the database's ON DELETE CASCADE.
            const result = await store.game.deleteMany({ where: { sessionId, status: { in: ["COMPLETED", "ABANDONED"] } } });
            return result.count;
        },
        async inSession(sessionId, work) {
            if (Object.is(store, prisma)) {
                return withSessionTransaction(sessionId, tx => work(createGameRepository(tx)));
            }
            if (store.withSessionTransaction) {
                return store.withSessionTransaction(sessionId, tx => work(createGameRepository(tx)));
            }
            // Lightweight test adapters may not need a database transaction.
            return work(createGameRepository(store));
        },
        async ensureSession(sessionId) {
            if (!store.gameSession) throw new Error("Session store is not configured.");
            await store.gameSession.upsert({ where: { id: sessionId }, create: { id: sessionId }, update: {} });
        },
        async findActiveGame(sessionId) {
            if (!store.game.findFirst) throw new Error("Game store does not support finding active games.");
            return store.game.findFirst({ where: { sessionId, status: "IN_PROGRESS" } });
        },
        async findGame(id, withAttempts = false) {
            return store.game.findUnique({
                where: { id },
                ...(withAttempts ? { include: { attempts: { orderBy: { createdAt: "asc" as const } } } } : {}),
            });
        },
        async createGame(sessionId, numbers) {
            return store.game.create({ data: { numbers, session: { connect: { id: sessionId } } } });
        },
        async abandonGame(sessionId, gameId) {
            await store.game.update({ where: { id: gameId, status: "IN_PROGRESS", sessionId }, data: { status: "ABANDONED" } });
        },
        async recordGotIt(sessionId, gameId, gotItAt, capturedDurationSeconds) {
            await store.game.update({ where: { id: gameId, sessionId, status: "IN_PROGRESS" }, data: { gotItAt, capturedDurationSeconds } });
        },
        async completeGame(sessionId, gameId, durationSeconds) {
            await store.game.update({
                where: { id: gameId, status: "IN_PROGRESS", sessionId },
                data: { status: "COMPLETED", completedAt: new Date(), durationSeconds },
            });
        },
        async createAttempt(gameId, expression, isCorrect) {
            await store.gameAttempt.create({ data: { gameId, expression, isCorrect } });
        },
        async listGames(sessionId: string, { limit, cursor }: GamePageInput) {
            if (!store.game.findMany) throw new GameRepositoryError("LIST_UNAVAILABLE");
            // findMany returns an empty page for a missing cursor. Validate it
            // explicitly, including ownership, before using it as a position.
            if (cursor) {
                const game = await store.game.findUnique({ where: { id: cursor } });
                if (!game || game.sessionId !== sessionId) throw new GameRepositoryError("CURSOR_NOT_FOUND");
            }
            try {
                const games = await store.game.findMany({
                    where: { sessionId }, take: limit + 1,
                    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
                    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                    include: { _count: { select: { attempts: true } } },
                });
                return games.map(({ _count, ...game }) => ({ ...game, durationSeconds: game.durationSeconds ?? null, attemptCount: _count.attempts }));
            } catch (error) {
                if (cursor && typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
                    throw new GameRepositoryError("CURSOR_NOT_FOUND");
                }
                throw error;
            }
        },
        async getCounts(sessionId) {
            if (!store.game.count || !store.gameAttempt.count) throw new Error("Game statistics are unavailable.");
            const countGames = (status?: GameStatus) => store.game.count!({ where: { sessionId, ...(status ? { status } : {}) } });
            const [totalGames, completedGames, inProgressGames, abandonedGames, totalAttempts, correctAttempts] = await Promise.all([
                countGames(), countGames("COMPLETED"), countGames("IN_PROGRESS"), countGames("ABANDONED"),
                store.gameAttempt.count({ where: { game: { sessionId } } }),
                store.gameAttempt.count({ where: { isCorrect: true, game: { sessionId } } }),
            ]);
            return { totalGames, completedGames, inProgressGames, abandonedGames, totalAttempts, correctAttempts };
        },
    };
}
