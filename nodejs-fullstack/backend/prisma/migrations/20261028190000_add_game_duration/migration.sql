ALTER TABLE "Game"
ADD COLUMN "gotItAt" TIMESTAMP(3),
ADD COLUMN "durationSeconds" DOUBLE PRECISION;

-- Existing games have no recorded Got It time, so their duration stays NULL.
ALTER TABLE "Game" ADD CONSTRAINT "Game_duration_valid" CHECK (
    "durationSeconds" IS NULL OR (
        "status" = 'COMPLETED' AND "durationSeconds" >= 0
        AND "durationSeconds" < 'Infinity'::double precision
    )
);
