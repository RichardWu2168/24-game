import "dotenv/config";

export function getDatabaseUrl(): string {
    const url = process.env.DATABASE_URL_POOLED?.trim() || process.env.DATABASE_URL?.trim();
    if (!url) throw new Error("DATABASE_URL_POOLED or DATABASE_URL must be configured.");
    return url;
}

export function getAllowedOrigins(): string[] {
    return (process.env.FRONTEND_URL ?? "").split(",").map(url => url.trim()).filter(Boolean);
}

export function getPort(): number {
    const raw = (process.env.PORT ?? "3000").trim();
    const port = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error("PORT must be an integer between 0 and 65535.");
    }
    return port;
}
