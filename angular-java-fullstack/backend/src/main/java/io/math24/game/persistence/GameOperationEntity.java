package io.math24.game.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "game_operation")
public class GameOperationEntity {
    @Id
    private UUID id;
    @Column(name = "session_id", nullable = false, updatable = false)
    private UUID sessionId;
    @Column(name = "operation_id", nullable = false, updatable = false)
    private UUID operationId;
    @Column(nullable = false, length = 24, updatable = false)
    private String kind;
    @Column(name = "target_round_id", updatable = false)
    private UUID targetRoundId;
    @Column(name = "request_hash", nullable = false, length = 64, updatable = false)
    private String requestHash;
    @Column(name = "response_json", nullable = false, columnDefinition = "text", updatable = false)
    private String responseJson;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected GameOperationEntity() {
    }

    public GameOperationEntity(UUID id, UUID sessionId, UUID operationId,
            String kind, UUID targetRoundId, String requestHash,
            String responseJson, Instant createdAt) {
        this.id = id;
        this.sessionId = sessionId;
        this.operationId = operationId;
        this.kind = kind;
        this.targetRoundId = targetRoundId;
        this.requestHash = requestHash;
        this.responseJson = responseJson;
        this.createdAt = createdAt;
    }

    public String kind() { return kind; }
    public UUID targetRoundId() { return targetRoundId; }
    public String requestHash() { return requestHash; }
    public String responseJson() { return responseJson; }
}
