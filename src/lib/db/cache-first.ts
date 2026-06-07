import { existsSync } from "node:fs";
import { join } from "node:path";

const CACHE_DIR = join(process.cwd(), "data", "neon-cache");

/** When true, reads use JSON cache; writes use Neon HTTP (not TCP). */
export function isDbCacheFirst(): boolean {
  if (process.env.DB_CACHE_FIRST === "1") return true;
  if (process.env.DB_CACHE_FIRST === "0") return false;
  // Auto: use cache when psql export exists (Node TCP often ETIMEDOUT to us-east-1)
  return (
    existsSync(join(CACHE_DIR, "recommendations.json")) ||
    existsSync(join(CACHE_DIR, "portfolio-holdings.json"))
  );
}

export function shouldSkipDbReads(): boolean {
  return isDbCacheFirst();
}
