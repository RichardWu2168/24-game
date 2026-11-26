package io.math24.game.persistence;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface GameOperationRepository extends JpaRepository<GameOperationEntity, UUID> {
    Optional<GameOperationEntity> findBySessionIdAndOperationId(UUID sessionId, UUID operationId);
}
