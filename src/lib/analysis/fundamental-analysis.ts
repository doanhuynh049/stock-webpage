import type { FundamentalBreakdown, FundamentalInputs } from "@/lib/analysis/fundamental-scoring";
import { calculateSectorFundamentalBreakdown } from "@/lib/analysis/sector-fundamental-scoring";
import type { IndexStock } from "@/lib/analysis/index-universe";
import {
  loadAnalysisSnapshotStore,
  type AnalysisSnapshotStore,
} from "@/lib/db/analysis-snapshots";
import { getStock } from "@/lib/market-service";
import { isEtfSymbol } from "@/lib/analysis/etf-utils";

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
  isEtf: boolean;
};

const ETF_BREAKDOWN: FundamentalBreakdown = {
  qualityScore: 0,
  growthScore: 0,
  valuationScore: 0,
  stabilityScore: 0,
  penalties: 0,
  finalScore: 0,
};

type StockMeta = IndexStock | {
  symbol: string;
  name?: string | null;
  sector?: string | null;
};

async function resolveFundInputs(
  symbol: string,
  store: AnalysisSnapshotStore,
): Promise<{
  inputs: FundamentalInputs;
  source: "neon" | "cache" | "market";
  techPrice: number | null;
}> {
  const sym = symbol.toUpperCase();
  const resolved = store.resolve(sym);

  if (resolved.fund) {
    const source: "neon" | "cache" | "market" =
      resolved.source === "neon"
        ? "neon"
        : resolved.source === "cache"
          ? "cache"
          : "market";
    return {
      inputs: resolved.fund,
      source,
      techPrice: resolved.techPrice,
    };
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
    techPrice: resolved.techPrice,
  };
}

export async function analyzeFundamentalRow(
  meta: StockMeta,
  store?: AnalysisSnapshotStore,
): Promise<FundamentalAnalysisRow> {
  const sym = meta.symbol.toUpperCase();
  const sector = ("sector" in meta && meta.sector) || "Unknown";
  const name = ("name" in meta && meta.name) || sym;

  if (isEtfSymbol(sym)) {
    const snapshotStore = store ?? (await loadAnalysisSnapshotStore([sym]));
    const techPrice = snapshotStore.resolve(sym).techPrice;
    let price = techPrice ?? 0;
    if (!price) {
      const stock = await getStock(sym);
      price = stock?.price ?? 0;
    }
    return {
      symbol: sym,
      name,
      sector,
      currentPrice: price,
      pe: null,
      pb: null,
      roe: null,
      roa: null,
      revenueGrowth: null,
      breakdown: ETF_BREAKDOWN,
      source: "market",
      isEtf: true,
    };
  }

  const snapshotStore =
    store ?? (await loadAnalysisSnapshotStore([sym]));
  const { inputs, source, techPrice } = await resolveFundInputs(sym, snapshotStore);
  const breakdown = calculateSectorFundamentalBreakdown(inputs, sector);

  let price = techPrice ?? 0;
  if (!price) {
    const stock = await getStock(sym);
    price = stock?.price ?? 0;
  }

  return {
    symbol: sym,
    name,
    sector,
    currentPrice: price,
    pe: inputs.peRatio ?? null,
    pb: inputs.pbRatio ?? null,
    roe: inputs.roe ?? null,
    roa: inputs.roa ?? null,
    revenueGrowth: inputs.revenueGrowth ?? null,
    breakdown,
    source,
    isEtf: false,
  };
}

export async function analyzeFundamentalUniverse(
  universe: IndexStock[],
  limit?: number,
  store?: AnalysisSnapshotStore,
): Promise<FundamentalAnalysisRow[]> {
  const snapshotStore =
    store ??
    (await loadAnalysisSnapshotStore(universe.map((s) => s.symbol)));
  const rows = await Promise.all(
    universe.map((s) => analyzeFundamentalRow(s, snapshotStore)),
  );
  const sorted = rows.sort((a, b) => b.breakdown.finalScore - a.breakdown.finalScore);
  return limit ? sorted.slice(0, limit) : sorted;
}

export async function analyzePortfolioFundamentals(
  holdings: Array<{ symbol: string; name?: string | null; sector?: string | null }>,
  store?: AnalysisSnapshotStore,
): Promise<FundamentalAnalysisRow[]> {
  const snapshotStore =
    store ??
    (await loadAnalysisSnapshotStore(holdings.map((h) => h.symbol)));
  const rows = await Promise.all(
    holdings.map((h) =>
      analyzeFundamentalRow(
        {
          symbol: h.symbol,
          name: h.name,
          sector: h.sector,
        },
        snapshotStore,
      ),
    ),
  );
  return rows.sort((a, b) => b.breakdown.finalScore - a.breakdown.finalScore);
}
