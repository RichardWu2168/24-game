package io.math24.game.api;

import io.math24.game.application.GameProblem;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/** Stable public errors never contain rejected values, credentials, or SQL. */
@RestControllerAdvice
public class GameApiExceptionHandler extends ResponseEntityExceptionHandler {
    private static final Logger LOG = LoggerFactory.getLogger(GameApiExceptionHandler.class);

    @ExceptionHandler(GameProblem.class)
    public ResponseEntity<Object> handleGameProblem(GameProblem problem) {
        return response(HttpStatusCode.valueOf(problem.status()), problem.code(),
                problem.getMessage(), new HttpHeaders());
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<Object> handleConstraintViolation(ConstraintViolationException exception) {
        return response(HttpStatus.BAD_REQUEST, "INVALID_REQUEST",
                "The request contains invalid or missing fields.", new HttpHeaders());
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception exception, Object body,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        // Framework exception details may contain request values or JSON snippets.
        String code = switch (status.value()) {
            case 400 -> "INVALID_REQUEST";
            case 404 -> "NOT_FOUND";
            case 405 -> "METHOD_NOT_ALLOWED";
            case 406 -> "NOT_ACCEPTABLE";
            case 413 -> "REQUEST_TOO_LARGE";
            case 415 -> "UNSUPPORTED_MEDIA_TYPE";
            default -> status.is5xxServerError() ? "INTERNAL_ERROR" : "REQUEST_REJECTED";
        };
        String detail = switch (status.value()) {
            case 400 -> "The request contains invalid or missing fields.";
            case 404 -> "The requested resource was not found.";
            case 405 -> "This HTTP method is not supported for this resource.";
            case 406 -> "This resource returns JSON.";
            case 413 -> "The request body is too large.";
            case 415 -> "Send the request body as application/json.";
            default -> status.is5xxServerError()
                    ? "The request could not be completed. Try again using the same operation identifier."
                    : "The request could not be accepted.";
        };
        return response(status, code, detail, headers);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Object> handleUnexpected(Exception exception) {
        LOG.error("Unexpected game API failure.", exception);
        return response(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR",
                "The request could not be completed. Try again using the same operation identifier.",
                new HttpHeaders());
    }

    private static ResponseEntity<Object> response(HttpStatusCode status, String code,
            String detail, HttpHeaders sourceHeaders) {
        ProblemDetail body = ProblemDetail.forStatusAndDetail(status, detail);
        body.setProperty("code", code);
        HttpHeaders headers = new HttpHeaders();
        headers.putAll(sourceHeaders);
        headers.setContentType(MediaType.APPLICATION_PROBLEM_JSON);
        headers.setCacheControl("no-store");
        if (status.value() == 401) {
            headers.set(HttpHeaders.WWW_AUTHENTICATE, "Bearer");
        }
        return new ResponseEntity<>(body, headers, status);
    }
}
