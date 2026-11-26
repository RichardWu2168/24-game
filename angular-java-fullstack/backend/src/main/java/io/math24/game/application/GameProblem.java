package io.math24.game.application;

/** Deliberate application failure with a safe public message and stable code. */
public final class GameProblem extends RuntimeException {
    private final int status;
    private final String code;

    public GameProblem(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public int status() {
        return status;
    }

    public String code() {
        return code;
    }
}
