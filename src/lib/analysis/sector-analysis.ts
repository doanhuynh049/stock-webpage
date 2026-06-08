import { analyzeStock } from "@/lib/analysis/stock-analysis";
import { getSectorUniverse, tickerToSectorId } from "@/lib/analysis/sector-universe";
import {
  getCachedPeBatch,
  savePeBatchToCache,
} from "@/lib/cache/pe-cache";
import { loadAnalysisSnapshotStore } from "@/lib/db/analysis-snapshots";
import { getStock } from "@/lib/market-service";
import type { EnrichedHolding } from "@/lib/portfolio/holdings-enrichment";

export type SectorStockRow = {
  symbol: string;
  name: string;
  rank: number;
  fundScore: number;
  techScore: number;
  combinedScore: number;
  recommendation: string;
  currentPriceK: number | null;
  rsi: number | null;
  peRatio: number | null;
  owned: boolean;
};

export type SectorRollup = {
  id: string;
  name: string;
  targetPct: number;
  currentPct: number;
  deltaPct: number;
  status: "ON TARGET" | "OVERWEIGHT" | "UNDERWEIGHT" | "NO TARGET";
  leaderCount: number;
  stocks: SectorStockRow[];
};

export type SectorAnalysisResult = {
  generatedAt: string;
  totalPortfolioValueK: number;
  totalTickersAnalyzed: number;
  sectors: SectorRollup[];
  /** Top combined scores across all sector leaders — trend candidates. */
  trendLeaders: SectorStockRow[];
};

function sectorStatus(
  targetPct: number,
  deltaPct: number,
): SectorRollup["status"] {
  if (targetPct <= 0) return "NO TARGET";
  if (Math.abs(deltaPct) <= 2) return "ON TARGET";
  return deltaPct > 0 ? "OVERWEIGHT" : "UNDERWEIGHT";
}

function resolvePeRatio(
  sym: string,
  store: Awaited<ReturnType<typeof loadAnalysisSnapshotStore>>,
  stockPe: number,
  peCache: Map<string, number>,
): number | null {
  const fromSnapshot = store.resolve(sym).fund?.peRatio;
  if (fromSnapshot != null && fromSnapshot > 0) return fromSnapshot;
  const cached = peCache.get(sym);
  if (cached != null && cached > 0) return cached;
  if (stockPe > 0) return stockPe;
  return null;
}

async function scoreTicker(
  symbol: string,
  owned: boolean,
  store: Awaited<ReturnType<typeof loadAnalysisSnapshotStore>>,
  peCache: Map<string, number>,
): Promise<SectorStockRow | null> {
  const sym = symbol.toUpperCase();
  const stock = await getStock(sym);
  if (!stock) {
    return {
      symbol: sym,
      name: sym,
      rank: 0,
      fundScore: 0,
      techScore: 0,
      combinedScore: 0,
      recommendation: "AVOID",
      currentPriceK: null,
      rsi: null,
      peRatio: peCache.get(sym) ?? null,
      owned,
    };
  }

  const analysis = await analyzeStock(stock, store);
  const resolved = store.resolve(sym);
  const priceK =
    stock.price >= 10000 ? stock.price / 1000 : stock.price;
  const peRatio = resolvePeRatio(sym, store, stock.pe, peCache);

  return {
    symbol: sym,
    name: stock.name,
    rank: 0,
    fundScore: analysis.fundamentalScore,
    techScore: analysis.technicalScore,
    combinedScore: analysis.combinedScore,
    recommendation: analysis.recommendation,
    currentPriceK: priceK > 0 ? priceK : null,
    rsi: resolved.tech?.rsi ?? stock.rsi ?? null,
    peRatio,
    owned,
  };
}

export async function computeSectorAnalysis(
  holdings: EnrichedHolding[],
  sectorTargets: Record<string, number>,
  ownedSymbols: string[],
): Promise<SectorAnalysisResult> {
  const owned = new Set(ownedSymbols.map((s) => s.toUpperCase()));
  const tickerSector = tickerToSectorId();
  const universe = getSectorUniverse();
  const allTickers = universe.flatMap((sec) => sec.tickers);
  const snapshotStore = await loadAnalysisSnapshotStore(allTickers);
  const peCache = await getCachedPeBatch(allTickers);

  const totalValueK = holdings.reduce(
    (s, h) => s + (h.currentValueK ?? h.costBasis),
    0,
  );

  const sectorValueK = new Map<string, number>();
  for (const h of holdings) {
    const sym = h.symbol.toUpperCase();
    const secId = tickerSector.get(sym);
    if (!secId) continue;
    const val = h.currentValueK ?? h.costBasis;
    sectorValueK.set(secId, (sectorValueK.get(secId) ?? 0) + val);
  }

  const sectors: SectorRollup[] = [];
  const allRows: SectorStockRow[] = [];
  let analyzed = 0;
  const peToCache: Record<string, number> = {};

  for (const sec of universe) {
    const rows = (
      await Promise.all(
        sec.tickers.map((ticker) =>
          scoreTicker(
            ticker,
            owned.has(ticker.toUpperCase()),
            snapshotStore,
            peCache,
          ),
        ),
      )
    ).filter((row): row is SectorStockRow => row != null);

    for (const row of rows) {
      if (row.peRatio != null && row.peRatio > 0) {
        peToCache[row.symbol] = row.peRatio;
      }
    }

    analyzed += rows.length;
    rows.sort((a, b) => b.combinedScore - a.combinedScore);
    const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }));
    allRows.push(...ranked);

    const targetPct = sectorTargets[sec.id] ?? 0;
    const secVal = sectorValueK.get(sec.id) ?? 0;
    const currentPct = totalValueK > 0 ? (secVal / totalValueK) * 100 : 0;
    const deltaPct = currentPct - targetPct;

    sectors.push({
      id: sec.id,
      name: sec.name,
      targetPct,
      currentPct,
      deltaPct,
      status: sectorStatus(targetPct, deltaPct),
      leaderCount: ranked.length,
      stocks: ranked,
    });
  }

  if (Object.keys(peToCache).length) {
    await savePeBatchToCache(peToCache);
  }

  const trendLeaders = [...allRows]
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, 15);

  return {
    generatedAt: new Date().toISOString(),
    totalPortfolioValueK: totalValueK,
    totalTickersAnalyzed: analyzed,
    sectors,
    trendLeaders,
  };
}
