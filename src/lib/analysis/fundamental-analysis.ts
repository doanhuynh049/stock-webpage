import type { FundamentalBreakdown, FundamentalInputs } from "@/lib/analysis/fundamental-scoring";
import { calculateSectorFundamentalBreakdown } from "@/lib/analysis/sector-fundamental-scoring";
import type { IndexStock } from "@/lib/analysis/index-universe";
import {
  readCachedFundamentalSnapshot,
  readCachedTechnicalSnapshot,
} from "@/lib/db/neon-cache";
import { shouldSkipDbReads } from "@/lib/db/cache-first";
import { isPersistenceEnabled } from "@/lib/persistence";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/prisma-query";
import { getStock } from "@/lib/market-service";

export type FundamentalAnalysisRow = {
  symbol: string;
  name: string;
  sector: string;
  currentPrice: number;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  roa: number | null;
  revenueGrowth: number | null;
  breakdown: FundamentalBreakdown;
  source: "neon" | "cache" | "market";
};

async function loadFundInputs(symbol: string): Promise<{
  inputs: FundamentalInputs;
  source: "neon" | "cache" | "market";
}> {
  const sym = symbol.toUpperCase();

  const fromRow = (row: {
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
  }): FundamentalInputs => ({
    peRatio: row.pe_ratio,
    pbRatio: row.pb_ratio,
    roe: row.roe != null ? row.roe * 100 : null,
    roa: row.roa != null ? row.roa * 100 : null,
    revenueGrowth: row.revenue_growth != null ? row.revenue_growth * 100 : null,
    profitGrowth: row.profit_growth != null ? row.profit_growth * 100 : null,
    epsGrowth: row.eps_growth != null ? row.eps_growth * 100 : null,
    debtToEquity: row.debt_to_equity,
    netProfitMargin: row.net_profit_margin,
    grossProfitMargin: row.gross_profit_margin,
  });

  if (shouldSkipDbReads()) {
    const cached = readCachedFundamentalSnapshot(sym);
    if (cached) return { inputs: fromRow(cached), source: "cache" };
  }

  if (isPersistenceEnabled()) {
    try {
      const row = await withDbRetry(
        () =>
          prisma.fundamentalSnapshot.findFirst({
            where: { symbol: sym },
            orderBy: { capturedAt: "desc" },
          }),
        "fund-snapshot",
        0,
      );
      if (row) {
        return {
          inputs: fromRow({
            pe_ratio: row.peRatio,
            pb_ratio: row.pbRatio,
            roe: row.roe,
            roa: row.roa,
            revenue_growth: row.revenueGrowth,
            profit_growth: row.profitGrowth,
            eps_growth: row.epsGrowth,
            debt_to_equity: row.debtToEquity,
            net_profit_margin: row.netProfitMargin,
            gross_profit_margin: row.grossProfitMargin,
          }),
          source: "neon",
        };
      }
    } catch {
      const cached = readCachedFundamentalSnapshot(sym);
      if (cached) return { inputs: fromRow(cached), source: "cache" };
    }
  }

  const stock = await getStock(sym);
  return {
    inputs: {
      roe: stock?.roe ?? null,
      roa: null,
      peRatio: stock && stock.pe > 0 ? stock.pe : null,
      pbRatio: stock?.pb ?? null,
      revenueGrowth: stock?.revenueGrowth ?? null,
      profitGrowth: null,
      epsGrowth: null,
      debtToEquity: null,
      netProfitMargin: null,
      grossProfitMargin: null,
    },
    source: "market",
  };
}

export async function analyzeFundamentalRow(
  meta: IndexStock | { symbol: string; name?: string | null; sector?: string | null },
): Promise<FundamentalAnalysisRow> {
  const sym = meta.symbol.toUpperCase();
  const sector = ("sector" in meta && meta.sector) || "Unknown";
  const { inputs, source } = await loadFundInputs(sym);
  const breakdown = calculateSectorFundamentalBreakdown(inputs, sector);

  let price = 0;
  const techCache = readCachedTechnicalSnapshot(sym);
  if (techCache?.price) price = techCache.price;
  else {
    const stock = await getStock(sym);
    price = stock?.price ?? 0;
  }

  return {
    symbol: sym,
    name: ("name" in meta && meta.name) || sym,
    sector,
    currentPrice: price,
    pe: inputs.peRatio ?? null,
    pb: inputs.pbRatio ?? null,
    roe: inputs.roe ?? null,
    roa: inputs.roa ?? null,
    revenueGrowth: inputs.revenueGrowth ?? null,
    breakdown,
    source,
  };
}

export async function analyzeFundamentalUniverse(
  universe: IndexStock[],
  limit?: number,
): Promise<FundamentalAnalysisRow[]> {
  const rows = await Promise.all(universe.map((s) => analyzeFundamentalRow(s)));
  const sorted = rows.sort((a, b) => b.breakdown.finalScore - a.breakdown.finalScore);
  return limit ? sorted.slice(0, limit) : sorted;
}

export async function analyzePortfolioFundamentals(
  holdings: Array<{ symbol: string; name?: string | null; sector?: string | null }>,
): Promise<FundamentalAnalysisRow[]> {
  const rows = await Promise.all(
    holdings.map((h) =>
      analyzeFundamentalRow({
        symbol: h.symbol,
        name: h.name,
        sector: h.sector,
      }),
    ),
  );
  return rows.sort((a, b) => b.breakdown.finalScore - a.breakdown.finalScore);
}
