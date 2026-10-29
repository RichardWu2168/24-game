import { test } from "node:test";
import assert from "node:assert/strict";
import { getDatabaseUrl, getPort } from "./env.js";

test("runtime database URL prefers pooled and falls back when pooled is absent or blank", t => {
    const previous = { DATABASE_URL: process.env.DATABASE_URL, DATABASE_URL_POOLED: process.env.DATABASE_URL_POOLED };
    t.after(() => {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    });
    process.env.DATABASE_URL = "postgresql://direct.example.invalid/test";
    process.env.DATABASE_URL_POOLED = "  postgresql://pool.example.invalid/test  ";
    assert.equal(getDatabaseUrl(), "postgresql://pool.example.invalid/test");
    delete process.env.DATABASE_URL_POOLED;
    assert.equal(getDatabaseUrl(), process.env.DATABASE_URL);
    for (const blank of ["", "   "]) {
        process.env.DATABASE_URL_POOLED = blank;
        assert.equal(getDatabaseUrl(), process.env.DATABASE_URL);
    }
    process.env.DATABASE_URL_POOLED = "postgresql://pool.example.invalid/test";
    delete process.env.DATABASE_URL;
    assert.equal(getDatabaseUrl(), process.env.DATABASE_URL_POOLED);
    process.env.DATABASE_URL_POOLED = " ";
    assert.throws(getDatabaseUrl, /DATABASE_URL_POOLED or DATABASE_URL must be configured/);
});

test("PORT defaults to 3000 and accepts configured or ephemeral ports", t => {
    const previous = process.env.PORT;
    t.after(() => { if (previous === undefined) delete process.env.PORT; else process.env.PORT = previous; });
    delete process.env.PORT;
    assert.equal(getPort(), 3000);
    for (const [raw, expected] of [["4000", 4000], ["0", 0], [" 5174 ", 5174]] as const) {
        process.env.PORT = raw;
        assert.equal(getPort(), expected);
    }
});

test("PORT rejects malformed and out-of-range values", t => {
    const previous = process.env.PORT;
    t.after(() => { if (previous === undefined) delete process.env.PORT; else process.env.PORT = previous; });
    for (const value of ["", "-1", "65536", "3.5", "abc"]) {
        process.env.PORT = value;
        assert.throws(getPort, /PORT must be an integer/);
    }
});
