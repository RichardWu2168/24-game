package io.math24.game.persistence;

import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AnswerAttemptRepository extends JpaRepository<AnswerAttemptEntity, UUID> {
    Page<AnswerAttemptEntity> findByRoundId(UUID roundId, Pageable pageable);
}
