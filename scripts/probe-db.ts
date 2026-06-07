/**
 * Runtime DB probe — prisma db push uses a different engine than Next.js Node runtime.
 * Run: npx tsx scripts/probe-db.ts
 */
import dns from "node:dns";
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";
import {
  isNeonDatabase,
  normalizeDatabaseUrl,
  resolveRuntimeDatabaseUrl,
} from "../src/lib/database-url";

config();
dns.setDefaultResultOrder("ipv4first");

const url = normalizeDatabaseUrl(resolveRuntimeDatabaseUrl());
if (!url) {
  console.error("probe-db: no DATABASE_URL");
  process.exit(1);
}

async function probeHttp(): Promise<boolean> {
  if (!isNeonDatabase(url)) return false;
  try {
    const sql = neon(url);
    const rows = await sql`SELECT 1 AS ok`;
    console.log("[probe-db] Neon HTTP: OK", rows);
    return true;
  } catch (e) {
    console.error("[probe-db] Neon HTTP: FAIL", (e as Error).message);
    return false;
  }
}

async function probePg(): Promise<boolean> {
  const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
  const pool = new Pool({
    connectionString: url,
    connectionTimeoutMillis: 15_000,
    ssl: isLocal ? false : { rejectUnauthorized: true },
  });
  try {
    const r = await pool.query("SELECT 1 AS ok");
    console.log("[probe-db] node-postgres TCP: OK", r.rows);
    return true;
  } catch (e) {
    console.error("[probe-db] node-postgres TCP: FAIL", (e as Error).message);
    return false;
  } finally {
    await pool.end();
  }
}

async function main() {
  const httpOk = await probeHttp();
  const pgOk = httpOk ? true : await probePg();
  process.exit(httpOk || pgOk ? 0 : 1);
}

main().catch((e) => {
  console.error("[probe-db] fatal:", (e as Error).message);
  process.exit(1);
});
