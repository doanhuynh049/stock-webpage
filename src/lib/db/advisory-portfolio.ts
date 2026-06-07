import {
  cacheSyncedAt,
  readCachedPortfolioHoldings,
} from "@/lib/db/neon-cache";
import { shouldSkipDbReads } from "@/lib/db/cache-first";
import { isPersistenceEnabled } from "@/lib/persistence";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/prisma-query";

/** Holding row — prices in thousands VND (K), matching stock-service portfolio table. */
export type PortfolioHolding = {
  id: string;
  symbol: string;
  name: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  shares: number;
  avgBuyPrice: number;
  costBasis: number;
  target3Month: number | null;
  targetLongTerm: number | null;
  targetSetDate: string | null;
  platform: string | null;
};

export type PortfolioSummary = {
  totalCostBasis: number;
  positionCount: number;
  sectorAllocation: Record<string, number>;
};

const emptySummary: PortfolioSummary = {
  totalCostBasis: 0,
  positionCount: 0,
  sectorAllocation: {},
};

type RawRow = {
  symbol: string;
  name?: string | null;
  exchange?: string | null;
  sector?: string | null;
  industry?: string | null;
  shares: number;
  avgBuyPrice?: number | null;
  target3Month?: number | null;
  targetLongTerm?: number | null;
  targetSetDate?: string | null;
  platform?: string | null;
};

function dedupeRowsBySymbol<T extends { symbol: string }>(rows: T[]): T[] {
  const bySymbol = new Map<string, T>();
  for (const row of rows) {
    const sym = row.symbol?.toUpperCase();
    if (!sym) continue;
    bySymbol.set(sym, row);
  }
  return Array.from(bySymbol.values());
}

function mapHolding(row: RawRow): PortfolioHolding {
  const symbol = row.symbol.toUpperCase();
  const avgBuyPrice = row.avgBuyPrice ?? 0;
  const shares = row.shares;
  return {
    id: symbol,
    symbol,
    name: row.name ?? null,
    exchange: row.exchange ?? null,
    sector: row.sector ?? null,
    industry: row.industry ?? null,
    shares,
    avgBuyPrice,
    costBasis: avgBuyPrice * shares,
    target3Month: row.target3Month ?? null,
    targetLongTerm: row.targetLongTerm ?? null,
    targetSetDate: row.targetSetDate ?? null,
    platform: row.platform ?? null,
  };
}

function summarize(holdings: PortfolioHolding[]): PortfolioSummary {
  const sectorAllocation: Record<string, number> = {};
  let totalCostBasis = 0;
  for (const h of holdings) {
    totalCostBasis += h.costBasis;
    const sector = h.sector ?? "Unknown";
    sectorAllocation[sector] = (sectorAllocation[sector] ?? 0) + h.costBasis;
  }
  return {
    totalCostBasis,
    positionCount: holdings.length,
    sectorAllocation,
  };
}

function buildHoldings(rows: RawRow[]): PortfolioHolding[] {
  return dedupeRowsBySymbol(rows)
    .map(mapHolding)
    .sort((a, b) => b.costBasis - a.costBasis);
}

function fromCacheRows(
  userId: string,
): {
  holdings: PortfolioHolding[];
  summary: PortfolioSummary;
  fromCache: true;
  cacheSyncedAt: string | null;
} | null {
  const cached = readCachedPortfolioHoldings(userId);
  if (!cached?.length) return null;

  const rows: RawRow[] = cached.map((r) => ({
    symbol: r.symbol,
    name: r.name,
    exchange: r.exchange,
    sector: r.sector,
    industry: r.industry,
    shares: r.shares,
    avgBuyPrice: r.avg_buy_price,
    target3Month: r.target_3_month,
    targetLongTerm: r.target_long_term,
    targetSetDate: null,
    platform: null,
  }));

  const holdings = buildHoldings(rows);
  return {
    holdings,
    summary: summarize(holdings),
    fromCache: true,
    cacheSyncedAt: cacheSyncedAt("portfolio-holdings.json"),
  };
}

/** Reads per-user `portfolio_holding` — holding state only (no live market quotes). */
export async function getPortfolioWithStocks(userId: string): Promise<{
  holdings: PortfolioHolding[];
  summary: PortfolioSummary;
  dbUnavailable?: boolean;
  fromCache?: boolean;
  cacheSyncedAt?: string | null;
}> {
  if (!userId) {
    return { holdings: [], summary: emptySummary };
  }

  if (shouldSkipDbReads()) {
    const cached = fromCacheRows(userId);
    if (cached) return cached;
    return { holdings: [], summary: emptySummary, dbUnavailable: true };
  }

  if (!isPersistenceEnabled()) {
    const cached = fromCacheRows(userId);
    if (cached) return cached;
    return { holdings: [], summary: emptySummary, dbUnavailable: true };
  }

  try {
    const rows = await withDbRetry(
      () =>
        prisma.portfolioHolding.findMany({
          where: { userId, shares: { gt: 0 } },
          orderBy: { symbol: "asc" },
        }),
      "advisory-portfolio",
      0,
    );

    const holdings = buildHoldings(
      rows.map((row) => ({
        symbol: row.symbol,
        name: row.name,
        exchange: row.exchange,
        sector: row.sector,
        industry: row.industry,
        shares: row.shares,
        avgBuyPrice: row.avgBuyPrice,
        target3Month: row.target3Month,
        targetLongTerm: row.targetLongTerm,
        targetSetDate: row.targetSetDate,
        platform: row.platform,
      })),
    );

    return { holdings, summary: summarize(holdings) };
  } catch (error) {
    const cached = fromCacheRows(userId);
    if (cached) {
      console.info(
        "[getPortfolioWithStocks] Using JSON cache (Node→Neon blocked)",
      );
      return cached;
    }
    console.warn(
      "[getPortfolioWithStocks] DB unavailable:",
      (error as Error).message,
    );
    return { holdings: [], summary: emptySummary, dbUnavailable: true };
  }
}
