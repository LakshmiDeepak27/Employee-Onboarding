import { PrismaClient } from "@prisma/client";
import net from "net";
import { AppError } from "../lib/errors.js";

export * from "@prisma/client";

let isDbReachableState: boolean | null = null;

export async function checkDatabaseConnection(): Promise<boolean> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    isDbReachableState = false;
    return false;
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname || "localhost";
    const port = Number(parsed.port) || 5432;
    return new Promise((resolve) => {
      const socket = net.createConnection({ host, port, timeout: 4000 });
      socket.on("connect", () => {
        socket.destroy();
        isDbReachableState = true;
        resolve(true);
      });
      socket.on("timeout", () => {
        socket.destroy();
        isDbReachableState = false;
        resolve(false);
      });
      socket.on("error", () => {
        socket.destroy();
        isDbReachableState = false;
        resolve(false);
      });
    });
  } catch {
    isDbReachableState = false;
    return false;
  }
}

export function isDatabaseOnline(): boolean {
  if (isDbReachableState === null) {
    // If not probed yet, assume false until verified to prevent blocking requests
    return false;
  }
  return isDbReachableState;
}

export function setDatabaseOnline(online: boolean) {
  isDbReachableState = online;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [],
    transactionOptions: { maxWait: 10000, timeout: 60000 },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
