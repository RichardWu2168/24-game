export class GameError extends Error {
    constructor(
        public readonly code: "NOT_FOUND" | "NUMBERS_MISMATCH" | "NOT_IN_PROGRESS" | "INVALID_CURSOR" | "LIST_UNAVAILABLE" | "INVALID_DURATION",
        message: string,
    ) {
        super(message);
    }
}

export class GameRepositoryError extends Error {
    constructor(public readonly code: "CURSOR_NOT_FOUND" | "LIST_UNAVAILABLE") {
        super(code);
    }
}
