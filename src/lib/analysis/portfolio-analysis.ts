import { analyzeStock } from "@/lib/analysis/stock-analysis";
import type { PortfolioHolding } from "@/lib/db/advisory-portfolio";
import { getStock } from "@/lib/market-service";
import type { Stock } from "@/types/stock";

function holdingFallbackStock(holding: PortfolioHolding): Stock {
  const raw = (holding.exchange ?? "HOSE").toUpperCase();
  const exchange: Stock["exchange"] =
    raw === "HNX" || raw === "UPCOM" ? raw : "HOSE";
  return {
    symbol: holding.symbol,
    name: holding.name ?? holding.symbol,
    exchange,
    sector: holding.sector ?? "Unknown",
    price: holding.avgBuyPrice * 1000,
    change: 0,
    changePercent: 0,
    volume: 0,
    marketCap: 0,
    pe: 0,
    pb: 0,
    roe: 0,
    dividendYield: 0,
    revenueGrowth: 0,
    rsi: 50,
    high52w: 0,
    low52w: 0,
    analystRating: "Hold",
    analystTarget: 0,
    profile: "",
    financials: { years: [], revenue: [], netProfit: [], totalDebt: [] },
  };
}

export type HoldingAnalysisRow = {
  holding: PortfolioHolding;
  analysis: Awaited<ReturnType<typeof analyzeStock>>;
};

export async function analyzePortfolioHoldings(
  holdings: PortfolioHolding[],
): Promise<HoldingAnalysisRow[]> {
  const rows: HoldingAnalysisRow[] = [];
  for (const holding of holdings) {
    const stock =
      (await getStock(holding.symbol)) ?? holdingFallbackStock(holding);
    rows.push({
      holding,
      analysis: await analyzeStock(stock),
    });
  }
  return rows.sort(
    (a, b) => b.analysis.combinedScore - a.analysis.combinedScore,
  );
}
