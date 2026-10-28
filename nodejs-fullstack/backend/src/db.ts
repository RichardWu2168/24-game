import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "./generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
}

const adapter = new PrismaPg({ connectionString });

export const prisma = new PrismaClient({ adapter });

export function withSessionTransaction<T>(
    sessionId: string,
    work: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
    return prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sessionId}, 0))`;
        return work(transaction);
    }, { isolationLevel: "ReadCommitted" });
}
