package io.math24.game.application;

import io.math24.game.application.GameViews.AnswerView;
import io.math24.game.application.GameViews.AttemptView;
import io.math24.game.application.GameViews.PageView;
import io.math24.game.application.GameViews.RoundView;
import io.math24.game.application.GameViews.SessionView;
import io.math24.game.application.GameViews.StatisticsView;
import io.math24.game.domain.AnswerResult;
import io.math24.game.domain.AnswerValidator;
import io.math24.game.domain.GameRules;
import io.math24.game.domain.PuzzleGenerator;
import io.math24.game.domain.PuzzleSolver;
import io.math24.game.persistence.AnswerAttemptEntity;
import io.math24.game.persistence.AnswerAttemptRepository;
import io.math24.game.persistence.GameOperationEntity;
import io.math24.game.persistence.GameOperationRepository;
import io.math24.game.persistence.GameRoundEntity;
import io.math24.game.persistence.GameRoundRepository;
import io.math24.game.persistence.GuestSessionEntity;
import io.math24.game.persistence.GuestSessionRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

/**
 * Transactional guest game workflows. Browser durations are trusted; audit
 * timestamps never establish a deadline or replace the browser's timer.
 */
@Service
public class GameService {
    public static final long MAX_THINKING_TIME_MS = 30L * 60 * 1000;
    private static final Sort HISTORY_ORDER = Sort.by(
            Sort.Order.desc("createdAt"), Sort.Order.desc("id"));
    private static final Sort ATTEMPT_ORDER = Sort.by(Sort.Order.desc("attemptNumber"));

    private final GuestSessionRepository sessions;
    private final GameRoundRepository rounds;
    private final AnswerAttemptRepository attempts;
    private final GameOperationRepository operations;
    private final PuzzleGenerator generator;
    private final PuzzleSolver solver;
    private final AnswerValidator validator;
    private final ObjectMapper json;
    private final Clock clock;

    public GameService(GuestSessionRepository sessions, GameRoundRepository rounds,
            AnswerAttemptRepository attempts, GameOperationRepository operations,
            PuzzleGenerator generator, PuzzleSolver solver, AnswerValidator validator,
            ObjectMapper json, Clock clock) {
        this.sessions = sessions;
        this.rounds = rounds;
        this.attempts = attempts;
        this.operations = operations;
        this.generator = generator;
        this.solver = solver;
        this.validator = validator;
        this.json = json;
        this.clock = clock;
    }

    @Transactional
    public SessionView initializeSession(String token) {
        String hash = GuestCredentials.hash(token);
        // PostgreSQL waits on a concurrent insert for the same digest before
        // deciding whether this operation inserts or resumes the existing guest.
        sessions.initialize(UUID.randomUUID(), hash, now());
        GuestSessionEntity session = sessions.findLockedByTokenHash(hash)
                .orElseThrow(() -> new IllegalStateException("Guest initialization failed."));
        return sessionView(session);
    }

    @Transactional(readOnly = true)
    public SessionView getSession(String token) {
        return sessionView(readSession(token));
    }

    @Transactional
    public RoundView createRound(String token, UUID operationId) {
        return command(token, operationId, "CREATE_ROUND", null, null, null,
                RoundView.class, session -> {
                    if (rounds.findBySessionIdAndOutcome(session.id(), RoundOutcome.ACTIVE).isPresent()) {
                        throw new GameProblem(409, "ACTIVE_ROUND_EXISTS",
                                "Finish or skip the active round before starting another.");
                    }
                    GameRoundEntity round = rounds.saveAndFlush(new GameRoundEntity(
                            UUID.randomUUID(), session.id(), generator.generate(), now()));
                    return roundView(round);
                });
    }

    @Transactional(readOnly = true)
    public RoundView getRound(String token, UUID roundId) {
        GuestSessionEntity session = readSession(token);
        return roundView(ownedRound(session.id(), roundId));
    }

    @Transactional
    public RoundView captureTiming(String token, UUID roundId, UUID operationId, long thinkingTimeMs) {
        requireRoundId(roundId);
        requireThinkingTime(thinkingTimeMs);
        return command(token, operationId, "CAPTURE_TIMING", roundId, null, thinkingTimeMs,
                RoundView.class, session -> {
                    GameRoundEntity round = ownedRound(session.id(), roundId);
                    capture(round, thinkingTimeMs);
                    rounds.flush();
                    return roundView(round);
                });
    }

    @Transactional
    public AnswerView submitAnswer(String token, UUID roundId, UUID operationId,
            String expression, long thinkingTimeMs) {
        requireRoundId(roundId);
        requireThinkingTime(thinkingTimeMs);
        requireExpression(expression);
        return command(token, operationId, "SUBMIT_ANSWER", roundId, expression, thinkingTimeMs,
                AnswerView.class, session -> {
                    GameRoundEntity round = ownedRound(session.id(), roundId);
                    requireActive(round);
                    // An answer can synchronize the already-frozen browser time
                    // even when the separate timing request was lost or delayed.
                    capture(round, thinkingTimeMs);
                    AnswerResult result = validator.validate(round.puzzle(), expression);
                    int attemptNumber = round.recordAttempt();
                    Instant submittedAt = now();
                    if (result.isCorrect()) {
                        round.solve(result.interpretedExpression().orElseThrow(),
                                result.assisted(), submittedAt);
                    }
                    AnswerAttemptEntity attempt = attempts.saveAndFlush(new AnswerAttemptEntity(
                            UUID.randomUUID(), round.id(), operationId, attemptNumber, result, submittedAt));
                    // Flushing also increments the managed round's @Version.
                    return new AnswerView(roundView(round), attemptView(attempt));
                });
    }

    @Transactional
    public RoundView revealRound(String token, UUID roundId, UUID operationId) {
        requireRoundId(roundId);
        return command(token, operationId, "REVEAL_ROUND", roundId, null, null,
                RoundView.class, session -> {
                    GameRoundEntity round = ownedRound(session.id(), roundId);
                    requireActive(round);
                    String solution = solver.solve(round.puzzle())
                            .orElseThrow(() -> new IllegalStateException("Stored puzzle has no legal solution."));
                    round.reveal(solution, now());
                    rounds.flush();
                    return roundView(round);
                });
    }

    @Transactional
    public RoundView skipRound(String token, UUID roundId, UUID operationId) {
        requireRoundId(roundId);
        return command(token, operationId, "SKIP_ROUND", roundId, null, null,
                RoundView.class, session -> {
                    GameRoundEntity round = ownedRound(session.id(), roundId);
                    requireActive(round);
                    round.skip(now());
                    rounds.flush();
                    return roundView(round);
                });
    }

    @Transactional(readOnly = true)
    public PageView<RoundView> getHistory(String token, int page, int size) {
        requirePage(page, size);
        GuestSessionEntity session = readSession(token);
        var result = rounds.findBySessionId(session.id(), PageRequest.of(page, size, HISTORY_ORDER));
        return new PageView<>(result.getContent().stream().map(GameService::roundView).toList(),
                page, size, result.getTotalElements());
    }

    @Transactional(readOnly = true)
    public PageView<AttemptView> getAttempts(String token, UUID roundId, int page, int size) {
        requirePage(page, size);
        GuestSessionEntity session = readSession(token);
        ownedRound(session.id(), roundId);
        var result = attempts.findByRoundId(roundId, PageRequest.of(page, size, ATTEMPT_ORDER));
        return new PageView<>(result.getContent().stream().map(GameService::attemptView).toList(),
                page, size, result.getTotalElements());
    }

    @Transactional(readOnly = true)
    public StatisticsView getStatistics(String token) {
        GuestSessionEntity session = readSession(token);
        var result = rounds.statistics(session.id());
        return new StatisticsView(result.getTotalRounds(), result.getActiveRounds(),
                result.getSolvedRounds(), result.getRevealedRounds(), result.getSkippedRounds(),
                result.getTimedSolvedRounds(), result.getCappedSolvedRounds(),
                result.getAverageThinkingTimeMs());
    }

    /**
     * All callers have a transaction. The session lock serializes this guest's
     * commands across tabs and API instances, including duplicate requests.
     * Replay precedes every round/state check so late retries remain successful.
     */
    private <T> T command(String token, UUID operationId, String kind, UUID targetRoundId,
            String expression, Long thinkingTimeMs, Class<T> responseType,
            Function<GuestSessionEntity, T> action) {
        GuestSessionEntity session = sessions.findLockedByTokenHash(GuestCredentials.hash(token))
                .orElseThrow(GuestCredentials::unauthorized);
        if (operationId == null) {
            throw invalidRequest();
        }
        String requestHash = fingerprint(kind, targetRoundId, expression, thinkingTimeMs);
        var prior = operations.findBySessionIdAndOperationId(session.id(), operationId);
        if (prior.isPresent()) {
            GameOperationEntity receipt = prior.orElseThrow();
            if (!receipt.kind().equals(kind)
                    || !Objects.equals(receipt.targetRoundId(), targetRoundId)
                    || !receipt.requestHash().equals(requestHash)) {
                throw new GameProblem(409, "IDEMPOTENCY_CONFLICT",
                        "This operation identifier was already used for a different request.");
            }
            return decode(receipt.responseJson(), responseType);
        }
        T response = action.apply(session);
        operations.saveAndFlush(new GameOperationEntity(UUID.randomUUID(), session.id(),
                operationId, kind, targetRoundId, requestHash, encode(response), now()));
        return response;
    }

    private GuestSessionEntity readSession(String token) {
        return sessions.findByTokenHash(GuestCredentials.hash(token))
                .orElseThrow(GuestCredentials::unauthorized);
    }

    private SessionView sessionView(GuestSessionEntity session) {
        RoundView active = rounds.findBySessionIdAndOutcome(session.id(), RoundOutcome.ACTIVE)
                .map(GameService::roundView).orElse(null);
        return new SessionView(session.id(), session.createdAt(), active);
    }

    private GameRoundEntity ownedRound(UUID sessionId, UUID roundId) {
        requireRoundId(roundId);
        return rounds.findByIdAndSessionId(roundId, sessionId)
                .orElseThrow(() -> new GameProblem(404, "ROUND_NOT_FOUND", "The round was not found."));
    }

    private static void capture(GameRoundEntity round, long thinkingTimeMs) {
        if (round.timingStatus() != TimingStatus.NOT_CAPTURED) {
            if (!Objects.equals(round.thinkingTimeMs(), thinkingTimeMs)) {
                throw new GameProblem(409, "TIMING_ALREADY_CAPTURED",
                        "The round already has a different captured thinking time.");
            }
            // A delayed same-duration capture is harmless even after completion.
            return;
        }
        requireActive(round);
        round.captureTiming(thinkingTimeMs, thinkingTimeMs == MAX_THINKING_TIME_MS
                ? TimingStatus.CAPPED : TimingStatus.CAPTURED);
    }

    private static void requireActive(GameRoundEntity round) {
        if (round.outcome() != RoundOutcome.ACTIVE) {
            throw new GameProblem(409, "ROUND_FINISHED", "The round has already finished.");
        }
    }

    private static void requireRoundId(UUID roundId) {
        if (roundId == null) {
            throw invalidRequest();
        }
    }

    private static void requireThinkingTime(long thinkingTimeMs) {
        if (thinkingTimeMs < 0 || thinkingTimeMs > MAX_THINKING_TIME_MS) {
            throw invalidRequest();
        }
    }

    private static void requireExpression(String expression) {
        if (expression == null || expression.length() > GameRules.MAX_EXPRESSION_LENGTH
                || expression.indexOf('\0') >= 0) {
            throw invalidRequest();
        }
    }

    private static void requirePage(int page, int size) {
        if (page < 0 || page > 10000 || size < 1 || size > 100) {
            throw invalidRequest();
        }
    }

    private static GameProblem invalidRequest() {
        return new GameProblem(400, "INVALID_REQUEST", "The request contains invalid fields.");
    }

    private String fingerprint(String kind, UUID roundId, String expression, Long thinkingTimeMs) {
        try {
            return GuestCredentials.digest(json.writeValueAsBytes(
                    new CommandPayload(kind, roundId, expression, thinkingTimeMs)));
        } catch (JacksonException failure) {
            throw new IllegalStateException("Could not encode the operation.", failure);
        }
    }

    private String encode(Object response) {
        try {
            return json.writeValueAsString(response);
        } catch (JacksonException failure) {
            throw new IllegalStateException("Could not store the operation response.", failure);
        }
    }

    private <T> T decode(String response, Class<T> responseType) {
        try {
            return json.readValue(response, responseType);
        } catch (JacksonException failure) {
            throw new IllegalStateException("Could not restore the operation response.", failure);
        }
    }

    private Instant now() {
        // Match PostgreSQL timestamp precision for stable response snapshots.
        return clock.instant().truncatedTo(ChronoUnit.MICROS);
    }

    private static RoundView roundView(GameRoundEntity round) {
        return new RoundView(round.id(), round.sessionId(), round.cards(), round.outcome(),
                round.timingStatus(), round.thinkingTimeMs(), round.revision(), round.attemptCount(),
                round.acceptedExpression(), round.assisted(), round.revealedSolution(),
                round.createdAt(), round.completedAt());
    }

    private static AttemptView attemptView(AnswerAttemptEntity attempt) {
        return new AttemptView(attempt.id(), attempt.operationId(), attempt.roundId(),
                attempt.attemptNumber(), attempt.submittedExpression(), attempt.status(),
                attempt.interpretedExpression(), attempt.value(), attempt.assisted(),
                attempt.message(), attempt.submittedAt());
    }

    private record CommandPayload(String kind, UUID roundId, String expression, Long thinkingTimeMs) {
    }
}
