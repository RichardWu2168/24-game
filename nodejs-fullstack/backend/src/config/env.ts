import "dotenv/config";

export function getDatabaseUrl(): string {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not configured.");
    return url;
}

export function getAllowedOrigins(): string[] {
    return (process.env.FRONTEND_URL ?? "").split(",").map(url => url.trim()).filter(Boolean);
}
