// Database client contract used by the repository and test adapters.
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
        deleteMany?(args: { where: { sessionId: string; status: { in: ("COMPLETED" | "ABANDONED")[] } } }): Promise<{ count: number }>;
        create(args: {
            data: {
                numbers: number[];
                session: {
                    connect: { id: string };
                };
            };
        }): Promise<{ id: string; createdAt?: Date }>;

        update(args: {
            where: { id: string; status?: "IN_PROGRESS"; sessionId?: string };
            data: {
                status?: "COMPLETED" | "ABANDONED";
                completedAt?: Date;
                gotItAt?: Date;
                durationSeconds?: number | null;
                capturedDurationSeconds?: number | null;
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
            gotItAt?: Date | null;
            durationSeconds?: number | null;
            capturedDurationSeconds?: number | null;
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
            createdAt?: Date;
            gotItAt?: Date | null;
            capturedDurationSeconds?: number | null;
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
            durationSeconds?: number | null;
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
