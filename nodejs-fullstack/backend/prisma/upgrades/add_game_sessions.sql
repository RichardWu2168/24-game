BEGIN;

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "sessionId" TEXT;

-- CreateTable
CREATE TABLE "GameSession" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameSession_pkey" PRIMARY KEY ("id")
);

-- Old games have no browser ownership information. Preserve each game's
-- history in its own legacy session; this also preserves the one-active-game
-- invariant when the next migration installs its partial unique index.
INSERT INTO "GameSession" ("id", "createdAt")
SELECT 'legacy:' || "id", "createdAt" FROM "Game";

UPDATE "Game" SET "sessionId" = 'legacy:' || "id";

ALTER TABLE "Game" ALTER COLUMN "sessionId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Game_sessionId_createdAt_idx" ON "Game"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
