"use client";

import {
  readLocalCache,
  writeLocalCache,
} from "@/lib/client/local-storage-cache";
import type { TradeRecord, TradeSummary } from "@/lib/db/trading-types";

export type TradingLedgerCache = {
  trades: TradeRecord[];
  summary: TradeSummary | null;
  prices: Record<string, number>;
};

const TTL_MS = 5 * 60 * 1000;

export function tradingCacheKey(filters: {
  year: string;
  month: string;
  type: string;
  symbol: string;
}): string {
  return `trading-${filters.year}-${filters.month}-${filters.type}-${filters.symbol}`.toLowerCase();
}

export function readTradingCache(
  filters: Parameters<typeof tradingCacheKey>[0],
): TradingLedgerCache | null {
  return readLocalCache<TradingLedgerCache>(tradingCacheKey(filters), TTL_MS);
}

export function writeTradingCache(
  filters: Parameters<typeof tradingCacheKey>[0],
  data: TradingLedgerCache,
): void {
  writeLocalCache(tradingCacheKey(filters), data);
}
