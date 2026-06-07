import { getAllStocks, getMarketSnapshot } from "@/lib/market-service";
import type { Stock } from "@/types/stock";

export type PickHorizon = "short" | "medium";

export type StockPick = {
  stock: Stock;
  score: number;
  horizon: PickHorizon;
  reasons: string[];
  upsidePercent: number;
};

function scoreStock(stock: Stock, sectorChange: number): StockPick | null {
  let score = 0;
  const reasons: string[] = [];

  if (stock.pe > 0 && stock.pe <= 15) {
    score += 20;
    reasons.push(`Attractive valuation (PE ${stock.pe})`);
  } else if (stock.pe > 15) {
    return null;
  }

  if (stock.roe >= 20) {
    score += 25;
    reasons.push(`Strong ROE ${stock.roe}%`);
  } else if (stock.roe >= 15) {
    score += 15;
    reasons.push(`Solid ROE ${stock.roe}%`);
  } else {
    return null;
  }

  if (stock.revenueGrowth >= 20) {
    score += 20;
    reasons.push(`High revenue growth ${stock.revenueGrowth}%`);
  } else if (stock.revenueGrowth >= 12) {
    score += 10;
    reasons.push(`Healthy revenue growth ${stock.revenueGrowth}%`);
  }

  if (stock.rsi >= 35 && stock.rsi <= 65) {
    score += 15;
    reasons.push(`Balanced RSI ${stock.rsi} — room to run`);
  } else if (stock.rsi < 35) {
    score += 12;
    reasons.push(`Oversold RSI ${stock.rsi} — potential rebound`);
  } else if (stock.rsi > 70) {
    score -= 10;
    reasons.push(`RSI elevated at ${stock.rsi}`);
  }

  if (stock.analystRating === "Strong Buy" || stock.analystRating === "Buy") {
    score += 15;
    reasons.push(`Analyst ${stock.analystRating}`);
  }

  const target =
    stock.analystTarget < stock.price / 10
      ? stock.analystTarget * 1000
      : stock.analystTarget;
  const upsidePercent =
    stock.price > 0 ? ((target - stock.price) / stock.price) * 100 : 0;
  if (upsidePercent >= 10) {
    score += 10;
    reasons.push(`${upsidePercent.toFixed(0)}% upside to target`);
  }

  if (sectorChange > 0) {
    score += 5;
    reasons.push(`Sector momentum +${sectorChange.toFixed(1)}%`);
  }

  if (stock.changePercent > 0 && stock.changePercent < 5) {
    score += 5;
  }

  const horizon: PickHorizon =
    stock.rsi < 40 || stock.changePercent > 2 ? "short" : "medium";

  if (score < 45) return null;

  return {
    stock,
    score,
    horizon,
    reasons: reasons.slice(0, 4),
    upsidePercent,
  };
}

export async function getStockPicks(limit = 5): Promise<{
  picks: StockPick[];
  marketSentiment: string;
  updatedAt: string;
  criteria: string;
}> {
  const market = await getMarketSnapshot();
  const { getDbRecommendations } = await import("@/lib/db/recommendations");
  const dbPicks = await getDbRecommendations(limit);

  if (dbPicks?.length) {
    return {
      picks: dbPicks,
      marketSentiment: market.sentiment,
      updatedAt: market.lastUpdated,
      criteria:
        "Neon DB · technical + fundamental scores · latest recommendation_date",
    };
  }

  const stocks = await getAllStocks();
  const sectorMap = new Map(
    market.sectors.map((s) => [s.sector, s.changePercent]),
  );

  const picks = stocks
    .map((stock) =>
      scoreStock(stock, sectorMap.get(stock.sector) ?? 0),
    )
    .filter((p): p is StockPick => p !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    picks,
    marketSentiment: market.sentiment,
    updatedAt: market.lastUpdated,
    criteria:
      "PE ≤ 15 · ROE ≥ 15% · revenue growth · RSI & sector momentum · analyst upside",
  };
}
