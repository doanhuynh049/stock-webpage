import { describe, expect, it } from "vitest";
import { rebuildPortfolioFromTrades } from "./from-trades";
import type { TradeRecord } from "@/lib/db/trading-types";

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

describe("rebuildPortfolioFromTrades", () => {
  it("aggregates BUY quantity and weighted-average buy price", () => {
    const trades = [
      trade({ itemName: "FPT", quantity: 100, unitPrice: 100_000, transactionType: "BUY" }),
      trade({ itemName: "FPT", quantity: 200, unitPrice: 130_000, transactionType: "BUY" }),
    ];
    const result = rebuildPortfolioFromTrades(trades, []);
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe("FPT");
    expect(result[0].shares).toBe(300);
    // (100*100_000 + 200*130_000) / 300 = 120_000
    expect(result[0].avgBuyPrice).toBe(120_000);
  });

  it("nets out SELL quantity against prior BUYs", () => {
    const trades = [
      trade({ itemName: "VNM", quantity: 100, transactionType: "BUY" }),
      trade({ itemName: "VNM", quantity: 40, transactionType: "SELL" }),
    ];
    const result = rebuildPortfolioFromTrades(trades, []);
    expect(result).toHaveLength(1);
    expect(result[0].shares).toBe(60);
  });

  it("drops a symbol entirely once net shares reach zero or negative", () => {
    const trades = [
      trade({ itemName: "HPG", quantity: 100, transactionType: "BUY" }),
      trade({ itemName: "HPG", quantity: 100, transactionType: "SELL" }),
    ];
    const result = rebuildPortfolioFromTrades(trades, []);
    expect(result.find((h) => h.symbol === "HPG")).toBeUndefined();
  });

  it("ignores trades with non-positive quantity or blank symbol", () => {
    const trades = [
      trade({ itemName: "", quantity: 100 }),
      trade({ itemName: "ACB", quantity: 0 }),
      trade({ itemName: "ACB", quantity: -5 }),
    ];
    expect(rebuildPortfolioFromTrades(trades, [])).toHaveLength(0);
  });

  it("normalizes symbol casing/whitespace", () => {
    const trades = [trade({ itemName: "  vcb  ", quantity: 10, unitPrice: 90_000 })];
    const result = rebuildPortfolioFromTrades(trades, []);
    expect(result[0].symbol).toBe("VCB");
  });

  it("preserves prior metadata (name, targets, platform) when a holding still exists", () => {
    const trades = [trade({ itemName: "FPT", quantity: 50 })];
    const result = rebuildPortfolioFromTrades(trades, [
      {
        symbol: "FPT",
        name: "FPT Corp",
        exchange: "HOSE",
        sector: "Technology",
        industry: "IT Services",
        shares: 999, // should be overwritten by the recomputed net shares
        avgBuyPrice: 1,
        target3Month: 150_000,
        targetLongTerm: 200_000,
        targetSetDate: "2026-01-01",
        platform: "SSI",
      },
    ]);
    expect(result[0]).toMatchObject({
      name: "FPT Corp",
      exchange: "HOSE",
      sector: "Technology",
      industry: "IT Services",
      target3Month: 150_000,
      targetLongTerm: 200_000,
      platform: "SSI",
      shares: 50,
    });
  });

  it("keeps an existing holding with no trades (e.g. manually added) untouched", () => {
    const result = rebuildPortfolioFromTrades([], [
      { symbol: "vic", shares: 20, avgBuyPrice: 45_000 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe("VIC");
    expect(result[0].shares).toBe(20);
  });

  it("drops an existing holding with zero/negative shares and no trades", () => {
    const result = rebuildPortfolioFromTrades([], [
      { symbol: "VIC", shares: 0, avgBuyPrice: 45_000 },
    ]);
    expect(result).toHaveLength(0);
  });

  it("sorts the result by symbol", () => {
    const trades = [
      trade({ itemName: "VNM", quantity: 10 }),
      trade({ itemName: "ACB", quantity: 10 }),
      trade({ itemName: "FPT", quantity: 10 }),
    ];
    const result = rebuildPortfolioFromTrades(trades, []);
    expect(result.map((h) => h.symbol)).toEqual(["ACB", "FPT", "VNM"]);
  });
});
