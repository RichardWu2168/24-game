import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, get } from "node:http";
import { createShutdownHandler } from "./shutdown.js";

test("shutdown closes the HTTP listener before disconnecting Prisma and runs once", async () => {
    const server = createServer();
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    let disconnected = 0;
    const shutdown = createShutdownHandler(server, async () => {
        assert.equal(server.listening, false);
        disconnected++;
    });
    const first = shutdown();
    assert.equal(shutdown(), first);
    await first;
    assert.equal(disconnected, 1);
});

test("shutdown waits for an in-flight HTTP response before disconnecting Prisma", async () => {
    let finishResponse!: () => void;
    let received!: () => void;
    const requestReceived = new Promise<void>(resolve => { received = resolve; });
    const server = createServer((_req, res) => {
        finishResponse = () => res.end("finished");
        received();
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    let disconnected = false;
    const shutdown = createShutdownHandler(server, async () => { disconnected = true; });
    try {
        const response = new Promise<string>((resolve, reject) => {
            get(`http://127.0.0.1:${address.port}`, res => {
                let body = "";
                res.on("data", chunk => { body += chunk; });
                res.on("end", () => resolve(body));
                res.on("error", reject);
            }).on("error", reject);
        });
        await requestReceived;
        const closing = shutdown();
        assert.equal(disconnected, false);
        finishResponse();
        assert.equal(await response, "finished");
        await closing;
        assert.equal(disconnected, true);
    } finally {
        if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
    }
});
