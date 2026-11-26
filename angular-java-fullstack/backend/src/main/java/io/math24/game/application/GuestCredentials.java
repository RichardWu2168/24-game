package io.math24.game.application;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.HexFormat;
import java.util.regex.Pattern;

/** Validates the client-generated secret and retains only its digest. */
final class GuestCredentials {
    private static final Pattern TOKEN = Pattern.compile("[A-Za-z0-9_-]{43}");

    private GuestCredentials() {
    }

    static String hash(String token) {
        if (token == null || !TOKEN.matcher(token).matches()) {
            throw unauthorized();
        }
        byte[] bytes;
        try {
            bytes = Base64.getUrlDecoder().decode(token);
        } catch (IllegalArgumentException invalidEncoding) {
            throw unauthorized();
        }
        if (bytes.length != 32
                || !Base64.getUrlEncoder().withoutPadding().encodeToString(bytes).equals(token)) {
            throw unauthorized();
        }
        return digest(bytes);
    }

    static String digest(byte[] value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
        } catch (NoSuchAlgorithmException unavailable) {
            throw new IllegalStateException("SHA-256 is unavailable.", unavailable);
        }
    }

    static GameProblem unauthorized() {
        return new GameProblem(401, "UNAUTHORIZED", "A valid guest credential is required.");
    }
}
