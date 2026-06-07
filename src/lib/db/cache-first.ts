/** When true, prefer psql-synced JSON cache over Node→Neon TCP (avoids ETIMEDOUT waits). */
export function isDbCacheFirst(): boolean {
  return process.env.DB_CACHE_FIRST === "1";
}
