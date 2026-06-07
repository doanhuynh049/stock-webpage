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

export type CachedWatchlistRow = {
  user_id: string;
  symbol: string;
  created_at?: string;
};

export type CachedTechnicalRow = {
  symbol: string;
  price?: number | null;
  rsi?: number | null;
  sma_20?: number | null;
  sma_50?: number | null;
  sma_200?: number | null;
  macd?: number | null;
  macd_signal?: number | null;
  support_level?: number | null;
  resistance_level?: number | null;
  volume?: number | null;
  volume_ma?: number | null;
};

export type CachedFundamentalRow = {
  symbol: string;
  pe_ratio?: number | null;
  pb_ratio?: number | null;
  roe?: number | null;
  roa?: number | null;
  revenue_growth?: number | null;
  profit_growth?: number | null;
  eps_growth?: number | null;
  debt_to_equity?: number | null;
  net_profit_margin?: number | null;
  gross_profit_margin?: number | null;
};

export type CachedPriceDailyRow = {
  symbol: string;
  trade_date: string;
  open_px?: number | null;
  high_px?: number | null;
  low_px?: number | null;
  close_px?: number | null;
  volume?: number | null;
};

let technicalIndex: Map<string, CachedTechnicalRow> | null = null;
let fundamentalIndex: Map<string, CachedFundamentalRow> | null = null;

export function readCachedWatchlist(userId?: string): CachedWatchlistRow[] | null {
  const data = readJson<{ syncedAt: string; rows: CachedWatchlistRow[] }>(
    "watchlist.json",
  );
  if (!data?.rows?.length) return null;
  if (!userId) return data.rows;
  const forUser = data.rows.filter((r) => r.user_id === userId);
  return forUser.length ? forUser : null;
}

function buildTechnicalIndex(): Map<string, CachedTechnicalRow> {
  if (technicalIndex) return technicalIndex;
  const data = readJson<{ rows: CachedTechnicalRow[] }>("technical-snapshots.json");
  technicalIndex = new Map();
  for (const row of data?.rows ?? []) {
    technicalIndex.set(row.symbol.toUpperCase(), row);
  }
  return technicalIndex;
}

function buildFundamentalIndex(): Map<string, CachedFundamentalRow> {
  if (fundamentalIndex) return fundamentalIndex;
  const data = readJson<{ rows: CachedFundamentalRow[] }>(
    "fundamental-snapshots.json",
  );
  fundamentalIndex = new Map();
  for (const row of data?.rows ?? []) {
    fundamentalIndex.set(row.symbol.toUpperCase(), row);
  }
  return fundamentalIndex;
}

export function readCachedTechnicalSnapshot(
  symbol: string,
): CachedTechnicalRow | null {
  return buildTechnicalIndex().get(symbol.toUpperCase()) ?? null;
}

export function readCachedFundamentalSnapshot(
  symbol: string,
): CachedFundamentalRow | null {
  return buildFundamentalIndex().get(symbol.toUpperCase()) ?? null;
}

export function readCachedPriceDaily(
  symbol: string,
  days = 90,
): CachedPriceDailyRow[] | null {
  const data = readJson<{ rows: CachedPriceDailyRow[] }>("price-daily.json");
  if (!data?.rows?.length) return null;
  const sym = symbol.toUpperCase();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);
  const rows = data.rows.filter(
    (r) => r.symbol.toUpperCase() === sym && r.trade_date >= sinceStr,
  );
  return rows.length ? rows.sort((a, b) => a.trade_date.localeCompare(b.trade_date)) : null;
}

export function cacheSyncedAt(filename: string): string | null {
  const data = readJson<{ syncedAt: string }>(filename);
  return data?.syncedAt ?? null;
}
