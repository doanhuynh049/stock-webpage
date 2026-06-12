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

export function tradingCacheKey(
  filters: { year: string; month: string; type: string; symbol: string },
  userId?: string,
): string {
  const user = userId ? userId.slice(0, 8) : "anon";
  return `trading-${user}-${filters.year}-${filters.month}-${filters.type}-${filters.symbol}`.toLowerCase();
}

export function readTradingCache(
  filters: Parameters<typeof tradingCacheKey>[0],
  userId?: string,
): TradingLedgerCache | null {
  return readLocalCache<TradingLedgerCache>(tradingCacheKey(filters, userId), TTL_MS);
}

export function writeTradingCache(
  filters: Parameters<typeof tradingCacheKey>[0],
  data: TradingLedgerCache,
  userId?: string,
): void {
  writeLocalCache(tradingCacheKey(filters, userId), data);
}
