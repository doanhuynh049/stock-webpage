import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const CACHE_DIR = join(process.cwd(), "data", "neon-cache");

export type CachedPortfolioRow = {
  user_id?: string;
  symbol: string;
  name: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  shares: number;
  avg_buy_price: number | null;
  target_3_month: number | null;
  target_long_term: number | null;
};

export type CachedRecommendationRow = {
  symbol: string;
  name: string | null;
  recommendation: string;
  price_at_recommendation: number;
  technical_score: number;
  fundamental_score: number;
  combined_score: number;
  recommendation_date: string;
};

function readJson<T>(filename: string): T | null {
  const path = join(CACHE_DIR, filename);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function dedupeBySymbol(rows: CachedPortfolioRow[]): CachedPortfolioRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const sym = r.symbol?.toUpperCase();
    if (!sym || seen.has(sym)) return false;
    seen.add(sym);
    return true;
  });
}

export function readCachedPortfolioHoldings(
  userId?: string,
): CachedPortfolioRow[] | null {
  const data = readJson<{ syncedAt: string; rows: CachedPortfolioRow[] }>(
    "portfolio-holdings.json",
  );
  if (!data?.rows?.length) return null;

  let rows = data.rows;
  if (userId) {
    const forUser = rows.filter((r) => r.user_id === userId);
    rows = forUser.length > 0 ? forUser : rows;
  }
  rows = dedupeBySymbol(rows);
  return rows.length ? rows : null;
}

export function readCachedRecommendations(): CachedRecommendationRow[] | null {
  const data = readJson<{ syncedAt: string; rows: CachedRecommendationRow[] }>(
    "recommendations.json",
  );
  return data?.rows?.length ? data.rows : null;
}

export function cacheSyncedAt(filename: string): string | null {
  const data = readJson<{ syncedAt: string }>(filename);
  return data?.syncedAt ?? null;
}
