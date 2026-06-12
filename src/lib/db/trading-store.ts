import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/prisma-query";
import { isPersistenceEnabled } from "@/lib/persistence";
import type {
  TradeInput,
  TradeRecord,
  TradeSummary,
  TradeType,
} from "@/lib/db/trading-types";
export { summarizeTrades } from "@/lib/db/trading-types";
import { rebuildPortfolioFromTrades } from "@/lib/portfolio/from-trades";
import {
  listPortfolioHoldings,
  syncPortfolioHoldings,
  type PortfolioHoldingInput,
} from "@/lib/db/portfolio-sync";
import { canUseLocalDataFiles } from "@/lib/serverless";
import {
  loadStockServiceTrades,
  stockServiceLedgerKey,
  stockServiceTradesPath,
} from "@/lib/db/trading-import";

const TRADES_DIR = join(process.cwd(), "data", "user-trades");

let dbSyncBlockedUntil = 0;

function tradeId(userId: string, id?: string): string {
  const raw = id ?? randomUUID();
  return raw.startsWith(`${userId}__`) ? raw : `${userId}__${raw}`;
}

function stripUserPrefix(userId: string, id: string): string {
  const prefix = `${userId}__`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** stock-service rows use plain UUID ids in Neon (no user prefix). */
function neonTradeId(userId: string, trade: TradeRecord): string {
  if (UUID_RE.test(trade.id)) return trade.id;
  return tradeId(userId, trade.id);
}

function looksLikePortfolioBootstrap(trades: TradeRecord[]): boolean {
  if (!trades.length || trades.length > 40) return false;
  return (
    trades.every((t) => t.transactionType === "BUY") &&
    trades.every((t) => t.transactionDate === "2025-01-01")
  );
}

export function clearTradingDbSyncCooldown(): void {
  dbSyncBlockedUntil = 0;
}

function filePath(userId: string): string {
  return join(TRADES_DIR, `${userId}.json`);
}

function readFileTrades(userId: string): TradeRecord[] {
  if (!canUseLocalDataFiles()) return readBundledTrades(userId);
  const path = filePath(userId);
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as TradeRecord[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/** Read-only ledger shipped in repo (`data/user-trades/{userId}.json`) — used on Vercel when Neon is empty. */
function readBundledTrades(userId: string): TradeRecord[] {
  const path = filePath(userId);
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as TradeRecord[];
    if (!Array.isArray(raw)) return [];
    return raw.map((t) => ({ ...t, userId: t.userId || userId }));
  } catch {
    return [];
  }
}

function bundledTradesFallback(userId: string): TradeRecord[] {
  let trades = readBundledTrades(userId);
  if (trades.length) return trades;
  const cacheUser = process.env.CACHE_USER_ID?.trim();
  if (cacheUser && cacheUser !== userId) {
    trades = readBundledTrades(cacheUser);
  }
  return trades;
}

function writeFileTrades(userId: string, trades: TradeRecord[]) {
  if (!canUseLocalDataFiles()) return;
  mkdirSync(TRADES_DIR, { recursive: true });
  writeFileSync(filePath(userId), JSON.stringify(trades, null, 2));
}

function toRecord(userId: string, row: {
  id: string;
  transactionDate: Date;
  itemName: string | null;
  quantity: number | null;
  unitPrice: { toNumber(): number } | null;
  totalAmount: { toNumber(): number } | null;
  fee: { toNumber(): number } | null;
  tax: { toNumber(): number } | null;
  profit: { toNumber(): number } | null;
  transactionType: string | null;
  exchange: string | null;
  sector: string | null;
}): TradeRecord {
  const unit = row.unitPrice?.toNumber() ?? 0;
  const qty = row.quantity ?? 0;
  return {
    id: stripUserPrefix(userId, row.id),
    userId,
    transactionDate: row.transactionDate.toISOString().slice(0, 10),
    itemName: (row.itemName ?? "").toUpperCase(),
    quantity: qty,
    unitPrice: unit,
    totalAmount: row.totalAmount?.toNumber() ?? unit * qty,
    fee: row.fee?.toNumber() ?? 0,
    tax: row.tax?.toNumber() ?? 0,
    profit: row.profit?.toNumber() ?? null,
    transactionType: (row.transactionType?.toUpperCase() === "SELL" ? "SELL" : "BUY") as TradeType,
    exchange: row.exchange,
    sector: row.sector,
  };
}

function toLegacyRecord(row: Parameters<typeof toRecord>[1]): TradeRecord {
  const unit = row.unitPrice?.toNumber() ?? 0;
  const qty = row.quantity ?? 0;
  return {
    id: row.id,
    userId: "",
    transactionDate: row.transactionDate.toISOString().slice(0, 10),
    itemName: (row.itemName ?? "").toUpperCase(),
    quantity: qty,
    unitPrice: unit,
    totalAmount: row.totalAmount?.toNumber() ?? unit * qty,
    fee: row.fee?.toNumber() ?? 0,
    tax: row.tax?.toNumber() ?? 0,
    profit: row.profit?.toNumber() ?? null,
    transactionType: (row.transactionType?.toUpperCase() === "SELL" ? "SELL" : "BUY") as TradeType,
    exchange: row.exchange,
    sector: row.sector,
  };
}

async function readDbTrades(userId: string): Promise<TradeRecord[]> {
  if (!isPersistenceEnabled()) return [];
  const prefix = `${userId}__`;
  try {
    const prefixed = await withDbRetry(
      () =>
        prisma.tradingTransaction.findMany({
          where: { id: { startsWith: prefix } },
          orderBy: { transactionDate: "desc" },
        }),
      "trading-list",
      0,
    );
    if (prefixed.length) {
      return prefixed.map((r) => toRecord(userId, r));
    }

    // stock-service stores plain UUID ids (no user prefix) — single-user legacy mirror
    const legacy = await withDbRetry(
      () =>
        prisma.tradingTransaction.findMany({
          where: { NOT: { id: { contains: "__" } } },
          orderBy: { transactionDate: "desc" },
        }),
      "trading-list-legacy",
      0,
    );
    return legacy.map((r) => ({ ...toLegacyRecord(r), userId }));
  } catch (err) {
    console.warn("[trading] DB read failed:", (err as Error).message);
    return [];
  }
}

async function persistTradeNeon(
  userId: string,
  trade: TradeRecord,
  retries = 0,
) {
  if (!isPersistenceEnabled()) return;

  const id = neonTradeId(userId, trade);
  await withDbRetry(
    () =>
      prisma.tradingTransaction.upsert({
        where: { id },
        create: {
          id,
          transactionDate: new Date(trade.transactionDate),
          itemName: trade.itemName,
          quantity: trade.quantity,
          unitPrice: trade.unitPrice,
          totalAmount: trade.totalAmount,
          fee: trade.fee,
          tax: trade.tax,
          profit: trade.profit,
          transactionType: trade.transactionType,
          exchange: trade.exchange,
          sector: trade.sector,
        },
        update: {
          transactionDate: new Date(trade.transactionDate),
          itemName: trade.itemName,
          quantity: trade.quantity,
          unitPrice: trade.unitPrice,
          totalAmount: trade.totalAmount,
          fee: trade.fee,
          tax: trade.tax,
          profit: trade.profit,
          transactionType: trade.transactionType,
          exchange: trade.exchange,
          sector: trade.sector,
        },
      }),
    "trading-upsert",
    retries,
  );
}

async function deleteTradeDb(userId: string, id: string) {
  if (!isPersistenceEnabled()) return;
  const prefixed = tradeId(userId, id);
  await withDbRetry(
    () =>
      prisma.tradingTransaction.deleteMany({
        where: { OR: [{ id: prefixed }, { id }] },
      }),
    "trading-delete",
    0,
  );
}


/** Bootstrap ledger from portfolio holdings when no trades exist (one BUY per position). */
export async function seedTradesFromPortfolioHoldings(
  userId: string,
  holdings: Array<{
    symbol: string;
    shares: number;
    avgBuyPrice: number;
    exchange?: string | null;
    sector?: string | null;
    targetSetDate?: string | null;
  }>,
): Promise<number> {
  if (!holdings.length) return 0;

  const trades: TradeRecord[] = holdings.map((h) => {
    const sym = h.symbol.toUpperCase();
    const qty = h.shares;
    const unit = h.avgBuyPrice;
    return {
      id: randomUUID(),
      userId,
      transactionDate: h.targetSetDate?.slice(0, 10) ?? "2025-01-01",
      itemName: sym,
      quantity: qty,
      unitPrice: unit,
      totalAmount: unit * qty,
      fee: 0,
      tax: 0,
      profit: null,
      transactionType: "BUY" as TradeType,
      exchange: h.exchange ?? null,
      sector: h.sector ?? null,
    };
  });

  writeFileTrades(userId, trades);
  let synced = 0;
  for (const trade of trades) {
    try {
      await persistTradeNeon(userId, trade);
      synced++;
    } catch (err) {
      console.warn(`[trading] seed ${trade.itemName} failed:`, (err as Error).message);
    }
  }
  console.info(`[trading] Seeded ${synced} BUY trades from portfolio for ${userId}`);
  return synced;
}

/** Import stock-service cache/trading-records.json → data/user-trades/{userId}.json */
export function importTradesFromStockService(
  userId: string,
  ledgerKey?: string,
  opts?: { force?: boolean },
): number {
  const key = ledgerKey ?? stockServiceLedgerKey();
  const source = loadStockServiceTrades(key).map((t) => ({ ...t, userId }));
  if (!source.length) {
    console.warn(
      `[trading] No trades at ${stockServiceTradesPath()} for key ${key}`,
    );
    return 0;
  }

  const existing = readFileTrades(userId);
  const shouldImport =
    opts?.force ||
    !existing.length ||
    source.length > existing.length ||
    looksLikePortfolioBootstrap(existing);

  if (!shouldImport) return existing.length;

  writeFileTrades(userId, source);
  console.info(
    `[trading] Imported ${source.length} trades from stock-service (${key}) → ${userId}`,
  );
  return source.length;
}

function ensureTradesFromStockService(
  userId: string,
  email?: string | null,
): void {
  const key = stockServiceLedgerKey(email);
  importTradesFromStockService(userId, key);
}

/** Push JSON ledger → Neon (legacy UUID ids match stock-service rows). */
export async function syncUserTradesJsonToDb(
  userId: string,
  opts?: { force?: boolean; retries?: number },
): Promise<number> {
  const trades = readFileTrades(userId);
  if (!trades.length || !isPersistenceEnabled()) return 0;
  if (!opts?.force && Date.now() < dbSyncBlockedUntil) return 0;

  const retries = opts?.retries ?? 0;
  let synced = 0;
  let failed = 0;
  let lastError = "";

  for (const trade of trades) {
    try {
      await persistTradeNeon(userId, trade, retries);
      synced++;
    } catch (err) {
      failed++;
      lastError = (err as Error).message;
      if (!opts?.force && failed >= 3) {
        dbSyncBlockedUntil = Date.now() + 5 * 60_000;
        console.warn(
          `[trading] DB sync paused 5m after ${failed} failures — using local JSON. Last: ${lastError}`,
        );
        break;
      }
    }
  }

  if (opts?.force && failed > 0) {
    console.warn(`[trading] ${failed}/${trades.length} failed. Last: ${lastError}`);
  }
  return synced;
}

export async function syncAllJsonTradesToDb(): Promise<number> {
  if (!existsSync(TRADES_DIR)) return 0;
  const { readdirSync } = await import("node:fs");
  let total = 0;
  for (const file of readdirSync(TRADES_DIR)) {
    if (!file.endsWith(".json")) continue;
    const userId = file.replace(/\.json$/, "");
    total += await syncUserTradesJsonToDb(userId);
  }
  return total;
}

export async function listTrades(
  userId: string,
  filters?: { year?: string; month?: string; type?: string; symbol?: string },
  opts?: { email?: string | null },
): Promise<TradeRecord[]> {
  let trades: TradeRecord[] = [];

  if (canUseLocalDataFiles()) {
    ensureTradesFromStockService(userId, opts?.email);
    trades = readFileTrades(userId);
    if (trades.length && process.env.SYNC_TRADES_ON_READ === "1") {
      await syncUserTradesJsonToDb(userId);
    }
  }

  if (!trades.length && isPersistenceEnabled()) {
    trades = await readDbTrades(userId);
    if (trades.length && canUseLocalDataFiles()) {
      writeFileTrades(userId, trades);
    }
  }

  if (!trades.length) {
    trades = bundledTradesFallback(userId);
  }

  return trades.map((t) => ({ ...t, userId: t.userId || userId })).filter((t) => {
    if (filters?.type && t.transactionType !== filters.type.toUpperCase()) return false;
    if (filters?.symbol && t.itemName !== filters.symbol.toUpperCase()) return false;
    if (filters?.year && !t.transactionDate.startsWith(`${filters.year}-`)) return false;
    if (filters?.month) {
      const m = filters.month.padStart(2, "0");
      if (!t.transactionDate.includes(`-${m}-`)) return false;
    }
    return true;
  });
}

function buildTrade(userId: string, input: TradeInput, id?: string): TradeRecord {
  const sym = input.itemName.trim().toUpperCase();
  const qty = Number(input.quantity);
  const unit = Number(input.unitPrice);
  return {
    id: id ?? randomUUID(),
    userId,
    transactionDate: input.transactionDate,
    itemName: sym,
    quantity: qty,
    unitPrice: unit,
    totalAmount: unit * qty,
    fee: input.fee ?? 0,
    tax: input.tax ?? 0,
    profit: input.profit ?? null,
    transactionType: input.transactionType,
    exchange: input.exchange ?? null,
    sector: input.sector ?? null,
  };
}

export async function syncPortfolioFromTrades(userId: string) {
  const trades = await listTrades(userId);
  let existingRows: Awaited<ReturnType<typeof listPortfolioHoldings>> = [];
  try {
    existingRows = await listPortfolioHoldings(userId);
  } catch (err) {
    console.warn("[trading] portfolio read failed during rebuild:", (err as Error).message);
  }
  const existing: PortfolioHoldingInput[] = existingRows.map((r) => ({
    symbol: r.symbol,
    name: r.name,
    exchange: r.exchange,
    sector: r.sector,
    industry: r.industry,
    shares: r.shares,
    avgBuyPrice: r.avgBuyPrice,
    target3Month: r.target3Month,
    targetLongTerm: r.targetLongTerm,
    targetSetDate: r.targetSetDate,
    platform: r.platform,
  }));
  const rebuilt = rebuildPortfolioFromTrades(trades, existing);
  await syncPortfolioHoldings(userId, rebuilt);
}

export async function addTrade(userId: string, input: TradeInput): Promise<TradeRecord> {
  const trade = buildTrade(userId, input);
  if (canUseLocalDataFiles()) {
    const all = await listTrades(userId);
    all.push(trade);
    writeFileTrades(userId, all);
  }
  try {
    await persistTradeNeon(userId, trade);
  } catch (err) {
    console.warn("[trading] Neon upsert failed:", (err as Error).message);
    if (!canUseLocalDataFiles()) throw err;
  }
  try {
    await syncPortfolioFromTrades(userId);
  } catch (err) {
    console.warn("[trading] portfolio rebuild failed:", (err as Error).message);
  }
  return trade;
}

export async function updateTrade(
  userId: string,
  id: string,
  input: TradeInput,
): Promise<TradeRecord> {
  const trade = buildTrade(userId, input, id);
  if (canUseLocalDataFiles()) {
    const all = await listTrades(userId);
    const next = all.filter((t) => t.id !== id);
    next.push(trade);
    writeFileTrades(userId, next);
  }
  try {
    await persistTradeNeon(userId, trade);
  } catch (err) {
    console.warn("[trading] Neon upsert failed:", (err as Error).message);
    if (!canUseLocalDataFiles()) throw err;
  }
  try {
    await syncPortfolioFromTrades(userId);
  } catch (err) {
    console.warn("[trading] portfolio rebuild failed:", (err as Error).message);
  }
  return trade;
}

export async function removeTrade(userId: string, id: string) {
  if (canUseLocalDataFiles()) {
    const all = (await listTrades(userId)).filter((t) => t.id !== id);
    writeFileTrades(userId, all);
  }
  await deleteTradeDb(userId, id);
  try {
    await syncPortfolioFromTrades(userId);
  } catch (err) {
    console.warn("[trading] portfolio rebuild failed:", (err as Error).message);
  }
}
