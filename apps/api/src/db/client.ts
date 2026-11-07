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

/** Distinguish a real connectivity outage from query validation or business errors. */
export function isDatabaseConnectivityError(error: unknown): boolean {
  const candidate = error as { code?: unknown; errorCode?: unknown; message?: unknown };
  const code = typeof candidate?.code === "string" ? candidate.code : typeof candidate?.errorCode === "string" ? candidate.errorCode : "";
  if (["P1001", "P1002", "P1017", "P2024"].includes(code)) return true;
  const message = typeof candidate?.message === "string" ? candidate.message : "";
  return /can't reach database server|connection (?:refused|timed out|closed)|socket hang up|econnrefused|etimedout/i.test(message);
}

export function databaseUnavailableError(cause?: unknown): AppError {
  setDatabaseOnline(false);
  return new AppError(503, "UPSTREAM_UNAVAILABLE", "The database is temporarily unavailable. Check the connection and retry.", { cause, expose: true });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [],
    transactionOptions: { maxWait: 10000, timeout: 60000 },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
