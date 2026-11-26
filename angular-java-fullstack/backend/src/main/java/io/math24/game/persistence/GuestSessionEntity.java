package io.math24.game.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "guest_session")
public class GuestSessionEntity {
    @Id
    private UUID id;

    @Column(name = "token_hash", nullable = false, unique = true, length = 64, updatable = false)
    private String tokenHash;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected GuestSessionEntity() {
    }

    public UUID id() {
        return id;
    }

    public Instant createdAt() {
        return createdAt;
    }
}
