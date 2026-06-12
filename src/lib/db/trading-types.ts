export type TradeType = "BUY" | "SELL";

export type TradeRecord = {
  id: string;
  userId: string;
  transactionDate: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  fee: number;
  tax: number;
  profit: number | null;
  transactionType: TradeType;
  exchange: string | null;
  sector: string | null;
};

export type TradeInput = {
  transactionDate: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  transactionType: TradeType;
  fee?: number;
  tax?: number;
  profit?: number | null;
  exchange?: string | null;
  sector?: string | null;
};

export type TradeSummary = {
  total: number;
  buys: number;
  sells: number;
  totalProfit: number;
  winRate: number | null;
  firstDate: string | null;
  lastDate: string | null;
};

/**
 * Pure summary calculation — safe to call on both server and client.
 * Moved here from trading-store.ts so client components can derive the
 * summary from local `trades` state without waiting for a background fetch.
 */
export function summarizeTrades(trades: TradeRecord[]): TradeSummary {
  let buys = 0;
  let sells = 0;
  let totalProfit = 0;
  let evaluatedSells = 0;
  let winningSells = 0;
  const dates: string[] = [];

  for (const t of trades) {
    dates.push(t.transactionDate);
    if (t.transactionType === "SELL") {
      sells++;
      if (t.profit != null) {
        totalProfit += t.profit;
        evaluatedSells++;
        if (t.profit > 0) winningSells++;
      }
    } else {
      buys++;
    }
  }

  dates.sort();
  return {
    total: trades.length,
    buys,
    sells,
    totalProfit,
    winRate: evaluatedSells > 0 ? (winningSells / evaluatedSells) * 100 : null,
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
  };
}
