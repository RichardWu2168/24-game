package io.math24.game.application;

import io.math24.game.domain.AnswerStatus;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Immutable application results, separate from database entities. */
public final class GameViews {
    private GameViews() {
    }

    public record SessionView(UUID sessionId, Instant createdAt, RoundView activeRound) {
    }

    public record RoundView(
            UUID roundId, UUID sessionId, List<Integer> cards, RoundOutcome outcome,
            TimingStatus timingStatus, Long thinkingTimeMs, long revision,
            int attemptCount, String acceptedExpression, boolean assisted,
            String revealedSolution, Instant createdAt, Instant completedAt) {
        public RoundView {
            cards = List.copyOf(cards);
        }
    }

    public record AttemptView(
            UUID attemptId, UUID operationId, UUID roundId, int attemptNumber,
            String submittedExpression, AnswerStatus status, String interpretedExpression,
            Integer value, boolean assisted, String message, Instant submittedAt) {
    }

    public record AnswerView(RoundView round, AttemptView attempt) {
    }

    public record PageView<T>(List<T> items, int page, int size, long totalElements) {
        public PageView {
            items = List.copyOf(items);
        }
    }

    public record StatisticsView(
            long totalRounds, long activeRounds, long solvedRounds, long revealedRounds,
            long skippedRounds, long timedSolvedRounds, long cappedSolvedRounds,
            Double averageThinkingTimeMs) {
    }
}
