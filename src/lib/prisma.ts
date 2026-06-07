import dns from "node:dns";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool as PgPool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import {
  normalizeDatabaseUrl,
  resolveRuntimeDatabaseUrl,
} from "@/lib/database-url";
import { isPersistenceEnabled } from "@/lib/persistence";

dns.setDefaultResultOrder("ipv4first");

type DbDriver = "auto" | "http" | "pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: PgPool;
};

function getConnectionString(): string {
  return normalizeDatabaseUrl(resolveRuntimeDatabaseUrl());
}

function getDriver(): DbDriver {
  const raw = (process.env.DB_DRIVER ?? "auto").toLowerCase();
  if (raw === "http" || raw === "pg") return raw;
  return "auto";
}

function getPgPool(): PgPool {
  if (!globalForPrisma.pgPool) {
    const connectionString = getConnectionString();
    const isLocal =
      connectionString.includes("localhost") ||
      connectionString.includes("127.0.0.1");

    globalForPrisma.pgPool = new PgPool({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 6_000,
      idleTimeoutMillis: 60_000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      ssl: isLocal ? false : { rejectUnauthorized: true },
    });
    globalForPrisma.pgPool.on("error", (err) => {
      console.error("[pg] pool error:", err.message);
    });
  }
  return globalForPrisma.pgPool;
}

function createPrismaClient(): PrismaClient {
  const connectionString = getConnectionString();
  const driver = getDriver();
  // auto = TCP/pg (Next.js Node server). Use DB_DRIVER=http only for edge/serverless.
  const useHttp = driver === "http";

  const adapter = useHttp
    ? new PrismaNeonHttp(connectionString, {})
    : new PrismaPg(getPgPool());

  if (process.env.NODE_ENV === "development" && !globalForPrisma.prisma) {
    const host = (() => {
      try {
        return new URL(connectionString).hostname;
      } catch {
        return "unknown";
      }
    })();
    console.info(
      `[prisma] ${useHttp ? "Neon HTTP" : "node-postgres TCP"} → ${host}`,
    );
  }

  return new PrismaClient({ adapter, log: [] });
}

function getPrismaClient(): PrismaClient {
  if (!isPersistenceEnabled()) {
    throw new Error(
      "[prisma] Persistence disabled — set PERSISTENCE_ENABLED=true and DATABASE_URL",
    );
  }
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol) {
    const client = getPrismaClient();
    const value = client[prop as keyof PrismaClient];
    return typeof value === "function" ? value.bind(client) : value;
  },
});

if (process.env.NODE_ENV !== "production" && isPersistenceEnabled()) {
  globalForPrisma.prisma ??= createPrismaClient();
}
