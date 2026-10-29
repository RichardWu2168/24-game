import { test } from "node:test";
import assert from "node:assert/strict";
import { getPort } from "./env.js";

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
