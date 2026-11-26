package io.math24.game.api;

import io.math24.game.application.GameProblem;

/** Extracts the header credential without including it in error details. */
final class GuestAuthorization {
    private GuestAuthorization() {
    }

    static String token(String authorization) {
        if (authorization == null || authorization.length() != 50
                || !authorization.regionMatches(true, 0, "Bearer ", 0, 7)) {
            throw new GameProblem(401, "UNAUTHORIZED", "A valid guest credential is required.");
        }
        // The application layer validates the canonical 32-byte token encoding.
        return authorization.substring(7);
    }
}
