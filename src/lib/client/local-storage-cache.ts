const PREFIX = "vnstocks:";

export type LocalCacheEntry<T> = {
  data: T;
  syncedAt: string;
};

export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/** Read JSON from localStorage if within TTL. Returns null on SSR, miss, or expiry. */
export function readLocalCache<T>(key: string, ttlMs: number): T | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as LocalCacheEntry<T>;
    if (!entry?.syncedAt) return null;
    if (Date.now() - new Date(entry.syncedAt).getTime() > ttlMs) return null;
    return entry.data;
  } catch {
    return null;
  }
}

/** Persist JSON to localStorage (no-op on SSR or quota errors). */
export function writeLocalCache<T>(key: string, data: T): void {
  if (!isBrowser()) return;
  try {
    const entry: LocalCacheEntry<T> = {
      data,
      syncedAt: new Date().toISOString(),
    };
    localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    /* quota or private mode */
  }
}

export function removeLocalCache(key: string): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

export const LOCAL_CACHE_TTL = {
  market: 6 * 60 * 60 * 1000,
  news: 60 * 60 * 1000,
  portfolio: 24 * 60 * 60 * 1000,
  watchlistAddPrice: Infinity,
  aiScreening: 30 * 60 * 1000,
  aiScreeningWeights: Infinity,
  aiHoldings: 30 * 60 * 1000,
  swingScreen: 30 * 60 * 1000,
  // News/sentiment data trickles in over hours, not seconds — "refresh
  // every few hours" per the AI News module's own spec, deliberately
  // longer than the 30-min AI Analyst/Screening TTLs above.
  newsSentiment: 2 * 60 * 60 * 1000,
  newsSentimentPortfolio: 2 * 60 * 60 * 1000,
  // Statistical, not LLM-backed — underlying price/technical/fundamental
  // snapshots don't change intraday in this app, so an hourly TTL is plenty.
  prediction: 60 * 60 * 1000,
  predictionPortfolio: 60 * 60 * 1000,
} as const;

export const LOCAL_CACHE_KEYS = {
  market: "market-snapshot",
  newsMarket: "news-market",
  newsSymbol: (symbol: string) => `news-${symbol.toUpperCase()}`,
  portfolioHoldings: "portfolio-holdings",
  watchlistAddPrice: (symbol: string) => `watchlist-add-${symbol.toUpperCase()}`,
  aiScreening: "ai-screening",
  aiScreeningWeights: "ai-screening-weights",
  aiHoldings: "ai-holdings",
  swingScreen: (universeLabel: string) => `swing-${universeLabel.toLowerCase()}`,
  newsSentiment: (symbol: string) => `news-sentiment-${symbol.toUpperCase()}`,
  newsSentimentPortfolio: "news-sentiment-portfolio",
  prediction: (symbol: string) => `prediction-${symbol.toUpperCase()}`,
  predictionPortfolio: "prediction-portfolio",
} as const;
