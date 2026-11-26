package io.math24.game.api;

import java.net.URI;
import java.util.UUID;

import io.math24.game.application.GameService;
import io.math24.game.application.GameViews.AnswerView;
import io.math24.game.application.GameViews.AttemptView;
import io.math24.game.application.GameViews.PageView;
import io.math24.game.application.GameViews.RoundView;
import io.math24.game.application.GameViews.SessionView;
import io.math24.game.application.GameViews.StatisticsView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** HTTP boundary: validates transport input and delegates game decisions. */
@RestController
@RequestMapping(path = "/api/v1", produces = MediaType.APPLICATION_JSON_VALUE)
public class GameController {
    private final GameService games;

    public GameController(GameService games) {
        this.games = games;
    }

    @PutMapping("/session")
    public SessionView initializeSession(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        return games.initializeSession(GuestAuthorization.token(authorization));
    }

    @GetMapping("/session")
    public SessionView getSession(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        return games.getSession(GuestAuthorization.token(authorization));
    }

    @PostMapping(path = "/rounds", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<RoundView> createRound(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @Valid @RequestBody GameRequests.Operation request) {
        RoundView round = games.createRound(GuestAuthorization.token(authorization), request.operationId());
        return ResponseEntity.created(URI.create("/api/v1/rounds/" + round.roundId())).body(round);
    }

    @GetMapping("/rounds/{roundId}")
    public RoundView getRound(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @PathVariable("roundId") UUID roundId) {
        return games.getRound(GuestAuthorization.token(authorization), roundId);
    }

    @PutMapping(path = "/rounds/{roundId}/timing", consumes = MediaType.APPLICATION_JSON_VALUE)
    public RoundView captureTiming(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @PathVariable("roundId") UUID roundId,
            @Valid @RequestBody GameRequests.Timing request) {
        return games.captureTiming(GuestAuthorization.token(authorization), roundId,
                request.operationId(), request.thinkingTimeMs());
    }

    @PostMapping(path = "/rounds/{roundId}/attempts", consumes = MediaType.APPLICATION_JSON_VALUE)
    public AnswerView submitAnswer(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @PathVariable("roundId") UUID roundId,
            @Valid @RequestBody GameRequests.Answer request) {
        return games.submitAnswer(GuestAuthorization.token(authorization), roundId,
                request.operationId(), request.expression(), request.thinkingTimeMs());
    }

    @PostMapping(path = "/rounds/{roundId}/reveal", consumes = MediaType.APPLICATION_JSON_VALUE)
    public RoundView revealRound(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @PathVariable("roundId") UUID roundId,
            @Valid @RequestBody GameRequests.Operation request) {
        return games.revealRound(GuestAuthorization.token(authorization), roundId, request.operationId());
    }

    @PostMapping(path = "/rounds/{roundId}/skip", consumes = MediaType.APPLICATION_JSON_VALUE)
    public RoundView skipRound(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @PathVariable("roundId") UUID roundId,
            @Valid @RequestBody GameRequests.Operation request) {
        return games.skipRound(GuestAuthorization.token(authorization), roundId, request.operationId());
    }

    @GetMapping("/rounds")
    public PageView<RoundView> getHistory(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @RequestParam(name = "page", defaultValue = "0") @Min(0) @Max(10_000) int page,
            @RequestParam(name = "size", defaultValue = "20") @Min(1) @Max(100) int size) {
        return games.getHistory(GuestAuthorization.token(authorization), page, size);
    }

    @GetMapping("/rounds/{roundId}/attempts")
    public PageView<AttemptView> getAttempts(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization,
            @PathVariable("roundId") UUID roundId,
            @RequestParam(name = "page", defaultValue = "0") @Min(0) @Max(10_000) int page,
            @RequestParam(name = "size", defaultValue = "20") @Min(1) @Max(100) int size) {
        return games.getAttempts(GuestAuthorization.token(authorization), roundId, page, size);
    }

    @GetMapping("/statistics")
    public StatisticsView getStatistics(
            @RequestHeader(name = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        return games.getStatistics(GuestAuthorization.token(authorization));
    }
}
