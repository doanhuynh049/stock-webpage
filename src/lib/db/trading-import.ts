import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { TradeRecord, TradeType } from "@/lib/db/trading-types";

type RawTx = {
  id?: string;
  transactionDate?: string;
  itemName?: string;
  quantity?: number;
  unitPrice?: number;
  totalAmount?: number;
  fee?: number;
  tax?: number;
  profit?: number | null;
  transactionType?: string;
  exchange?: string | null;
  sector?: string | null;
};

export function stockServiceTradesPath(): string {
  if (process.env.STOCK_SERVICE_TRADES_FILE) {
    return process.env.STOCK_SERVICE_TRADES_FILE;
  }
  return join(
    process.cwd(),
    "..",
    "stock-service",
    "cache",
    "trading-records.json",
  );
}

/** stock-service ledger key (e.g. quocthien049), not NextAuth UUID. */
export function stockServiceLedgerKey(email?: string | null): string {
  if (process.env.STOCK_SERVICE_TRADES_USER) {
    return process.env.STOCK_SERVICE_TRADES_USER;
  }
  if (email) {
    const local = email.split("@")[0]?.replace(/[^a-zA-Z0-9]/g, "") ?? "";
    if (local.length >= 4) return local.slice(0, 20);
  }
  return "quocthien049";
}

function parseDate(raw: string | undefined): string {
  if (!raw) return "2025-01-01";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return "2025-01-01";
}

export function parseStockServiceTrade(
  userId: string,
  raw: RawTx,
): TradeRecord | null {
  const sym = (raw.itemName ?? "").toUpperCase().trim();
  if (!sym) return null;
  const qty = Number(raw.quantity ?? 0);
  const unit = Number(raw.unitPrice ?? 0);
  if (qty <= 0 || unit <= 0) return null;

  return {
    id: raw.id ?? randomUUID(),
    userId,
    transactionDate: parseDate(raw.transactionDate),
    itemName: sym,
    quantity: qty,
    unitPrice: unit,
    totalAmount: unit * qty,
    fee: Number(raw.fee ?? 0),
    tax: Number(raw.tax ?? 0),
    profit: raw.profit ?? null,
    transactionType: (raw.transactionType?.toUpperCase() === "SELL"
      ? "SELL"
      : "BUY") as TradeType,
    exchange: raw.exchange ?? null,
    sector: raw.sector ?? null,
  };
}

export function loadStockServiceTrades(
  ledgerKey?: string,
): TradeRecord[] {
  const path = stockServiceTradesPath();
  if (!existsSync(path)) return [];

  const parsed = JSON.parse(readFileSync(path, "utf-8")) as
    | Record<string, RawTx[]>
    | RawTx[];

  if (Array.isArray(parsed)) {
    return parsed
      .map((t) => parseStockServiceTrade("", t))
      .filter((t): t is TradeRecord => t != null);
  }

  const key = ledgerKey ?? Object.keys(parsed)[0];
  const list = key ? (parsed[key] ?? []) : [];
  return list
    .map((t) => parseStockServiceTrade("", t))
    .filter((t): t is TradeRecord => t != null)
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
}
