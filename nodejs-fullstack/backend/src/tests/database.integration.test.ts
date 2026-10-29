import "dotenv/config";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { prisma } from "../database/prisma.js";
import { withSessionTransaction } from "../database/transaction.js";
import { createGameRepository } from "../features/games/game.repository.js";
import { createGameService } from "../features/games/game.service.js";

after(async () => { await prisma.$disconnect(); });

test("real history pagination rejects missing, deleted, and foreign-session cursors", async () => {
    const rollback = new Error("Rollback cursor test");
    await assert.rejects(prisma.$transaction(async tx => {
        const owner = `cursor-test-${randomUUID()}`;
        const other = `cursor-other-${randomUUID()}`;
        await tx.gameSession.createMany({ data: [{ id: owner }, { id: other }] });
        const own = await tx.game.create({ data: { sessionId: owner, numbers: [1, 2, 3, 4] } });
        const older = await tx.game.create({ data: { sessionId: owner, numbers: [1, 2, 3, 4], status: "COMPLETED", createdAt: new Date("2020-01-01") } });
        const foreign = await tx.game.create({ data: { sessionId: other, numbers: [1, 2, 3, 4] } });
        const service = createGameService(createGameRepository(tx));
        const invalid = (error: unknown) => error instanceof Error && "code" in error && error.code === "INVALID_CURSOR";
        await assert.rejects(service.listGames(owner, { limit: 1, cursor: "does-not-exist" }), invalid);
        await assert.rejects(service.listGames(owner, { limit: 1, cursor: foreign.id }), invalid);
        const first = await service.listGames(owner, { limit: 1 });
        assert.equal(first.nextCursor, own.id);
        assert.equal(first.hasMore, true);
        const next = await service.listGames(owner, { limit: 1, cursor: first.nextCursor! });
        assert.deepEqual(next.games.map(game => game.id), [older.id]);
        await tx.game.delete({ where: { id: older.id } });
        await assert.rejects(service.listGames(owner, { limit: 1, cursor: older.id }), invalid);
        throw rollback;
    }), error => error === rollback);
});

const integerMigrationPath = "prisma/migrations/20261028220000_duration_seconds_integer/migration.sql";

async function withFloatDurationSchema(work: (client: Client) => Promise<void>) {
    const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
    await client.connect();
    try {
        await client.query("BEGIN");
        const schema = `duration_migration_${randomUUID().replaceAll("-", "")}`;
        await client.query(`CREATE SCHEMA "${schema}"`);
        await client.query(`SET LOCAL search_path TO "${schema}"`);
        for (const name of ["20261027134456_init_game_history", "20261027203849_add_game_sessions", "20261027204208_enforce_one_active_game_per_session", "20261028190000_add_game_duration"]) {
            await client.query(await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"));
        }
        await client.query(`INSERT INTO "GameSession" (id) VALUES ('owner')`);
        await client.query(`INSERT INTO "Game" (id, "sessionId", numbers, status, "gotItAt", "durationSeconds") VALUES
            ('fractional', 'owner', ARRAY[1,2,3,4], 'COMPLETED', '2026-01-01 00:00:18.875', 18.875),
            ('legacy', 'owner', ARRAY[1,2,3,4], 'COMPLETED', NULL, NULL),
            ('active', 'owner', ARRAY[1,2,3,4], 'IN_PROGRESS', NULL, NULL),
            ('abandoned', 'owner', ARRAY[1,2,3,4], 'ABANDONED', NULL, NULL)`);
        await client.query(`INSERT INTO "GameAttempt" (id, "gameId", expression, "isCorrect") VALUES ('attempt', 'fractional', '1*2*3*4', true)`);
        await work(client);
    } finally {
        await client.query("ROLLBACK");
        await client.end();
    }
}

async function integerMigrationSql() {
    // The test owns the outer transaction and always rolls back its schema.
    return (await readFile(integerMigrationPath, "utf8")).replace(/^BEGIN;\s*/, "").replace(/\s*COMMIT;\s*$/, "");
}

test("integer duration migration preserves records, nullable fields, and the completion constraint", async () => {
    await withFloatDurationSchema(async client => {
        const snapshot = `SELECT to_jsonb(g) - 'durationSeconds' AS record FROM "Game" g ORDER BY id`;
        const before = (await client.query(snapshot)).rows;
        await client.query(await integerMigrationSql());
        assert.deepEqual((await client.query(snapshot)).rows, before);
        assert.equal((await client.query(`SELECT count(*)::int AS count FROM "GameAttempt"`)).rows[0].count, 1);
        assert.equal((await client.query(`SELECT count(*)::int AS count FROM "GameSession"`)).rows[0].count, 1);
        const durations = (await client.query(`SELECT id, "durationSeconds" FROM "Game" ORDER BY id`)).rows;
        assert.deepEqual(durations, [
            { id: "abandoned", durationSeconds: null }, { id: "active", durationSeconds: null },
            { id: "fractional", durationSeconds: 18 }, { id: "legacy", durationSeconds: null },
        ]);
        const columns = (await client.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = 'Game' AND column_name IN ('gotItAt', 'durationSeconds') ORDER BY column_name`)).rows;
        assert.deepEqual(columns, [
            { column_name: "durationSeconds", data_type: "integer", is_nullable: "YES" },
            { column_name: "gotItAt", data_type: "timestamp without time zone", is_nullable: "YES" },
        ]);
        for (const [id, duration] of [["active", 1], ["abandoned", 1], ["fractional", -1]]) {
            await client.query("SAVEPOINT invalid_duration");
            await assert.rejects(client.query(`UPDATE "Game" SET "durationSeconds" = $1 WHERE id = $2`, [duration, id]),
                (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "23514");
            await client.query("ROLLBACK TO SAVEPOINT invalid_duration");
        }
        await client.query(`UPDATE "Game" SET "durationSeconds" = 0 WHERE id = 'fractional'`);
    });
});

test("an out-of-range duration aborts integer conversion without changing existing records or schema", async () => {
    await withFloatDurationSchema(async client => {
        await client.query(`UPDATE "Game" SET "durationSeconds" = 2147483648 WHERE id = 'fractional'`);
        const before = (await client.query(`SELECT * FROM "Game" ORDER BY id`)).rows;
        await client.query("SAVEPOINT conversion");
        await assert.rejects(client.query(await integerMigrationSql()),
            (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "22003");
        await client.query("ROLLBACK TO SAVEPOINT conversion");
        assert.deepEqual((await client.query(`SELECT * FROM "Game" ORDER BY id`)).rows, before);
        assert.equal((await client.query(`SELECT data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='Game' AND column_name='durationSeconds'`)).rows[0].data_type, "double precision");
    });
});

test("PostgreSQL stores the Got It duration on completion and leaves abandoned games null", async () => {
    const rollback = new Error("Rollback duration test");
    await assert.rejects(prisma.$transaction(async tx => {
        const sessionId = `duration-test-${randomUUID()}`;
        await tx.gameSession.create({ data: { id: sessionId } });
        const createdAt = new Date(Date.now() - 200_000);
        const game = await tx.game.create({ data: { sessionId, numbers: [3, 5, 4, 1], createdAt } });
        const service = createGameService(createGameRepository(tx));
        await service.recordGotIt(sessionId, game.id, 18.125);
        let saved = await tx.game.findUniqueOrThrow({ where: { id: game.id } });
        assert.equal(saved.status, "IN_PROGRESS");
        assert.equal(saved.durationSeconds, null);
        assert.ok(saved.gotItAt instanceof Date);
        assert.equal(saved.capturedDurationSeconds, 18);
        await service.submitAnswer({ gameId: game.id, numbers: game.numbers, expression: "3+5+4+1" }, sessionId);
        assert.equal((await tx.game.findUniqueOrThrow({ where: { id: game.id } })).durationSeconds, null);
        await service.submitAnswer({ gameId: game.id, numbers: game.numbers, expression: "(3+5)*(4-1)" }, sessionId);
        saved = await tx.game.findUniqueOrThrow({ where: { id: game.id } });
        assert.equal(saved.status, "COMPLETED");
        assert.equal(saved.durationSeconds, 18);
        const history = await service.listGames(sessionId, { limit: 20 });
        assert.equal(history.games[0].durationSeconds, 18);
        assert.equal((await service.getGame(sessionId, game.id)).durationSeconds, 18);
        const abandoned = await tx.game.create({ data: { sessionId, numbers: [3, 5, 4, 1], createdAt } });
        await service.recordGotIt(sessionId, abandoned.id, 155);
        await createGameRepository(tx).abandonGame(sessionId, abandoned.id);
        assert.equal((await tx.game.findUniqueOrThrow({ where: { id: abandoned.id } })).durationSeconds, null);
        // The database also rejects a duration on an unfinished game.
        await tx.$executeRawUnsafe("SAVEPOINT duration_check");
        await assert.rejects(tx.game.update({ where: { id: abandoned.id }, data: { durationSeconds: 155 } }));
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT duration_check");
        const zero = await tx.game.create({ data: { sessionId, numbers: [3, 5, 4, 1], createdAt } });
        await service.recordGotIt(sessionId, zero.id, 0);
        await service.submitAnswer({ gameId: zero.id, numbers: zero.numbers, expression: "(3+5)*(4-1)" }, sessionId);
        assert.equal((await tx.game.findUniqueOrThrow({ where: { id: zero.id } })).durationSeconds, 0);
        const direct = await tx.game.create({ data: { sessionId, numbers: [3, 5, 4, 1], createdAt } });
        await service.submitAnswer({ durationSeconds: 47, gameId: direct.id, numbers: direct.numbers, expression: "(3+5)*(4-1)" }, sessionId);
        const completed = await tx.game.findUniqueOrThrow({ where: { id: direct.id } });
        assert.equal(completed.status, "COMPLETED");
        assert.equal(completed.gotItAt, null);
        assert.ok(completed.durationSeconds !== null && Number.isInteger(completed.durationSeconds));
        assert.equal(completed.durationSeconds, 47);
        assert.equal((await service.getGame(sessionId, direct.id)).durationSeconds, completed.durationSeconds);
        throw rollback;
    }), error => error === rollback);
});

test("clearing finished history preserves active games, their attempts, and other sessions", async () => {
    const rollback = new Error("Rollback history deletion test");
    await assert.rejects(prisma.$transaction(async tx => {
        const owner = `clear-test-${randomUUID()}`;
        const other = `keep-test-${randomUUID()}`;
        await tx.gameSession.createMany({ data: [{ id: owner }, { id: other }] });
        const first = await tx.game.create({ data: { sessionId: owner, numbers: [1, 2, 3, 4] } });
        const second = await tx.game.create({ data: { sessionId: owner, numbers: [3, 5, 4, 1], status: "COMPLETED" } });
        const abandoned = await tx.game.create({ data: { sessionId: owner, numbers: [1, 2, 3, 4], status: "ABANDONED" } });
        const kept = await tx.game.create({ data: { sessionId: other, numbers: [1, 2, 3, 4] } });
        await tx.gameAttempt.createMany({ data: [first, second, abandoned, kept].map(game => ({ gameId: game.id, expression: "1*2*3*4", isCorrect: true })) });
        assert.equal(await createGameRepository(tx).deleteFinishedGames(owner), 2);
        assert.equal(await tx.game.count({ where: { sessionId: owner } }), 1);
        assert.equal(await tx.gameAttempt.count({ where: { gameId: { in: [second.id, abandoned.id] } } }), 0);
        assert.equal(await tx.gameAttempt.count({ where: { gameId: first.id } }), 1);
        assert.equal((await tx.game.findUniqueOrThrow({ where: { id: first.id } })).status, "IN_PROGRESS");
        assert.equal(await tx.game.count({ where: { sessionId: other } }), 1);
        assert.equal(await tx.gameAttempt.count({ where: { gameId: kept.id } }), 1);
        assert.equal(await tx.gameSession.count({ where: { id: owner } }), 1);
        throw rollback;
    }), error => error === rollback);
});

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
