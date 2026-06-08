import { existsSync } from "node:fs";
import { join } from "node:path";
import { isVercel } from "@/lib/serverless";

const CACHE_DIR = join(process.cwd(), "data", "neon-cache");

function cacheJsonExists(): boolean {
  return (
    existsSync(join(CACHE_DIR, "recommendations.json")) ||
    existsSync(join(CACHE_DIR, "portfolio-holdings.json"))
  );
}

/** When true, reads prefer JSON cache; writes still use Neon HTTP when configured. */
export function isDbCacheFirst(): boolean {
  if (process.env.DB_CACHE_FIRST === "1") return true;
  if (process.env.DB_CACHE_FIRST === "0") return false;
  // Auto: use cache when psql export exists (Node TCP often ETIMEDOUT to us-east-1)
  return cacheJsonExists();
}

/**
 * Skip Neon reads only when cache-first is on AND JSON snapshots are on disk.
 * Vercel has no `data/neon-cache/*.json` (gitignored) — always read Neon there.
 */
export function shouldSkipDbReads(): boolean {
  if (!isDbCacheFirst()) return false;
  if (isVercel() && !cacheJsonExists()) return false;
  if (!cacheJsonExists()) return false;
  return true;
}
