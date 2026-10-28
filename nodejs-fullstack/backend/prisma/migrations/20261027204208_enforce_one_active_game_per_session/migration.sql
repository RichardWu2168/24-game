CREATE UNIQUE INDEX "Game_one_active_per_session"
ON "Game" ("sessionId")
WHERE "status" = 'IN_PROGRESS';