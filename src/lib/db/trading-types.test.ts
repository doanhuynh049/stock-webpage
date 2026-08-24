import { describe, expect, it } from "vitest";
import { summarizeTrades } from "./trading-types";
import type { TradeRecord } from "./trading-types";

function trade(overrides: Partial<TradeRecord>): TradeRecord {
  return {
    id: "id",
    userId: "user",
    transactionDate: "2026-01-01",
    itemName: "FPT",
    quantity: 100,
    unitPrice: 100_000,
    totalAmount: 10_000_000,
    fee: 0,
    tax: 0,
    profit: null,
    transactionType: "BUY",
    exchange: null,
    sector: null,
    ...overrides,
  };
}

describe("summarizeTrades", () => {
  it("returns zeroed defaults for an empty ledger", () => {
    const summary = summarizeTrades([]);
    expect(summary).toEqual({
      total: 0,
      buys: 0,
      sells: 0,
      totalProfit: 0,
      winRate: null,
      firstDate: null,
      lastDate: null,
    });
  });

  it("counts buys and sells separately", () => {
    const summary = summarizeTrades([
      trade({ transactionType: "BUY" }),
      trade({ transactionType: "BUY" }),
      trade({ transactionType: "SELL", profit: 100 }),
    ]);
    expect(summary.total).toBe(3);
    expect(summary.buys).toBe(2);
    expect(summary.sells).toBe(1);
  });

  it("sums profit only across SELL trades with a non-null profit", () => {
    const summary = summarizeTrades([
      trade({ transactionType: "SELL", profit: 500 }),
      trade({ transactionType: "SELL", profit: -200 }),
      trade({ transactionType: "SELL", profit: null }),
      trade({ transactionType: "BUY" }),
    ]);
    expect(summary.totalProfit).toBe(300);
  });

  it("computes win rate as % of profitable evaluated sells", () => {
    const summary = summarizeTrades([
      trade({ transactionType: "SELL", profit: 500 }),
      trade({ transactionType: "SELL", profit: -200 }),
      trade({ transactionType: "SELL", profit: 300 }),
    ]);
    // 2 of 3 evaluated sells were profitable
    expect(summary.winRate).toBeCloseTo((2 / 3) * 100, 10);
  });

  it("returns null win rate when there are no evaluated (profit != null) sells", () => {
    const summary = summarizeTrades([
      trade({ transactionType: "SELL", profit: null }),
      trade({ transactionType: "BUY" }),
    ]);
    expect(summary.winRate).toBeNull();
  });

  it("returns the earliest and latest transaction dates, sorted", () => {
    const summary = summarizeTrades([
      trade({ transactionDate: "2026-03-01" }),
      trade({ transactionDate: "2026-01-15" }),
      trade({ transactionDate: "2026-02-10" }),
    ]);
    expect(summary.firstDate).toBe("2026-01-15");
    expect(summary.lastDate).toBe("2026-03-01");
  });
});
