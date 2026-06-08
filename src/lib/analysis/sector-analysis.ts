import { analyzeStock } from "@/lib/analysis/stock-analysis";
import { getSectorUniverse, tickerToSectorId } from "@/lib/analysis/sector-universe";
import { getStock } from "@/lib/market-service";
import type { EnrichedHolding } from "@/lib/portfolio/holdings-enrichment";
import { readCachedTechnicalSnapshot } from "@/lib/db/neon-cache";

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

async function scoreTicker(
  symbol: string,
  sectorName: string,
  owned: boolean,
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
      peRatio: null,
      owned,
    };
  }

  const analysis = await analyzeStock(stock);
  const techSnap = readCachedTechnicalSnapshot(sym);
  const priceK =
    stock.price >= 10000 ? stock.price / 1000 : stock.price;

  return {
    symbol: sym,
    name: stock.name,
    rank: 0,
    fundScore: analysis.fundamentalScore,
    techScore: analysis.technicalScore,
    combinedScore: analysis.combinedScore,
    recommendation: analysis.recommendation,
    currentPriceK: priceK > 0 ? priceK : null,
    rsi: techSnap?.rsi ?? stock.rsi ?? null,
    peRatio: stock.pe > 0 ? stock.pe : null,
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

  for (const sec of getSectorUniverse()) {
    const rows: SectorStockRow[] = [];
    for (const ticker of sec.tickers) {
      const row = await scoreTicker(ticker, sec.name, owned.has(ticker.toUpperCase()));
      if (row) {
        rows.push(row);
        analyzed++;
      }
    }

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
