ALTER TABLE "Game" ADD COLUMN "capturedDurationSeconds" INTEGER;
ALTER TABLE "Game" ADD CONSTRAINT "Game_captured_duration_valid" CHECK (
    "capturedDurationSeconds" IS NULL OR "capturedDurationSeconds" >= 0
);
