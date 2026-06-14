import type { PortfolioHoldingInput } from "@/lib/db/portfolio-sync";
import type { TradeRecord } from "@/lib/db/trading-types";
import { tickerToSectorName } from "@/lib/analysis/sector-universe";

function normSymbol(s: string | null | undefined): string | null {
  const t = s?.trim().toUpperCase();
  return t || null;
}

/** Rebuild portfolio from trades — mirrors stock-service PortfolioFromTradesService. */
export function rebuildPortfolioFromTrades(
  trades: TradeRecord[],
  existing: PortfolioHoldingInput[],
): PortfolioHoldingInput[] {
  const existingBySymbol = new Map(
    existing.map((h) => [h.symbol.toUpperCase(), h]),
  );
  const sectorBySymbol = tickerToSectorName();

  type Agg = { buyQty: number; sellQty: number; buyCost: number };
  const agg = new Map<string, Agg>();

  for (const t of trades) {
    const sym = normSymbol(t.itemName);
    if (!sym || t.quantity <= 0) continue;
    const price = t.unitPrice ?? 0;
    const a = agg.get(sym) ?? { buyQty: 0, sellQty: 0, buyCost: 0 };
    if (t.transactionType === "SELL") {
      a.sellQty += t.quantity;
    } else {
      a.buyQty += t.quantity;
      a.buyCost += t.quantity * price;
    }
    agg.set(sym, a);
  }

  const result: PortfolioHoldingInput[] = [];

  for (const [symbol, a] of agg) {
    const net = a.buyQty - a.sellQty;
    if (net <= 0) continue;
    const prior = existingBySymbol.get(symbol);
    const avgBuy = a.buyQty > 0 ? Math.round((a.buyCost / a.buyQty) * 100) / 100 : 0;

    result.push({
      symbol,
      name: prior?.name ?? symbol,
      exchange: prior?.exchange ?? null,
      sector: prior?.sector ?? sectorBySymbol.get(symbol) ?? null,
      industry: prior?.industry ?? null,
      shares: net,
      avgBuyPrice: avgBuy,
      target3Month: prior?.target3Month ?? null,
      targetLongTerm: prior?.targetLongTerm ?? null,
      targetSetDate: prior?.targetSetDate ?? null,
      platform: prior?.platform ?? null,
    });
  }

  for (const [symbol, prior] of existingBySymbol) {
    if (agg.has(symbol)) continue;
    if (!prior.shares || prior.shares <= 0) continue;
    result.push({ ...prior, symbol });
  }

  return result.sort((a, b) => a.symbol.localeCompare(b.symbol));
}
