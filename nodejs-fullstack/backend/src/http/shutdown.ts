import type { Server } from "node:http";

export function createShutdownHandler(server: Server, disconnect: () => Promise<void>, timeoutMs = 10_000) {
    let shutdown: Promise<void> | undefined;
    return () => {
        if (shutdown) return shutdown;
        shutdown = (async () => {
            const timeout = setTimeout(() => {
                console.error("Graceful shutdown timed out.");
                server.closeAllConnections();
                process.exit(1);
            }, timeoutMs);
            timeout.unref();
            try {
                // Drain existing HTTP requests before closing their database.
                await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
            } finally {
                try { await disconnect(); } finally { clearTimeout(timeout); }
            }
        })();
        return shutdown;
    };
}
