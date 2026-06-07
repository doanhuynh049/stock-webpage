import { resolveDatabaseUrl } from "@/lib/database-url";

/**
 * Mirrors stock-service `PERSISTENCE_ENABLED`.
 * When false, the app uses JSON/cache fallbacks and skips Neon round-trips.
 */
export function isPersistenceEnabled(): boolean {
  const flag = process.env.PERSISTENCE_ENABLED?.trim().toLowerCase();
  if (flag === "false") return false;
  return resolveDatabaseUrl().length > 0;
}
