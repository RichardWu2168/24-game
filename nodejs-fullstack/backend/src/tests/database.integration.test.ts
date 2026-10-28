import "dotenv/config";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { prisma } from "../database/prisma.js";
import { withSessionTransaction } from "../database/transaction.js";

after(async () => { await prisma.$disconnect(); });

test("PostgreSQL session locks serialize independent Prisma transactions", async () => {
    const sessionId = `test-${randomUUID()}`;
    let active = 0;
    let maximumActive = 0;
    await Promise.all([1, 2, 3].map(() => withSessionTransaction(sessionId, async () => {
        active++;
        maximumActive = Math.max(active, maximumActive);
        await new Promise(resolve => setTimeout(resolve, 20));
        active--;
    })));
    assert.equal(maximumActive, 1);
});

test("Prisma rolls back database changes when a session transaction fails", async () => {
    const schema = `rollback_test_${randomUUID().replaceAll("-", "")}`;
    await assert.rejects(withSessionTransaction(schema, async (transaction) => {
        // The identifier is generated internally and contains only letters,
        // digits, and underscores. No application tables are modified.
        await transaction.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
        throw new Error("Injected transaction failure");
    }), /Injected transaction failure/);
    const schemas = await prisma.$queryRaw<{ nspname: string }[]>`SELECT nspname FROM pg_namespace WHERE nspname = ${schema}`;
    assert.deepEqual(schemas, []);
});

// Opt-in tests: create an isolated schema inside a transaction and roll it all
// back. They never migrate or reset the application's schema.
for (const populated of [false, true]) {
    test(`legacy session upgrade preserves ${populated ? "existing games and attempts" : "an empty database"}`, async () => {
        assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for database integration tests.");
        const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
        await client.connect();
        try {
            await client.query("BEGIN");
            const schema = `migration_test_${randomUUID().replaceAll("-", "")}`;
            await client.query(`CREATE SCHEMA "${schema}"`);
            await client.query(`SET LOCAL search_path TO "${schema}"`);
            await client.query(await readFile("prisma/migrations/20261027134456_init_game_history/migration.sql", "utf8"));
            if (populated) {
                await client.query(`INSERT INTO "Game" ("id", "numbers", "status") VALUES
                    ('old-1', ARRAY[3,5,4,1], 'IN_PROGRESS'),
                    ('old-2', ARRAY[1,2,3,4], 'IN_PROGRESS'),
                    ('old-3', ARRAY[2,3,4,5], 'COMPLETED')`);
                await client.query(`INSERT INTO "GameAttempt" ("id", "gameId", "expression", "isCorrect")
                    VALUES ('attempt-1', 'old-1', '(3+5)*(4-1)', true)`);
            }
            const upgrade = await readFile("prisma/upgrades/add_game_sessions.sql", "utf8");
            // The test owns the transaction so the upgrade's COMMIT must not
            // commit our temporary schema. All actual DDL/DML runs unchanged.
            await client.query(upgrade.replace(/^BEGIN;\s*/, "").replace(/\s*COMMIT;\s*$/, ""));
            await client.query(await readFile("prisma/migrations/20261027204208_enforce_one_active_game_per_session/migration.sql", "utf8"));
            const games = await client.query(`SELECT "id", "sessionId", "status" FROM "Game" ORDER BY "id"`);
            assert.equal(games.rows.length, populated ? 3 : 0);
            if (populated) {
                assert.deepEqual(games.rows.map(game => game.sessionId), ['legacy:old-1', 'legacy:old-2', 'legacy:old-3']);
                assert.deepEqual(games.rows.map(game => game.status), ['IN_PROGRESS', 'IN_PROGRESS', 'COMPLETED']);
                const attempts = await client.query(`SELECT "gameId", "expression", "isCorrect" FROM "GameAttempt"`);
                assert.deepEqual(attempts.rows, [{ gameId: 'old-1', expression: '(3+5)*(4-1)', isCorrect: true }]);
                await client.query("SAVEPOINT unique_check");
                await assert.rejects(
                    client.query(`INSERT INTO "Game" ("id", "sessionId", "numbers") VALUES ('duplicate', 'legacy:old-1', ARRAY[1,2,3,4])`),
                    (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "23505",
                );
                await client.query("ROLLBACK TO SAVEPOINT unique_check");
            }
        } finally {
            await client.query("ROLLBACK");
            await client.end();
        }
    });
}
