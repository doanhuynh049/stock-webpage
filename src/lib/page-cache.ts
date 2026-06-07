import { unstable_cache } from "next/cache";

export type PageCacheOptions = {
  /** Seconds before revalidation; default 120 */
  revalidate?: number | false;
  tags?: string[];
};

/**
 * Server-side page data cache (Next.js `unstable_cache`).
 * Use per-route keys that include userId when data is user-specific.
 */
export function pageCache<T>(
  keyParts: string[],
  fn: () => Promise<T>,
  opts: PageCacheOptions = {},
): Promise<T> {
  const revalidate = opts.revalidate ?? 120;
  return unstable_cache(fn, keyParts, {
    revalidate,
    tags: opts.tags,
  })();
}

/** Standard revalidate windows per data class */
export const CACHE_TTL = {
  portfolio: 90,
  trading: 60,
  analysis: 300,
  market: 300,
  stockDetail: 120,
} as const;
