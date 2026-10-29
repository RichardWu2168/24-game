import { checkAnswer } from "./answerChecker.js";
import { generatePuzzle } from "./puzzleGenerator.js";
import { GameError, GameRepositoryError } from "./game.errors.js";
import type { AnswerInput, GamePageInput, GameRepository } from "./game.types.js";

function wholeSeconds(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 2147483647) {
        throw new GameError("INVALID_DURATION", "Please provide a valid durationSeconds from the UI timer.");
    }
    return Math.floor(value);
}

export function createGameService(repository: GameRepository) {
    return {
        async clearHistory(sessionId: string) {
            return repository.inSession(sessionId, async (transaction) => ({
                deletedGames: await transaction.deleteFinishedGames(sessionId),
            }));
        },
        async getPuzzle(sessionId: string, forceNew: boolean) {
            return repository.inSession(sessionId, async (transaction) => {
                await transaction.ensureSession(sessionId);
                const active = await transaction.findActiveGame(sessionId);
                if (active && !forceNew) return { numbers: active.numbers, gameId: active.id, startedAt: active.createdAt ?? new Date(), gotItAt: active.gotItAt ?? null, capturedDurationSeconds: active.capturedDurationSeconds ?? null };
                if (active) await transaction.abandonGame(sessionId, active.id);
                const numbers = generatePuzzle();
                const game = await transaction.createGame(sessionId, numbers);
                return { numbers, gameId: game.id, startedAt: game.createdAt ?? new Date(), gotItAt: null, capturedDurationSeconds: null };
            });
        },

        async recordGotIt(sessionId: string, gameId: string, durationSeconds: number) {
            return repository.inSession(sessionId, async transaction => {
                const game = await transaction.findGame(gameId);
                if (!game || game.sessionId !== sessionId) throw new GameError("NOT_FOUND", "Game not found.");
                if (game.status !== "IN_PROGRESS") throw new GameError("NOT_IN_PROGRESS", "This game is not in progress.");
                const capturedDurationSeconds = wholeSeconds(durationSeconds);
                if (game.capturedDurationSeconds != null) {
                    return { gotItAt: game.gotItAt, capturedDurationSeconds: game.capturedDurationSeconds };
                }
                const gotItAt = new Date();
                await transaction.recordGotIt(sessionId, gameId, gotItAt, capturedDurationSeconds);
                return { gotItAt, capturedDurationSeconds };
            });
        },

        async submitAnswer(input: AnswerInput, sessionId?: string) {
            // The API also supports checking an expression without a saved game.
            if (input.gameId === undefined) return checkAnswer(input.expression, input.numbers);
            if (!sessionId) throw new Error("A saved answer requires a validated session.");
            const gameId = input.gameId;
            return repository.inSession(sessionId, async (transaction) => {
                const game = await transaction.findGame(gameId);
                if (!game || game.sessionId !== sessionId) throw new GameError("NOT_FOUND", "Game not found.");
                if (game.numbers.length !== input.numbers.length || !game.numbers.every((number, index) => number === input.numbers[index])) {
                    throw new GameError("NUMBERS_MISMATCH", "Submitted numbers do not match the saved game.");
                }
                if (game.status !== "IN_PROGRESS") throw new GameError("NOT_IN_PROGRESS", "This game is not in progress.");
                const result = checkAnswer(input.expression, game.numbers);
                const durationSeconds = result.valid
                    ? game.capturedDurationSeconds ?? wholeSeconds(input.durationSeconds) : null;
                await transaction.createAttempt(gameId, input.expression, result.valid);
                if (result.valid) {
                    // The UI timer owns elapsed time. Never derive a duration
                    // from creation/completion timestamps or the server clock.
                    await transaction.completeGame(sessionId, gameId, durationSeconds);
                }
                return result;
            });
        },

        async getGame(sessionId: string, gameId: string) {
            const game = await repository.findGame(gameId, true);
            if (!game || game.sessionId !== sessionId) throw new GameError("NOT_FOUND", "Game not found.");
            return {
                id: game.id, numbers: game.numbers, status: game.status,
                createdAt: game.createdAt, completedAt: game.completedAt ?? null, durationSeconds: game.durationSeconds ?? null, attempts: game.attempts ?? [],
            };
        },

        async listGames(sessionId: string, page: GamePageInput) {
            try {
                const games = await repository.listGames(sessionId, page);
                const hasMore = games.length > page.limit;
                const pageGames = hasMore ? games.slice(0, page.limit) : games;
                return {
                    games: pageGames, hasMore,
                    nextCursor: hasMore && pageGames.length > 0 ? pageGames[pageGames.length - 1].id : null,
                };
            } catch (error) {
                if (error instanceof GameRepositoryError) {
                    if (error.code === "CURSOR_NOT_FOUND") throw new GameError("INVALID_CURSOR", "Invalid cursor. The referenced game was not found.");
                    throw new GameError("LIST_UNAVAILABLE", "Game listing is unavailable.");
                }
                throw error;
            }
        },

        async getStats(sessionId: string) {
            const counts = await repository.getCounts(sessionId);
            return {
                ...counts,
                accuracyPercent: counts.totalAttempts === 0 ? 0 : Math.round(counts.correctAttempts / counts.totalAttempts * 100),
            };
        },
    };
}

export type GameService = ReturnType<typeof createGameService>;
