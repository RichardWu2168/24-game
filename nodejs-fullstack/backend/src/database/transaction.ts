import { prisma } from "./prisma.js";
import type { Prisma } from "../generated/prisma/client.js";

export function withSessionTransaction<T>(
    sessionId: string,
    work: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
    return prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${sessionId}, 0))`;
        return work(transaction);
    }, { isolationLevel: "ReadCommitted" });
}
