package io.math24.game.api;

import java.util.UUID;

import io.math24.game.domain.GameRules;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Transport input models. Null durations must not silently become zero. */
public final class GameRequests {
    private GameRequests() {
    }

    public record Operation(@NotNull UUID operationId) {
    }

    public record Timing(
            @NotNull UUID operationId,
            @NotNull @Min(0) @Max(1_800_000) Long thinkingTimeMs) {
    }

    public record Answer(
            @NotNull UUID operationId,
            @NotNull @Size(max = GameRules.MAX_EXPRESSION_LENGTH)
            @Pattern(regexp = "[^\\x00]*", message = "An expression must not contain a NUL character.")
            String expression,
            @NotNull @Min(0) @Max(1_800_000) Long thinkingTimeMs) {
    }
}
