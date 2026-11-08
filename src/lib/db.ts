import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // DATABASE_URL (Neon integration / manual) or POSTGRES_PRISMA_URL (Vercel's Supabase integration).
    datasourceUrl: process.env.DATABASE_URL ?? process.env.POSTGRES_PRISMA_URL,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Tx = Prisma.TransactionClient;
export { Prisma };
