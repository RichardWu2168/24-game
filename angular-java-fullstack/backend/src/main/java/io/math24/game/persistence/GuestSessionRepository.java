package io.math24.game.persistence;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GuestSessionRepository extends JpaRepository<GuestSessionEntity, UUID> {
    Optional<GuestSessionEntity> findByTokenHash(String tokenHash);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select session from GuestSessionEntity session where session.tokenHash = :tokenHash")
    Optional<GuestSessionEntity> findLockedByTokenHash(@Param("tokenHash") String tokenHash);

    @Modifying
    @Query(value = """
            insert into guest_session (id, token_hash, created_at)
            values (:id, :tokenHash, :createdAt)
            on conflict (token_hash) do nothing
            """, nativeQuery = true)
    int initialize(@Param("id") UUID id, @Param("tokenHash") String tokenHash,
            @Param("createdAt") Instant createdAt);
}
