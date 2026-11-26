package io.math24.game.integration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import io.math24.game.domain.AnswerValidator;
import io.math24.game.domain.Puzzle;
import io.math24.game.domain.PuzzleGenerator;
import java.security.SecureRandom;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Runs the real HTTP/application/repository flow against PostgreSQL. Each suite
 * has its own schema; neither fixture creation nor cleanup touches public data.
 * Tests use separate transactions so committed retries and row locks are real.
 */
@SpringBootTest(properties = {
        "math24.api.allowed-origins=http://localhost:4200",
        "spring.datasource.hikari.maximum-pool-size=8"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@Timeout(30)
class GameApiIntegrationTest {
    private static final String SCHEMA = "math24_test_" + UUID.randomUUID().toString().replace("-", "");
    private static final Puzzle FIXTURE = Puzzle.of(3, 1, 7, 1);
    private static final String CORRECT = "3+1*7-1";
    private static final String INCORRECT = "3+1+7+1";
    private static final long CAP = 1_800_000;
    private static final SecureRandom RANDOM = new SecureRandom();

    @DynamicPropertySource
    static void isolateDatabase(DynamicPropertyRegistry properties) {
        properties.add("spring.flyway.enabled", () -> true);
        properties.add("spring.flyway.create-schemas", () -> true);
        properties.add("spring.flyway.schemas", () -> SCHEMA);
        properties.add("spring.flyway.default-schema", () -> SCHEMA);
        properties.add("spring.jpa.properties.hibernate.default_schema", () -> SCHEMA);
        properties.add("spring.datasource.hikari.schema", () -> SCHEMA);
    }

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ObjectMapper mapper;

    @Autowired
    private JdbcTemplate jdbc;

    @MockitoBean
    private PuzzleGenerator generator;

    @BeforeEach
    void useKnownSolvablePuzzle() {
        when(generator.generate()).thenReturn(FIXTURE);
    }

    @AfterAll
    void removeOnlyThisSuitesSchema() {
        if (!SCHEMA.matches("math24_test_[0-9a-f]{32}")) {
            throw new IllegalStateException("Refusing to remove an unexpected test schema.");
        }
        jdbc.execute("DROP SCHEMA \"" + SCHEMA + "\" CASCADE");
    }

    @Test
    void initializesAndRestoresOneGuestWithoutReturningOrStoringTheCredential() throws Exception {
        String token = newToken();
        MvcResult initialized = call(put("/api/v1/session"), token, null, 200);
        JsonNode first = json(initialized);
        JsonNode repeated = json(call(put("/api/v1/session"), token, null, 200));
        JsonNode restored = json(call(get("/api/v1/session"), token, null, 200));

        assertEquals(first, repeated);
        assertEquals(first, restored);
        assertTrue(first.path("activeRound").isNull());
        assertEquals("no-store", initialized.getResponse().getHeader(HttpHeaders.CACHE_CONTROL));
        assertFalse(initialized.getResponse().getContentAsString().contains(token));
        String stored = jdbc.queryForObject("select token_hash from guest_session where id = ?",
                String.class, uuid(first, "sessionId"));
        assertNotNull(stored);
        assertTrue(stored.matches("[0-9a-f]{64}"));
        assertNotEquals(token, stored);
    }

    @Test
    void rejectsMissingMalformedUnknownAndNoncanonicalCredentials() throws Exception {
        mvc.perform(get("/api/v1/session"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string(HttpHeaders.WWW_AUTHENTICATE, "Bearer"));
        for (String token : List.of("short", UUID.randomUUID().toString(), "!".repeat(43),
                "A".repeat(42) + "B", newToken())) {
            MvcResult result = call(get("/api/v1/session"), token, null, 401);
            assertEquals("Bearer", result.getResponse().getHeader(HttpHeaders.WWW_AUTHENTICATE));
            assertFalse(result.getResponse().getContentAsString().contains(token));
        }
        mvc.perform(put("/api/v1/session").header(HttpHeaders.AUTHORIZATION, "Basic secret"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void createsAnActiveSolvableRoundWithoutDisclosingASolutionAndRestoresIt() throws Exception {
        Guest guest = guest();
        MvcResult created = call(post("/api/v1/rounds"), guest.token(), operation(), 201);
        JsonNode round = json(created);
        UUID roundId = uuid(round, "roundId");

        assertEquals("/api/v1/rounds/" + roundId, created.getResponse().getHeader(HttpHeaders.LOCATION));
        assertEquals(mapper.valueToTree(FIXTURE.cards()), round.path("cards"));
        assertEquals("ACTIVE", text(round, "outcome"));
        assertEquals("NOT_CAPTURED", text(round, "timingStatus"));
        assertTrue(round.path("thinkingTimeMs").isNull());
        assertTrue(round.path("acceptedExpression").isNull());
        assertTrue(round.path("revealedSolution").isNull());
        assertTrue(round.path("completedAt").isNull());
        assertEquals(0, round.path("attemptCount").asInt());
        assertEquals(round, json(call(get("/api/v1/rounds/" + roundId), guest.token(), null, 200)));
        assertEquals(round, json(call(get("/api/v1/session"), guest.token(), null, 200)).path("activeRound"));
    }

    @Test
    void refusesASecondActiveRoundAndPreservesTheOriginal() throws Exception {
        Guest guest = guest();
        JsonNode first = round(guest);
        problem(call(post("/api/v1/rounds"), guest.token(), operation(), 409), "ACTIVE_ROUND_EXISTS");
        assertEquals(first, json(call(get("/api/v1/session"), guest.token(), null, 200)).path("activeRound"));
        assertEquals(1L, countRounds(guest));
    }

    @Test
    void hidesAnotherGuestsRoundsAttemptsAndMutations() throws Exception {
        Guest owner = guest();
        UUID id = uuid(round(owner), "roundId");
        Guest outsider = guest();

        MvcResult otherRound = call(get("/api/v1/rounds/" + id), outsider.token(), null, 404);
        MvcResult unknownRound = call(get("/api/v1/rounds/" + UUID.randomUUID()), outsider.token(), null, 404);
        assertEquals(json(otherRound).path("code"), json(unknownRound).path("code"));
        call(get("/api/v1/rounds/" + id + "/attempts"), outsider.token(), null, 404);
        call(post("/api/v1/rounds/" + id + "/reveal"), outsider.token(), operation(), 404);
        call(post("/api/v1/rounds/" + id + "/skip"), outsider.token(), operation(), 404);
        call(put("/api/v1/rounds/" + id + "/timing"), outsider.token(), timing(UUID.randomUUID(), 15), 404);
        call(post("/api/v1/rounds/" + id + "/attempts"), outsider.token(), answer(UUID.randomUUID(), CORRECT, 15), 404);
        assertEquals(0, statistics(outsider).path("totalRounds").asLong());
        assertEquals(0, history(outsider, 0, 20).path("totalElements").asLong());
        assertEquals("ACTIVE", text(getRound(owner, id), "outcome"));
    }

    @Test
    void wrongAnswerThenCorrectionPreservesCaptureAndStoresTheAssistedInterpretation() throws Exception {
        Guest guest = guest();
        JsonNode created = round(guest);
        UUID id = uuid(created, "roundId");
        JsonNode captured = capture(guest, id, 12_345);
        JsonNode wrong = submit(guest, id, INCORRECT, 12_345);
        JsonNode correct = submit(guest, id, "  " + CORRECT + "  ", 12_345);

        assertEquals("NOT_TWENTY_FOUR", text(wrong.path("attempt"), "status"));
        assertEquals("ACTIVE", text(wrong.path("round"), "outcome"));
        assertEquals(12, wrong.path("attempt").path("value").asInt());
        assertEquals("CORRECT", text(correct.path("attempt"), "status"));
        assertEquals("  " + CORRECT + "  ", text(correct.path("attempt"), "submittedExpression"));
        assertEquals("(3+1)*(7-1)", text(correct.path("attempt"), "interpretedExpression"));
        assertTrue(correct.path("attempt").path("assisted").asBoolean());
        JsonNode solved = correct.path("round");
        assertEquals("SOLVED", text(solved, "outcome"));
        assertEquals("CAPTURED", text(solved, "timingStatus"));
        assertEquals(12_345, solved.path("thinkingTimeMs").asLong());
        assertEquals(2, solved.path("attemptCount").asInt());
        assertEquals("(3+1)*(7-1)", text(solved, "acceptedExpression"));
        assertTrue(solved.path("assisted").asBoolean());
        assertFalse(solved.path("completedAt").isNull());
        assertTrue(captured.path("revision").asLong() > created.path("revision").asLong());
        assertTrue(wrong.path("round").path("revision").asLong() > captured.path("revision").asLong());
        assertTrue(solved.path("revision").asLong() > wrong.path("round").path("revision").asLong());
        assertTrue(json(call(get("/api/v1/session"), guest.token(), null, 200)).path("activeRound").isNull());
    }

    @Test
    void answerAtomicallySavesFrozenTimeAndAcceptsADelayedMatchingCapture() throws Exception {
        Guest guest = guest();
        UUID id = uuid(round(guest), "roundId");
        JsonNode solved = submit(guest, id, CORRECT, 7_654).path("round");
        assertEquals("SOLVED", text(solved, "outcome"));
        assertEquals("CAPTURED", text(solved, "timingStatus"));
        assertEquals(7_654, solved.path("thinkingTimeMs").asLong());
        JsonNode lateTiming = capture(guest, id, 7_654);
        assertEquals(solved, lateTiming);
    }

    @Test
    void aDifferentCaptureCannotChangeFrozenTimeOrCreateAnAttempt() throws Exception {
        Guest guest = guest();
        UUID id = uuid(round(guest), "roundId");
        JsonNode captured = capture(guest, id, 100);
        problem(call(put("/api/v1/rounds/" + id + "/timing"), guest.token(),
                timing(UUID.randomUUID(), 101), 409), "TIMING_ALREADY_CAPTURED");
        problem(call(post("/api/v1/rounds/" + id + "/attempts"), guest.token(),
                answer(UUID.randomUUID(), CORRECT, 101), 409), "TIMING_ALREADY_CAPTURED");
        assertEquals(captured, getRound(guest, id));
        assertEquals(0L, countAttempts(id));
    }

    @Test
    void cappingStopsTimingWithoutFinishingTheRoundAndStillAllowsASolve() throws Exception {
        Guest guest = guest();
        UUID id = uuid(round(guest), "roundId");
        JsonNode capped = capture(guest, id, CAP);
        assertEquals("ACTIVE", text(capped, "outcome"));
        assertEquals("CAPPED", text(capped, "timingStatus"));
        assertEquals(CAP, capped.path("thinkingTimeMs").asLong());
        JsonNode solved = submit(guest, id, CORRECT, CAP).path("round");
        assertEquals("SOLVED", text(solved, "outcome"));
        assertEquals("CAPPED", text(solved, "timingStatus"));
        assertEquals(CAP, solved.path("thinkingTimeMs").asLong());
        JsonNode stats = statistics(guest);
        assertEquals(1, stats.path("solvedRounds").asLong());
        assertEquals(1, stats.path("cappedSolvedRounds").asLong());
        assertEquals(0, stats.path("timedSolvedRounds").asLong());
        assertTrue(stats.path("averageThinkingTimeMs").isNull());
    }

    @ParameterizedTest
    @ValueSource(longs = {0, 1_799_999})
    void uncappedBoundaryDurationsRemainEligibleForTheAverage(long millis) throws Exception {
        Guest guest = guest();
        UUID id = uuid(round(guest), "roundId");
        JsonNode solved = submit(guest, id, CORRECT, millis).path("round");
        assertEquals("CAPTURED", text(solved, "timingStatus"));
        assertEquals(millis, solved.path("thinkingTimeMs").asLong());
        JsonNode stats = statistics(guest);
        assertEquals(1, stats.path("timedSolvedRounds").asLong());
        assertEquals(0, stats.path("cappedSolvedRounds").asLong());
        assertFalse(stats.path("averageThinkingTimeMs").isNull());
        assertEquals((double) millis, stats.path("averageThinkingTimeMs").asDouble());
    }

    @Test
    void browserTimingDoesNotDependOnServerRoundAge() throws Exception {
        Guest guest = guest();
        UUID id = uuid(round(guest), "roundId");
        jdbc.update("update game_round set created_at = timestamp with time zone '2000-01-01 00:00:00+00' where id = ?", id);
        JsonNode solved = submit(guest, id, CORRECT, 321).path("round");
        assertEquals("SOLVED", text(solved, "outcome"));
        assertEquals("CAPTURED", text(solved, "timingStatus"));
        assertEquals(321, solved.path("thinkingTimeMs").asLong());
    }

    @Test
    void revealStoresALegalSolutionAndClosesTheRoundWithoutInventingATime() throws Exception {
        Guest guest = guest();
        UUID id = uuid(round(guest), "roundId");
        JsonNode revealed = finish(guest, id, "reveal");
        assertEquals("REVEALED", text(revealed, "outcome"));
        assertEquals("NOT_CAPTURED", text(revealed, "timingStatus"));
        assertTrue(revealed.path("thinkingTimeMs").isNull());
        String solution = text(revealed, "revealedSolution");
        assertTrue(new AnswerValidator().validate(FIXTURE, "(" + solution + ")").isCorrect());
        assertEquals(revealed, getRound(guest, id));
        problem(call(post("/api/v1/rounds/" + id + "/attempts"), guest.token(),
                answer(UUID.randomUUID(), CORRECT, 100), 409), "ROUND_FINISHED");
        problem(call(put("/api/v1/rounds/" + id + "/timing"), guest.token(),
                timing(UUID.randomUUID(), 100), 409), "ROUND_FINISHED");
        assertEquals(0L, countAttempts(id));
        assertNotEquals(id, uuid(round(guest), "roundId"));
    }

    @Test
    void skipClosesTheRoundAndKeepsAnExistingCaptureWithoutDisclosingASolution() throws Exception {
        Guest guest = guest();
        UUID id = uuid(round(guest), "roundId");
        capture(guest, id, 456);
        JsonNode skipped = finish(guest, id, "skip");
        assertEquals("SKIPPED", text(skipped, "outcome"));
        assertEquals(456, skipped.path("thinkingTimeMs").asLong());
        assertTrue(skipped.path("revealedSolution").isNull());
        assertTrue(skipped.path("acceptedExpression").isNull());
        assertFalse(skipped.path("completedAt").isNull());
        assertNotEquals(id, uuid(round(guest), "roundId"));
    }

    @Test
    void statisticsCountRoundsAndAverageOnlyUncappedSolves() throws Exception {
        Guest guest = guest();
        assertEquals(0, statistics(guest).path("totalRounds").asLong());
        assertTrue(statistics(guest).path("averageThinkingTimeMs").isNull());
        UUID first = uuid(round(guest), "roundId");
        submit(guest, first, INCORRECT, 10_000);
        submit(guest, first, CORRECT, 10_000);
        submit(guest, uuid(round(guest), "roundId"), CORRECT, 30_000);
        submit(guest, uuid(round(guest), "roundId"), CORRECT, CAP);
        UUID revealed = uuid(round(guest), "roundId");
        capture(guest, revealed, 40_000);
        finish(guest, revealed, "reveal");
        UUID skipped = uuid(round(guest), "roundId");
        capture(guest, skipped, 60_000);
        finish(guest, skipped, "skip");
        round(guest);

        JsonNode stats = statistics(guest);
        assertEquals(6, stats.path("totalRounds").asLong());
        assertEquals(1, stats.path("activeRounds").asLong());
        assertEquals(3, stats.path("solvedRounds").asLong());
        assertEquals(1, stats.path("revealedRounds").asLong());
        assertEquals(1, stats.path("skippedRounds").asLong());
        assertEquals(2, stats.path("timedSolvedRounds").asLong());
        assertEquals(1, stats.path("cappedSolvedRounds").asLong());
        assertEquals(20_000.0, stats.path("averageThinkingTimeMs").asDouble());
    }

    @Test
    void historyAndAttemptsAreBoundedNewestFirstAndOwnedByTheGuest() throws Exception {
        Guest guest = guest();
        UUID first = uuid(round(guest), "roundId");
        submit(guest, first, INCORRECT, 500);
        submit(guest, first, "", 500);
        submit(guest, first, CORRECT, 500);
        finish(guest, uuid(round(guest), "roundId"), "skip");
        UUID newest = uuid(round(guest), "roundId");
        JsonNode history = history(guest, 0, 2);
        assertEquals(3, history.path("totalElements").asLong());
        assertEquals(2, history.path("items").size());
        assertEquals(newest.toString(), history.path("items").path(0).path("roundId").asString());
        assertEquals(1, history(guest, 1, 2).path("items").size());
        JsonNode attempts = json(call(get("/api/v1/rounds/" + first + "/attempts?page=0&size=2"), guest.token(), null, 200));
        assertEquals(3, attempts.path("totalElements").asLong());
        assertEquals(2, attempts.path("items").size());
        assertEquals(3, attempts.path("items").path(0).path("attemptNumber").asInt());
        assertEquals(2, attempts.path("items").path(1).path("attemptNumber").asInt());
        assertEquals("INVALID_SYNTAX", attempts.path("items").path(1).path("status").asString());
        assertEquals("", attempts.path("items").path(1).path("submittedExpression").asString());
    }

    @Test
    void aCreationReplayReturnsItsOriginalSnapshotEvenAfterTheRoundIsSolved() throws Exception {
        Guest guest = guest();
        Map<String, Object> command = operation();
        JsonNode original = json(call(post("/api/v1/rounds"), guest.token(), command, 201));
        UUID id = uuid(original, "roundId");
        submit(guest, id, CORRECT, 999);
        JsonNode replay = json(call(post("/api/v1/rounds"), guest.token(), command, 201));
        assertEquals(original, replay);
        assertEquals("ACTIVE", text(replay, "outcome"));
        assertEquals("SOLVED", text(getRound(guest, id), "outcome"));
        assertTrue(getRound(guest, id).path("revision").asLong() > replay.path("revision").asLong());
        assertEquals(1L, countRounds(guest));
    }

    @Test
    void successfulAnswerReplayDoesNotAddAnAttemptOrFailBecauseTheRoundIsFinished() throws Exception {
        Guest guest = guest();
        UUID id = uuid(round(guest), "roundId");
        Map<String, Object> command = answer(UUID.randomUUID(), CORRECT, 999);
        JsonNode first = json(call(post("/api/v1/rounds/" + id + "/attempts"), guest.token(), command, 200));
        JsonNode replay = json(call(post("/api/v1/rounds/" + id + "/attempts"), guest.token(), command, 200));
        assertEquals(first, replay);
        assertEquals(1L, countAttempts(id));
        problem(call(post("/api/v1/rounds/" + id + "/attempts"), guest.token(),
                answer(UUID.randomUUID(), CORRECT, 999), 409), "ROUND_FINISHED");
    }

    @Test
    void operationIdentifiersCannotBeReusedWithDifferentPayloadsKindsOrTargets() throws Exception {
        Guest guest = guest();
        UUID createId = UUID.randomUUID();
        UUID id = uuid(json(call(post("/api/v1/rounds"), guest.token(), Map.of("operationId", createId), 201)), "roundId");
        problem(call(put("/api/v1/rounds/" + id + "/timing"), guest.token(),
                timing(createId, 100), 409), "IDEMPOTENCY_CONFLICT");
        UUID answerId = UUID.randomUUID();
        call(post("/api/v1/rounds/" + id + "/attempts"), guest.token(), answer(answerId, INCORRECT, 100), 200);
        problem(call(post("/api/v1/rounds/" + id + "/attempts"), guest.token(),
                answer(answerId, CORRECT, 100), 409), "IDEMPOTENCY_CONFLICT");
        problem(call(post("/api/v1/rounds/" + id + "/attempts"), guest.token(),
                answer(answerId, INCORRECT, 101), 409), "IDEMPOTENCY_CONFLICT");
        finish(guest, id, "skip");
        UUID other = uuid(round(guest), "roundId");
        problem(call(post("/api/v1/rounds/" + other + "/attempts"), guest.token(),
                answer(answerId, INCORRECT, 100), 409), "IDEMPOTENCY_CONFLICT");
        assertEquals(1L, countAttempts(id));
        assertEquals(0L, countAttempts(other));
    }

    @Test
    void operationIdentifiersAreScopedToTheOwningGuest() throws Exception {
        Guest firstGuest = guest();
        Guest secondGuest = guest();
        Map<String, Object> sameIdentifier = operation();
        JsonNode first = json(call(post("/api/v1/rounds"), firstGuest.token(), sameIdentifier, 201));
        JsonNode second = json(call(post("/api/v1/rounds"), secondGuest.token(), sameIdentifier, 201));
        assertNotEquals(uuid(first, "roundId"), uuid(second, "roundId"));
        assertEquals(firstGuest.id(), uuid(first, "sessionId"));
        assertEquals(secondGuest.id(), uuid(second, "sessionId"));
    }

    @Test
    void timingReplayRetainsItsOriginalRevisionAfterLaterAttempts() throws Exception {
        Guest guest = guest();
        UUID id = uuid(round(guest), "roundId");
        Map<String, Object> command = timing(UUID.randomUUID(), 222);
        JsonNode first = json(call(put("/api/v1/rounds/" + id + "/timing"), guest.token(), command, 200));
        submit(guest, id, INCORRECT, 222);
        JsonNode replay = json(call(put("/api/v1/rounds/" + id + "/timing"), guest.token(), command, 200));
        assertEquals(first, replay);
        assertTrue(getRound(guest, id).path("revision").asLong() > replay.path("revision").asLong());
    }

    @ParameterizedTest
    @ValueSource(strings = {"reveal", "skip"})
    void terminalCommandsReplayTheirReceiptButRejectANewCommand(String action) throws Exception {
        Guest guest = guest();
        UUID id = uuid(round(guest), "roundId");
        Map<String, Object> command = operation();
        JsonNode first = json(call(post("/api/v1/rounds/" + id + "/" + action), guest.token(), command, 200));
        JsonNode replay = json(call(post("/api/v1/rounds/" + id + "/" + action), guest.token(), command, 200));
        assertEquals(first, replay);
        problem(call(post("/api/v1/rounds/" + id + "/" + action), guest.token(), operation(), 409), "ROUND_FINISHED");
    }

    @Test
    void concurrentInitializationCreatesOneSession() throws Exception {
        String token = newToken();
        List<MvcResult> results = concurrently(4, () -> call(put("/api/v1/session"), token, null, 200));
        JsonNode first = json(results.getFirst());
        for (MvcResult result : results) {
            assertEquals(first, json(result));
        }
        assertEquals(1L, jdbc.queryForObject("select count(*) from guest_session where id = ?", Long.class,
                uuid(first, "sessionId")));
    }

    @Test
    void concurrentCreationRetriesCreateOneRoundAndOneReceipt() throws Exception {
        Guest guest = guest();
        Map<String, Object> command = operation();
        List<MvcResult> results = concurrently(4, () -> call(post("/api/v1/rounds"), guest.token(), command, 201));
        JsonNode first = json(results.getFirst());
        for (MvcResult result : results) {
            assertEquals(first, json(result));
        }
        assertEquals(1L, countRounds(guest));
        assertEquals(1L, jdbc.queryForObject("select count(*) from game_operation where session_id = ?", Long.class, guest.id()));
    }

    @Test
    void competingNewRoundCommandsStillAllowOnlyOneActiveRound() throws Exception {
        Guest guest = guest();
        List<MvcResult> results = concurrently(4, () -> mvc.perform(post("/api/v1/rounds")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + guest.token())
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(operation()))).andReturn());
        assertEquals(1L, results.stream().filter(result -> result.getResponse().getStatus() == 201).count());
        assertEquals(3L, results.stream().filter(result -> result.getResponse().getStatus() == 409).count());
        for (MvcResult result : results) {
            if (result.getResponse().getStatus() == 409) {
                problem(result, "ACTIVE_ROUND_EXISTS");
            }
        }
        assertEquals(1L, countRounds(guest));
    }

    @Test
    void concurrentAnswerRetriesSaveOneAttemptAndOneSolve() throws Exception {
        Guest guest = guest();
        UUID id = uuid(round(guest), "roundId");
        Map<String, Object> command = answer(UUID.randomUUID(), CORRECT, 1_234);
        List<MvcResult> results = concurrently(4, () -> call(post("/api/v1/rounds/" + id + "/attempts"), guest.token(), command, 200));
        JsonNode first = json(results.getFirst());
        for (MvcResult result : results) {
            assertEquals(first, json(result));
        }
        assertEquals(1L, countAttempts(id));
        assertEquals(1, getRound(guest, id).path("attemptCount").asInt());
        assertEquals(1, statistics(guest).path("solvedRounds").asLong());
    }

    @ParameterizedTest(name = "rejects invalid request: {0}")
    @MethodSource("invalidBodies")
    void rejectsMalformedOrOutOfBoundsCommandsWithoutChangingState(String label, String suffix, String body) throws Exception {
        Guest guest = guest();
        UUID id = uuid(round(guest), "roundId");
        String path = suffix.equals("create") ? "/api/v1/rounds" : "/api/v1/rounds/" + id + "/" + suffix;
        MockHttpServletRequestBuilder request = suffix.equals("timing") ? put(path) : post(path);
        MvcResult result = mvc.perform(request.header(HttpHeaders.AUTHORIZATION, "Bearer " + guest.token())
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest()).andReturn();
        problem(result, "INVALID_REQUEST");
        assertFalse(result.getResponse().getContentAsString().contains(guest.token()));
        assertEquals("NOT_CAPTURED", text(getRound(guest, id), "timingStatus"));
        assertEquals(0L, countAttempts(id));
        assertEquals(1L, countRounds(guest));
    }

    static Stream<Arguments> invalidBodies() {
        String id = "\"operationId\":\"" + UUID.randomUUID() + "\"";
        return Stream.of(
                Arguments.of("missing operation", "create", "{}"),
                Arguments.of("invalid operation UUID", "create", "{\"operationId\":\"bad\"}"),
                Arguments.of("malformed JSON", "create", "{"),
                Arguments.of("array body", "create", "[]"),
                Arguments.of("unknown field", "create", "{" + id + ",\"unexpected\":true}"),
                Arguments.of("missing duration", "timing", "{" + id + "}"),
                Arguments.of("negative duration", "timing", "{" + id + ",\"thinkingTimeMs\":-1}"),
                Arguments.of("duration above cap", "timing", "{" + id + ",\"thinkingTimeMs\":1800001}"),
                Arguments.of("fractional duration", "timing", "{" + id + ",\"thinkingTimeMs\":1.5}"),
                Arguments.of("string duration", "timing", "{" + id + ",\"thinkingTimeMs\":\"1\"}"),
                Arguments.of("missing expression", "attempts", "{" + id + ",\"thinkingTimeMs\":1}"),
                Arguments.of("null expression", "attempts", "{" + id + ",\"thinkingTimeMs\":1,\"expression\":null}"),
                Arguments.of("long expression", "attempts", "{" + id + ",\"thinkingTimeMs\":1,\"expression\":\"" + "1".repeat(257) + "\"}"),
                Arguments.of("NUL expression", "attempts", "{" + id + ",\"thinkingTimeMs\":1,\"expression\":\"3+1\\u0000\"}"),
                Arguments.of("duplicate key", "timing", "{" + id + ",\"thinkingTimeMs\":1,\"thinkingTimeMs\":2}"),
                Arguments.of("trailing token", "timing", "{" + id + ",\"thinkingTimeMs\":1} true"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"page=-1", "page=10001", "size=0", "size=101", "page=abc"})
    void rejectsUnboundedOrMalformedPagination(String query) throws Exception {
        Guest guest = guest();
        problem(call(get("/api/v1/rounds?" + query), guest.token(), null, 400), "INVALID_REQUEST");
    }

    @Test
    void rejectsMalformedRoundIdentifiers() throws Exception {
        Guest guest = guest();
        problem(call(get("/api/v1/rounds/not-a-uuid"), guest.token(), null, 400), "INVALID_REQUEST");
    }

    @Test
    void allowsOnlyTheConfiguredBrowserOriginWithoutCookieCredentials() throws Exception {
        mvc.perform(options("/api/v1/rounds")
                        .header(HttpHeaders.ORIGIN, "http://localhost:4200")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "Authorization,Content-Type"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:4200"))
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS));
        mvc.perform(options("/api/v1/rounds")
                        .header(HttpHeaders.ORIGIN, "https://untrusted.example")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "POST"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));
    }

    @Test
    void migrationAndDatabaseConstraintsProtectTheStoredState() throws Exception {
        assertEquals(SCHEMA, jdbc.queryForObject("select current_schema()", String.class));
        assertTrue(jdbc.queryForObject("select version()", String.class).startsWith("PostgreSQL"));
        assertEquals(1L, jdbc.queryForObject("select count(*) from flyway_schema_history where version = '1' and success", Long.class));
        Guest guest = guest();
        UUID completed = uuid(round(guest), "roundId");
        finish(guest, completed, "skip");
        UUID active = uuid(round(guest), "roundId");

        assertSqlState("23505", () -> jdbc.update("update game_round set outcome = 'ACTIVE', completed_at = null where id = ?", completed));
        assertSqlState("23514", () -> jdbc.update("update game_round set timing_status = 'CAPTURED', thinking_time_ms = 1800000 where id = ?", active));
        assertSqlState("23514", () -> jdbc.update("update game_round set timing_status = 'CAPTURED', thinking_time_ms = null where id = ?", active));
        assertSqlState("23514", () -> jdbc.update("update game_round set card_1 = 11 where id = ?", active));
        assertSqlState("23503", () -> jdbc.update("update game_round set session_id = ? where id = ?", UUID.randomUUID(), active));
        assertEquals("ACTIVE", text(getRound(guest, active), "outcome"));
        assertEquals("NOT_CAPTURED", text(getRound(guest, active), "timingStatus"));
    }

    private void assertSqlState(String state, Runnable statement) {
        DataIntegrityViolationException exception = assertThrows(DataIntegrityViolationException.class, statement::run);
        Throwable cause = exception;
        while (cause != null && !(cause instanceof SQLException)) {
            cause = cause.getCause();
        }
        assertNotNull(cause, "Expected a PostgreSQL constraint error.");
        assertEquals(state, ((SQLException) cause).getSQLState());
    }

    private List<MvcResult> concurrently(int count, Callable<MvcResult> request) throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(count);
        CountDownLatch ready = new CountDownLatch(count);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<MvcResult>> futures = new ArrayList<>();
        try {
            for (int i = 0; i < count; i++) {
                futures.add(executor.submit(() -> {
                    ready.countDown();
                    if (!start.await(10, TimeUnit.SECONDS)) {
                        throw new IllegalStateException("Concurrent request start timed out.");
                    }
                    return request.call();
                }));
            }
            assertTrue(ready.await(10, TimeUnit.SECONDS));
            start.countDown();
            List<MvcResult> results = new ArrayList<>();
            for (Future<MvcResult> future : futures) {
                results.add(future.get(20, TimeUnit.SECONDS));
            }
            return results;
        } finally {
            start.countDown();
            executor.shutdownNow();
            assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS), "Concurrent requests did not finish.");
        }
    }

    private Guest guest() throws Exception {
        String token = newToken();
        JsonNode session = json(call(put("/api/v1/session"), token, null, 200));
        return new Guest(token, uuid(session, "sessionId"));
    }

    private JsonNode round(Guest guest) throws Exception {
        return json(call(post("/api/v1/rounds"), guest.token(), operation(), 201));
    }

    private JsonNode getRound(Guest guest, UUID id) throws Exception {
        return json(call(get("/api/v1/rounds/" + id), guest.token(), null, 200));
    }

    private JsonNode capture(Guest guest, UUID id, long millis) throws Exception {
        return json(call(put("/api/v1/rounds/" + id + "/timing"), guest.token(), timing(UUID.randomUUID(), millis), 200));
    }

    private JsonNode submit(Guest guest, UUID id, String expression, long millis) throws Exception {
        return json(call(post("/api/v1/rounds/" + id + "/attempts"), guest.token(), answer(UUID.randomUUID(), expression, millis), 200));
    }

    private JsonNode finish(Guest guest, UUID id, String action) throws Exception {
        return json(call(post("/api/v1/rounds/" + id + "/" + action), guest.token(), operation(), 200));
    }

    private JsonNode statistics(Guest guest) throws Exception {
        return json(call(get("/api/v1/statistics"), guest.token(), null, 200));
    }

    private JsonNode history(Guest guest, int page, int size) throws Exception {
        return json(call(get("/api/v1/rounds?page=" + page + "&size=" + size), guest.token(), null, 200));
    }

    private long countRounds(Guest guest) {
        return jdbc.queryForObject("select count(*) from game_round where session_id = ?", Long.class, guest.id());
    }

    private long countAttempts(UUID roundId) {
        return jdbc.queryForObject("select count(*) from answer_attempt where round_id = ?", Long.class, roundId);
    }

    private MvcResult call(MockHttpServletRequestBuilder request, String token, Object body, int expectedStatus) throws Exception {
        if (token != null) {
            request.header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        }
        if (body != null) {
            request.contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body));
        }
        return mvc.perform(request).andExpect(status().is(expectedStatus)).andReturn();
    }

    private JsonNode json(MvcResult response) throws Exception {
        return mapper.readTree(response.getResponse().getContentAsString());
    }

    private void problem(MvcResult response, String code) throws Exception {
        assertTrue(MediaType.APPLICATION_PROBLEM_JSON.isCompatibleWith(MediaType.parseMediaType(response.getResponse().getContentType())));
        assertEquals(code, text(json(response), "code"));
        assertEquals(response.getResponse().getStatus(), json(response).path("status").asInt());
        assertEquals("no-store", response.getResponse().getHeader(HttpHeaders.CACHE_CONTROL));
    }

    private static Map<String, Object> operation() {
        return Map.of("operationId", UUID.randomUUID());
    }

    private static Map<String, Object> timing(UUID operationId, long millis) {
        return Map.of("operationId", operationId, "thinkingTimeMs", millis);
    }

    private static Map<String, Object> answer(UUID operationId, String expression, long millis) {
        return Map.of("operationId", operationId, "expression", expression, "thinkingTimeMs", millis);
    }

    private static String newToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String text(JsonNode node, String field) {
        return node.path(field).asString();
    }

    private static UUID uuid(JsonNode node, String field) {
        return UUID.fromString(text(node, field));
    }

    private record Guest(String token, UUID id) {
    }
}
