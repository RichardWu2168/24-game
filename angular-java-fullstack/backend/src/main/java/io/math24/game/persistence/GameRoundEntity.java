package io.math24.game.persistence;

import io.math24.game.application.RoundOutcome;
import io.math24.game.application.TimingStatus;
import io.math24.game.domain.Puzzle;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "game_round")
public class GameRoundEntity {
    @Id
    private UUID id;

    @Column(name = "session_id", nullable = false, updatable = false)
    private UUID sessionId;

    @Column(name = "card_1", nullable = false, updatable = false)
    private int card1;
    @Column(name = "card_2", nullable = false, updatable = false)
    private int card2;
    @Column(name = "card_3", nullable = false, updatable = false)
    private int card3;
    @Column(name = "card_4", nullable = false, updatable = false)
    private int card4;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private RoundOutcome outcome;

    @Enumerated(EnumType.STRING)
    @Column(name = "timing_status", nullable = false, length = 16)
    private TimingStatus timingStatus;

    @Column(name = "thinking_time_ms")
    private Long thinkingTimeMs;

    @Version
    @Column(nullable = false)
    private Long revision;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "accepted_expression", length = 1024)
    private String acceptedExpression;

    @Column(nullable = false)
    private boolean assisted;

    @Column(name = "revealed_solution", length = 1024)
    private String revealedSolution;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    protected GameRoundEntity() {
    }

    public GameRoundEntity(UUID id, UUID sessionId, Puzzle puzzle, Instant createdAt) {
        this.id = id;
        this.sessionId = sessionId;
        this.card1 = puzzle.cards().get(0);
        this.card2 = puzzle.cards().get(1);
        this.card3 = puzzle.cards().get(2);
        this.card4 = puzzle.cards().get(3);
        this.outcome = RoundOutcome.ACTIVE;
        this.timingStatus = TimingStatus.NOT_CAPTURED;
        this.createdAt = createdAt;
    }

    public void captureTiming(long thinkingTimeMs, TimingStatus timingStatus) {
        this.thinkingTimeMs = thinkingTimeMs;
        this.timingStatus = timingStatus;
    }

    public int recordAttempt() {
        attemptCount = Math.incrementExact(attemptCount);
        return attemptCount;
    }

    public void solve(String expression, boolean assisted, Instant completedAt) {
        this.outcome = RoundOutcome.SOLVED;
        this.acceptedExpression = expression;
        this.assisted = assisted;
        this.completedAt = completedAt;
    }

    public void reveal(String solution, Instant completedAt) {
        this.outcome = RoundOutcome.REVEALED;
        this.revealedSolution = solution;
        this.completedAt = completedAt;
    }

    public void skip(Instant completedAt) {
        this.outcome = RoundOutcome.SKIPPED;
        this.completedAt = completedAt;
    }

    public UUID id() { return id; }
    public UUID sessionId() { return sessionId; }
    public List<Integer> cards() { return List.of(card1, card2, card3, card4); }
    public Puzzle puzzle() { return Puzzle.of(card1, card2, card3, card4); }
    public RoundOutcome outcome() { return outcome; }
    public TimingStatus timingStatus() { return timingStatus; }
    public Long thinkingTimeMs() { return thinkingTimeMs; }
    public long revision() { return revision == null ? 0 : revision; }
    public int attemptCount() { return attemptCount; }
    public String acceptedExpression() { return acceptedExpression; }
    public boolean assisted() { return assisted; }
    public String revealedSolution() { return revealedSolution; }
    public Instant createdAt() { return createdAt; }
    public Instant completedAt() { return completedAt; }
}
