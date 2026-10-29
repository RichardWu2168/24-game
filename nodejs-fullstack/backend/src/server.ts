
import app from "./app.js";
import { getPort } from "./config/env.js";
import { prisma } from "./database/prisma.js";
import { createShutdownHandler } from "./http/shutdown.js";

const port = getPort();

const server = app.listen(port, () => {
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    console.log(`Backend server is running at http://localhost:${actualPort}`);
});

const shutdown = createShutdownHandler(server, () => prisma.$disconnect());
const reportError = (error: unknown) => { console.error(error); process.exitCode = 1; };
process.once("SIGINT", () => { void shutdown().catch(reportError); });
process.once("SIGTERM", () => { void shutdown().catch(reportError); });
server.once("error", error => {
    reportError(error);
    void prisma.$disconnect().catch(reportError);
});
