import { PrismaClient } from "@prisma/client";

// Single shared client — Prisma manages its own connection pool.
export const prisma = new PrismaClient();
