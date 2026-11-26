package io.math24.game.persistence;

import io.math24.game.application.RoundOutcome;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GameRoundRepository extends JpaRepository<GameRoundEntity, UUID> {
    Optional<GameRoundEntity> findByIdAndSessionId(UUID id, UUID sessionId);
    Optional<GameRoundEntity> findBySessionIdAndOutcome(UUID sessionId, RoundOutcome outcome);
    Page<GameRoundEntity> findBySessionId(UUID sessionId, Pageable pageable);

    @Query(value = """
            select count(*) as "totalRounds",
                   count(*) filter (where outcome = 'ACTIVE') as "activeRounds",
                   count(*) filter (where outcome = 'SOLVED') as "solvedRounds",
                   count(*) filter (where outcome = 'REVEALED') as "revealedRounds",
                   count(*) filter (where outcome = 'SKIPPED') as "skippedRounds",
                   count(*) filter (where outcome = 'SOLVED' and timing_status = 'CAPTURED') as "timedSolvedRounds",
                   count(*) filter (where outcome = 'SOLVED' and timing_status = 'CAPPED') as "cappedSolvedRounds",
                   avg(thinking_time_ms) filter (where outcome = 'SOLVED' and timing_status = 'CAPTURED') as "averageThinkingTimeMs"
            from game_round where session_id = :sessionId
            """, nativeQuery = true)
    StatisticsRow statistics(@Param("sessionId") UUID sessionId);

    interface StatisticsRow {
        long getTotalRounds();
        long getActiveRounds();
        long getSolvedRounds();
        long getRevealedRounds();
        long getSkippedRounds();
        long getTimedSolvedRounds();
        long getCappedSolvedRounds();
        Double getAverageThinkingTimeMs();
    }
}
