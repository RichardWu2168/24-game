BEGIN;

ALTER TABLE "Game" DROP CONSTRAINT "Game_duration_valid";

-- PostgreSQL's default float-to-integer cast rounds. Use floor explicitly so
-- existing durations match the backend's whole elapsed-second calculation.
-- NULL remains NULL. Out-of-range values fail and roll back the transaction.
ALTER TABLE "Game"
ALTER COLUMN "durationSeconds" TYPE INTEGER
USING floor("durationSeconds")::INTEGER;

-- INTEGER enforces whole seconds; unfinished and legacy games may stay NULL.
ALTER TABLE "Game" ADD CONSTRAINT "Game_duration_valid" CHECK (
    "durationSeconds" IS NULL OR (
        "status" = 'COMPLETED' AND "durationSeconds" >= 0
    )
);

COMMIT;
