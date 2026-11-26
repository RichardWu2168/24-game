-- Browser-generated bearer credentials are stored only as SHA-256 digests.
CREATE TABLE guest_session (
    id uuid PRIMARY KEY,
    token_hash varchar(64) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT uq_guest_session_token_hash UNIQUE (token_hash),
    CONSTRAINT ck_guest_session_token_hash CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

CREATE TABLE game_round (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES guest_session(id) ON DELETE CASCADE,
    card_1 integer NOT NULL CHECK (card_1 BETWEEN 1 AND 10),
    card_2 integer NOT NULL CHECK (card_2 BETWEEN 1 AND 10),
    card_3 integer NOT NULL CHECK (card_3 BETWEEN 1 AND 10),
    card_4 integer NOT NULL CHECK (card_4 BETWEEN 1 AND 10),
    outcome varchar(16) NOT NULL,
    timing_status varchar(16) NOT NULL,
    thinking_time_ms bigint,
    revision bigint NOT NULL DEFAULT 0,
    attempt_count integer NOT NULL DEFAULT 0,
    accepted_expression varchar(1024),
    assisted boolean NOT NULL DEFAULT false,
    revealed_solution varchar(1024),
    created_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT ck_game_round_outcome CHECK (outcome IN ('ACTIVE', 'SOLVED', 'REVEALED', 'SKIPPED')),
    CONSTRAINT ck_game_round_timing CHECK (
        (timing_status = 'NOT_CAPTURED' AND thinking_time_ms IS NULL)
        OR (timing_status = 'CAPTURED' AND thinking_time_ms IS NOT NULL AND thinking_time_ms >= 0 AND thinking_time_ms < 1800000)
        OR (timing_status = 'CAPPED' AND thinking_time_ms IS NOT NULL AND thinking_time_ms = 1800000)
    ),
    CONSTRAINT ck_game_round_revision CHECK (revision >= 0),
    CONSTRAINT ck_game_round_attempt_count CHECK (attempt_count >= 0),
    CONSTRAINT ck_game_round_completed CHECK (
        (outcome = 'ACTIVE' AND completed_at IS NULL)
        OR (outcome <> 'ACTIVE' AND completed_at IS NOT NULL)
    ),
    CONSTRAINT ck_game_round_answer CHECK (
        (outcome = 'SOLVED' AND accepted_expression IS NOT NULL
            AND timing_status IN ('CAPTURED', 'CAPPED') AND attempt_count > 0)
        OR (outcome <> 'SOLVED' AND accepted_expression IS NULL AND assisted = false)
    ),
    CONSTRAINT ck_game_round_solution CHECK (
        (outcome = 'REVEALED' AND revealed_solution IS NOT NULL)
        OR (outcome <> 'REVEALED' AND revealed_solution IS NULL)
    )
);

-- One guest's mutation lock is the primary coordination boundary; this also
-- protects the invariant against writes that do not use the application service.
CREATE UNIQUE INDEX uq_game_round_active_session
    ON game_round(session_id) WHERE outcome = 'ACTIVE';
CREATE INDEX ix_game_round_session_history
    ON game_round(session_id, created_at DESC, id DESC);

CREATE TABLE answer_attempt (
    id uuid PRIMARY KEY,
    round_id uuid NOT NULL REFERENCES game_round(id) ON DELETE CASCADE,
    operation_id uuid NOT NULL,
    attempt_number integer NOT NULL CHECK (attempt_number > 0),
    submitted_expression varchar(256) NOT NULL,
    status varchar(32) NOT NULL,
    interpreted_expression varchar(1024),
    evaluated_value integer,
    assisted boolean NOT NULL,
    message varchar(512) NOT NULL,
    submitted_at timestamp with time zone NOT NULL,
    CONSTRAINT uq_answer_attempt_number UNIQUE (round_id, attempt_number),
    CONSTRAINT uq_answer_attempt_operation UNIQUE (round_id, operation_id),
    CONSTRAINT ck_answer_attempt_status CHECK (status IN (
        'CORRECT', 'INVALID_SYNTAX', 'INVALID_CARD_USAGE', 'ILLEGAL_OPERATION', 'NOT_TWENTY_FOUR'
    )),
    CONSTRAINT ck_answer_attempt_correct CHECK (
        status <> 'CORRECT' OR (interpreted_expression IS NOT NULL AND evaluated_value IS NOT NULL AND evaluated_value = 24)
    ),
    CONSTRAINT ck_answer_attempt_assistance CHECK (assisted = false OR status = 'CORRECT')
);

CREATE TABLE game_operation (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES guest_session(id) ON DELETE CASCADE,
    operation_id uuid NOT NULL,
    kind varchar(24) NOT NULL,
    target_round_id uuid REFERENCES game_round(id) ON DELETE CASCADE,
    request_hash varchar(64) NOT NULL,
    response_json text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    CONSTRAINT uq_game_operation_key UNIQUE (session_id, operation_id),
    CONSTRAINT ck_game_operation_hash CHECK (request_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_game_operation_kind CHECK (kind IN (
        'CREATE_ROUND', 'CAPTURE_TIMING', 'SUBMIT_ANSWER', 'REVEAL_ROUND', 'SKIP_ROUND'
    )),
    CONSTRAINT ck_game_operation_target CHECK (
        (kind = 'CREATE_ROUND' AND target_round_id IS NULL)
        OR (kind <> 'CREATE_ROUND' AND target_round_id IS NOT NULL)
    )
);
