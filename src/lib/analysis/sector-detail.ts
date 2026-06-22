import { analyzeStock } from "@/lib/analysis/stock-analysis";
import { getSectorById } from "@/lib/analysis/sector-universe";
import { loadAnalysisSnapshotStore } from "@/lib/db/analysis-snapshots";
import { getStock } from "@/lib/market-service";
import type { EnrichedHolding } from "@/lib/portfolio/holdings-enrichment";

export type SectorDetailStockRow = {
  symbol: string;
  name: string;
  fundScore: number;
  techScore: number;
  combinedScore: number;
  recommendation: string;
  currentPriceK: number | null;
  rsi: number | null;
  peRatio: number | null;
  owned: boolean;
};

export type SectorDetailData = {
  sectorId: string;
  sectorName: string;
  targetPct: number;
  currentPct: number;
  deltaPct: number;
  status: "ON TARGET" | "OVERWEIGHT" | "UNDERWEIGHT" | "NO TARGET";
  totalPortfolioValueK: number;
  sectorValueK: number;
  /** Holdings the user owns that belong to this sector */
  ownedHoldings: EnrichedHolding[];
  /** All scored stocks in this sector, sorted by combined score desc */
  stocks: SectorDetailStockRow[];
  generatedAt: string;
};

function sectorStatus(
  targetPct: number,
  deltaPct: number,
): SectorDetailData["status"] {
  if (targetPct <= 0) return "NO TARGET";
  if (Math.abs(deltaPct) <= 2) return "ON TARGET";
  return deltaPct > 0 ? "OVERWEIGHT" : "UNDERWEIGHT";
}

export async function computeSectorDetail(
  sectorId: string,
  holdings: EnrichedHolding[],
  sectorTargets: Record<string, number>,
): Promise<SectorDetailData | null> {
  const sector = getSectorById(sectorId);
  if (!sector) return null;

  const owned = new Set(holdings.map((h) => h.symbol.toUpperCase()));
  const snapshotStore = await loadAnalysisSnapshotStore(sector.tickers);

  const totalValueK = holdings.reduce(
    (s, h) => s + (h.currentValueK ?? h.costBasis),
    0,
  );

  // Map portfolio holdings to this sector by matching ticker list
  const sectorTickerSet = new Set(sector.tickers.map((t) => t.toUpperCase()));
  const ownedHoldings = holdings.filter((h) =>
    sectorTickerSet.has(h.symbol.toUpperCase()),
  );
  const sectorValueK = ownedHoldings.reduce(
    (s, h) => s + (h.currentValueK ?? h.costBasis),
    0,
  );

  const currentPct = totalValueK > 0 ? (sectorValueK / totalValueK) * 100 : 0;
  const targetPct = sectorTargets[sectorId] ?? 0;
  const deltaPct = currentPct - targetPct;

  // Score all tickers in this sector
  const stockRows: SectorDetailStockRow[] = [];
  await Promise.all(
    sector.tickers.map(async (ticker) => {
      const sym = ticker.toUpperCase();
      const stock = await getStock(sym);
      if (!stock) {
        stockRows.push({
          symbol: sym,
          name: sym,
          fundScore: 0,
          techScore: 0,
          combinedScore: 0,
          recommendation: "AVOID",
          currentPriceK: null,
          rsi: null,
          peRatio: null,
          owned: owned.has(sym),
        });
        return;
      }
      const analysis = await analyzeStock(stock, snapshotStore);
      const resolved = snapshotStore.resolve(sym);
      const priceK = stock.price >= 10000 ? stock.price / 1000 : stock.price;
      const peRatio =
        resolved.fund?.peRatio ??
        (stock.pe > 0 ? stock.pe : null);

      stockRows.push({
        symbol: sym,
        name: stock.name,
        fundScore: analysis.fundamentalScore,
        techScore: analysis.technicalScore,
        combinedScore: analysis.combinedScore,
        recommendation: analysis.recommendation,
        currentPriceK: priceK > 0 ? priceK : null,
        rsi: resolved.tech?.rsi ?? stock.rsi ?? null,
        peRatio: peRatio ?? null,
        owned: owned.has(sym),
      });
    }),
  );

  stockRows.sort((a, b) => b.combinedScore - a.combinedScore);

  return {
    sectorId,
    sectorName: sector.name,
    targetPct,
    currentPct,
    deltaPct,
    status: sectorStatus(targetPct, deltaPct),
    totalPortfolioValueK: totalValueK,
    sectorValueK,
    ownedHoldings,
    stocks: stockRows,
    generatedAt: new Date().toISOString(),
  };
}
