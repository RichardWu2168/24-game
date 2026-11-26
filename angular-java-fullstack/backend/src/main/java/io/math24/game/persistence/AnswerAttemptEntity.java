package io.math24.game.persistence;

import io.math24.game.domain.AnswerResult;
import io.math24.game.domain.AnswerStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "answer_attempt")
public class AnswerAttemptEntity {
    @Id
    private UUID id;

    @Column(name = "round_id", nullable = false, updatable = false)
    private UUID roundId;
    @Column(name = "operation_id", nullable = false, updatable = false)
    private UUID operationId;
    @Column(name = "attempt_number", nullable = false, updatable = false)
    private int attemptNumber;
    @Column(name = "submitted_expression", nullable = false, length = 256, updatable = false)
    private String submittedExpression;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32, updatable = false)
    private AnswerStatus status;

    @Column(name = "interpreted_expression", length = 1024, updatable = false)
    private String interpretedExpression;
    @Column(name = "evaluated_value", updatable = false)
    private Integer evaluatedValue;
    @Column(nullable = false, updatable = false)
    private boolean assisted;
    @Column(nullable = false, length = 512, updatable = false)
    private String message;
    @Column(name = "submitted_at", nullable = false, updatable = false)
    private Instant submittedAt;

    protected AnswerAttemptEntity() {
    }

    public AnswerAttemptEntity(UUID id, UUID roundId, UUID operationId,
            int attemptNumber, AnswerResult result, Instant submittedAt) {
        this.id = id;
        this.roundId = roundId;
        this.operationId = operationId;
        this.attemptNumber = attemptNumber;
        this.submittedExpression = result.submittedExpression();
        this.status = result.status();
        this.interpretedExpression = result.interpretedExpression().orElse(null);
        this.evaluatedValue = result.value().isPresent() ? result.value().getAsInt() : null;
        this.assisted = result.assisted();
        this.message = result.message();
        this.submittedAt = submittedAt;
    }

    public UUID id() { return id; }
    public UUID roundId() { return roundId; }
    public UUID operationId() { return operationId; }
    public int attemptNumber() { return attemptNumber; }
    public String submittedExpression() { return submittedExpression; }
    public AnswerStatus status() { return status; }
    public String interpretedExpression() { return interpretedExpression; }
    public Integer value() { return evaluatedValue; }
    public boolean assisted() { return assisted; }
    public String message() { return message; }
    public Instant submittedAt() { return submittedAt; }
}
