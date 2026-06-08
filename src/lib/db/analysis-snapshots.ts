import type { FundamentalInputs } from "@/lib/analysis/fundamental-scoring";
import type { TechnicalIndicators } from "@/lib/analysis/technical-scoring";
import { shouldSkipDbReads } from "@/lib/db/cache-first";
import {
  readCachedFundamentalSnapshot,
  readCachedTechnicalSnapshot,
  type CachedFundamentalRow,
  type CachedTechnicalRow,
} from "@/lib/db/neon-cache";
import { isPersistenceEnabled } from "@/lib/persistence";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/prisma-query";

export type SnapshotSource = "neon" | "cache" | "computed";

export type ResolvedSnapshots = {
  tech: TechnicalIndicators | null;
  techPrice: number | null;
  fund: FundamentalInputs | null;
  source: SnapshotSource;
};

export type AnalysisSnapshotStore = {
  resolve(symbol: string): ResolvedSnapshots;
};

function normalizeSymbols(symbols: string[]): string[] {
  return [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))];
}

export function mapCachedFundamental(row: CachedFundamentalRow): FundamentalInputs {
  return {
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
  };
}

export function mapCachedTechnical(row: CachedTechnicalRow): TechnicalIndicators {
  return {
    rsi: row.rsi,
    sma20: row.sma_20,
    sma50: row.sma_50,
    sma200: row.sma_200,
    macd: row.macd,
    macdSignal: row.macd_signal,
    supportLevel: row.support_level,
    resistanceLevel: row.resistance_level,
    volume: row.volume,
    volumeMa: row.volume_ma,
  };
}

type FundRow = {
  peRatio?: number | null;
  pbRatio?: number | null;
  roe?: number | null;
  roa?: number | null;
  revenueGrowth?: number | null;
  profitGrowth?: number | null;
  epsGrowth?: number | null;
  debtToEquity?: number | null;
  netProfitMargin?: number | null;
  grossProfitMargin?: number | null;
};

type TechRow = {
  price?: number | null;
  rsi?: number | null;
  sma20?: number | null;
  sma50?: number | null;
  sma200?: number | null;
  macd?: number | null;
  macdSignal?: number | null;
  supportLevel?: number | null;
  resistanceLevel?: number | null;
  volume?: number | null;
  volumeMa?: number | null;
};

export function mapPrismaFundamental(row: FundRow): FundamentalInputs {
  return {
    peRatio: row.peRatio,
    pbRatio: row.pbRatio,
    roe: row.roe != null ? row.roe * 100 : null,
    roa: row.roa != null ? row.roa * 100 : null,
    revenueGrowth: row.revenueGrowth != null ? row.revenueGrowth * 100 : null,
    profitGrowth: row.profitGrowth != null ? row.profitGrowth * 100 : null,
    epsGrowth: row.epsGrowth != null ? row.epsGrowth * 100 : null,
    debtToEquity: row.debtToEquity,
    netProfitMargin: row.netProfitMargin,
    grossProfitMargin: row.grossProfitMargin,
  };
}

export function mapPrismaTechnical(row: TechRow): TechnicalIndicators {
  return {
    rsi: row.rsi,
    sma20: row.sma20,
    sma50: row.sma50,
    sma200: row.sma200,
    macd: row.macd,
    macdSignal: row.macdSignal,
    supportLevel: row.supportLevel,
    resistanceLevel: row.resistanceLevel,
    volume: row.volume,
    volumeMa: row.volumeMa,
  };
}

function pickLatestBySymbol<T extends { symbol: string }>(
  rows: T[],
): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    const sym = row.symbol.toUpperCase();
    if (!map.has(sym)) map.set(sym, row);
  }
  return map;
}

function loadFromCache(symbols: string[]): {
  tech: Map<string, CachedTechnicalRow>;
  fund: Map<string, CachedFundamentalRow>;
} {
  const tech = new Map<string, CachedTechnicalRow>();
  const fund = new Map<string, CachedFundamentalRow>();
  for (const sym of symbols) {
    const t = readCachedTechnicalSnapshot(sym);
    if (t) tech.set(sym, t);
    const f = readCachedFundamentalSnapshot(sym);
    if (f) fund.set(sym, f);
  }
  return { tech, fund };
}

function buildStore(
  symbols: string[],
  techBySymbol: Map<string, TechRow & { symbol: string }>,
  fundBySymbol: Map<string, FundRow & { symbol: string }>,
  source: SnapshotSource,
): AnalysisSnapshotStore {
  const empty: ResolvedSnapshots = {
    tech: null,
    techPrice: null,
    fund: null,
    source: "computed",
  };

  return {
    resolve(symbol: string): ResolvedSnapshots {
      const sym = symbol.toUpperCase();
      if (!symbols.includes(sym)) return empty;

      const techRow = techBySymbol.get(sym);
      const fundRow = fundBySymbol.get(sym);
      if (!techRow && !fundRow) return empty;

      return {
        tech: techRow ? mapPrismaTechnical(techRow) : null,
        techPrice: techRow?.price ?? null,
        fund: fundRow ? mapPrismaFundamental(fundRow) : null,
        source,
      };
    },
  };
}

async function loadFromNeon(symbols: string[]): Promise<{
  tech: Map<string, TechRow & { symbol: string }>;
  fund: Map<string, FundRow & { symbol: string }>;
}> {
  const [techRows, fundRows] = await withDbRetry(
    () =>
      Promise.all([
        prisma.technicalSnapshot.findMany({
          where: { symbol: { in: symbols } },
          orderBy: { capturedAt: "desc" },
        }),
        prisma.fundamentalSnapshot.findMany({
          where: { symbol: { in: symbols } },
          orderBy: { capturedAt: "desc" },
        }),
      ]),
    "analysis-snapshots",
    0,
  );

  return {
    tech: pickLatestBySymbol(techRows),
    fund: pickLatestBySymbol(fundRows),
  };
}

/**
 * Load latest fundamental + technical snapshots for many symbols in at most 2 DB queries.
 */
export async function loadAnalysisSnapshotStore(
  symbols: string[],
): Promise<AnalysisSnapshotStore> {
  const normalized = normalizeSymbols(symbols);
  if (!normalized.length) {
    return { resolve: () => ({ tech: null, techPrice: null, fund: null, source: "computed" }) };
  }

  if (shouldSkipDbReads()) {
    const cached = loadFromCache(normalized);
    const techBySymbol = new Map<string, TechRow & { symbol: string }>();
    const fundBySymbol = new Map<string, FundRow & { symbol: string }>();
    for (const sym of normalized) {
      const t = cached.tech.get(sym);
      if (t) {
        techBySymbol.set(sym, {
          symbol: sym,
          price: t.price,
          rsi: t.rsi,
          sma20: t.sma_20,
          sma50: t.sma_50,
          sma200: t.sma_200,
          macd: t.macd,
          macdSignal: t.macd_signal,
          supportLevel: t.support_level,
          resistanceLevel: t.resistance_level,
          volume: t.volume,
          volumeMa: t.volume_ma,
        });
      }
      const f = cached.fund.get(sym);
      if (f) {
        fundBySymbol.set(sym, {
          symbol: sym,
          peRatio: f.pe_ratio,
          pbRatio: f.pb_ratio,
          roe: f.roe,
          roa: f.roa,
          revenueGrowth: f.revenue_growth,
          profitGrowth: f.profit_growth,
          epsGrowth: f.eps_growth,
          debtToEquity: f.debt_to_equity,
          netProfitMargin: f.net_profit_margin,
          grossProfitMargin: f.gross_profit_margin,
        });
      }
    }
    const hasData = techBySymbol.size > 0 || fundBySymbol.size > 0;
    return buildStore(
      normalized,
      techBySymbol,
      fundBySymbol,
      hasData ? "cache" : "computed",
    );
  }

  if (!isPersistenceEnabled()) {
    return buildStore(normalized, new Map(), new Map(), "computed");
  }

  try {
    const { tech, fund } = await loadFromNeon(normalized);
    return buildStore(normalized, tech, fund, "neon");
  } catch {
    const cached = loadFromCache(normalized);
    const techBySymbol = new Map<string, TechRow & { symbol: string }>();
    const fundBySymbol = new Map<string, FundRow & { symbol: string }>();
    for (const sym of normalized) {
      const t = cached.tech.get(sym);
      if (t) {
        techBySymbol.set(sym, {
          symbol: sym,
          price: t.price,
          rsi: t.rsi,
          sma20: t.sma_20,
          sma50: t.sma_50,
          sma200: t.sma_200,
          macd: t.macd,
          macdSignal: t.macd_signal,
          supportLevel: t.support_level,
          resistanceLevel: t.resistance_level,
          volume: t.volume,
          volumeMa: t.volume_ma,
        });
      }
      const f = cached.fund.get(sym);
      if (f) {
        fundBySymbol.set(sym, {
          symbol: sym,
          peRatio: f.pe_ratio,
          pbRatio: f.pb_ratio,
          roe: f.roe,
          roa: f.roa,
          revenueGrowth: f.revenue_growth,
          profitGrowth: f.profit_growth,
          epsGrowth: f.eps_growth,
          debtToEquity: f.debt_to_equity,
          netProfitMargin: f.net_profit_margin,
          grossProfitMargin: f.gross_profit_margin,
        });
      }
    }
    const hasData = techBySymbol.size > 0 || fundBySymbol.size > 0;
    return buildStore(
      normalized,
      techBySymbol,
      fundBySymbol,
      hasData ? "cache" : "computed",
    );
  }
}
