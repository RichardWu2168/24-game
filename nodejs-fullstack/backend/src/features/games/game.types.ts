export type GameStatus = "IN_PROGRESS" | "COMPLETED" | "ABANDONED";

export interface AnswerInput {
    numbers: number[];
    expression: string;
    gameId?: string;
    durationSeconds?: number;
}

export interface GamePageInput {
    limit: number;
    cursor?: string;
}

export interface SavedGame {
    id: string;
    sessionId: string;
    numbers: number[];
    status: GameStatus;
    createdAt?: Date;
    completedAt?: Date | null;
    gotItAt?: Date | null;
    durationSeconds?: number | null;
    capturedDurationSeconds?: number | null;
    attempts?: { id: string; expression: string; isCorrect: boolean; createdAt: Date }[];
}

export interface GameSummary {
    id: string;
    numbers: number[];
    status: GameStatus;
    createdAt: Date;
    completedAt: Date | null;
    attemptCount: number;
    durationSeconds?: number | null;
}

export interface GameCounts {
    totalGames: number;
    completedGames: number;
    inProgressGames: number;
    abandonedGames: number;
    totalAttempts: number;
    correctAttempts: number;
}

// Services depend on business-oriented operations, not Prisma query objects.
export interface GameRepository {
    inSession<T>(sessionId: string, work: (repository: GameRepository) => Promise<T>): Promise<T>;
    ensureSession(sessionId: string): Promise<void>;
    findActiveGame(sessionId: string): Promise<{ id: string; numbers: number[]; createdAt?: Date; gotItAt?: Date | null; capturedDurationSeconds?: number | null } | null>;
    findGame(id: string, withAttempts?: boolean): Promise<SavedGame | null>;
    createGame(sessionId: string, numbers: number[]): Promise<{ id: string; createdAt?: Date }>;
    abandonGame(sessionId: string, gameId: string): Promise<void>;
    completeGame(sessionId: string, gameId: string, durationSeconds: number | null): Promise<void>;
    recordGotIt(sessionId: string, gameId: string, gotItAt: Date, durationSeconds: number): Promise<void>;
    createAttempt(gameId: string, expression: string, isCorrect: boolean): Promise<void>;
    listGames(sessionId: string, page: GamePageInput): Promise<GameSummary[]>;
    getCounts(sessionId: string): Promise<GameCounts>;
    deleteFinishedGames(sessionId: string): Promise<number>;
}
