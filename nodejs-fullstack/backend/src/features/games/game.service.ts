import { checkAnswer } from "./answerChecker.js";
import { generatePuzzle } from "./puzzleGenerator.js";
import { GameError, GameRepositoryError } from "./game.errors.js";
import type { AnswerInput, GamePageInput, GameRepository } from "./game.types.js";

export function createGameService(repository: GameRepository) {
    return {
        async getPuzzle(sessionId: string, forceNew: boolean) {
            return repository.inSession(sessionId, async (transaction) => {
                await transaction.ensureSession(sessionId);
                const active = await transaction.findActiveGame(sessionId);
                if (active && !forceNew) return { numbers: active.numbers, gameId: active.id };
                if (active) await transaction.abandonGame(sessionId, active.id);
                const numbers = generatePuzzle();
                const game = await transaction.createGame(sessionId, numbers);
                return { numbers, gameId: game.id };
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
                await transaction.createAttempt(gameId, input.expression, result.valid);
                if (result.valid) await transaction.completeGame(sessionId, gameId);
                return result;
            });
        },

        async getGame(sessionId: string, gameId: string) {
            const game = await repository.findGame(gameId, true);
            if (!game || game.sessionId !== sessionId) throw new GameError("NOT_FOUND", "Game not found.");
            return {
                id: game.id, numbers: game.numbers, status: game.status,
                createdAt: game.createdAt, completedAt: game.completedAt ?? null, attempts: game.attempts ?? [],
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
