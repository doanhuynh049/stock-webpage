import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
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
import { canUseLocalDataFiles, isVercel } from "@/lib/serverless";
import {
  loadStockServiceTrades,
  stockServiceLedgerKey,
  stockServiceTradesPath,
} from "@/lib/db/trading-import";
import { log } from "@/lib/logger";

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

/**
 * Always use the prefixed format "{userId}__{tradeId}" so the prefixed
 * findMany query in readDbTrades reliably finds every trade for this user.
 * Plain-UUID legacy rows (synced from stock-service directly into Neon) are
 * handled separately by the raw-SQL legacy query in readDbTrades.
 */
function neonTradeId(userId: string, trade: TradeRecord): string {
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
    // Fetch BOTH sets sequentially (Neon HTTP doesn't reliably handle
    // concurrent requests from a single serverless invocation):
    //   • prefixed — trades added via this webapp  (id like "{userId}__uuid")
    //   • legacy   — trades synced from stock-service (plain UUID, no "__")
    //
    // NOTE: `NOT { id: { contains: "__" } }` generates `NOT LIKE '%__%'` in
    // SQL, where `_` is a single-char wildcard — it would exclude ALL UUIDs.
    // We use raw STRPOS() instead, which does a literal string search.
    const prefixed = await withDbRetry(
      () =>
        prisma.tradingTransaction.findMany({
          where: { id: { startsWith: prefix } },
          orderBy: { transactionDate: "desc" },
        }),
      "trading-list-prefixed",
      0,
    );
    type RawTxRow = {
      id: string;
      transactionDate: Date;
      itemName: string | null;
      quantity: number | null;
      unitPrice: number | null;
      totalAmount: number | null;
      transactionType: string | null;
      exchange: string | null;
    };
    const legacy = await withDbRetry(
      () =>
        prisma.$queryRaw<RawTxRow[]>(
          Prisma.sql`SELECT id,
            transaction_date AS "transactionDate",
            item_name        AS "itemName",
            quantity,
            unit_price::float8   AS "unitPrice",
            total_amount::float8 AS "totalAmount",
            transaction_type AS "transactionType",
            exchange
          FROM trading_transaction
          WHERE STRPOS(id, '__') = 0
          ORDER BY transaction_date DESC`,
        ),
      "trading-list-legacy",
      0,
    );

    const merged: TradeRecord[] = [
      ...prefixed.map((r) => toRecord(userId, r)),
      ...legacy.map((r): TradeRecord => {
        const unit = r.unitPrice ?? 0;
        const qty = r.quantity ?? 0;
        return {
          id: r.id,
          userId,
          transactionDate: r.transactionDate instanceof Date
            ? r.transactionDate.toISOString().slice(0, 10)
            : String(r.transactionDate).slice(0, 10),
          itemName: (r.itemName ?? "").toUpperCase(),
          quantity: qty,
          unitPrice: unit,
          totalAmount: r.totalAmount ?? unit * qty,
          fee: 0,
          tax: 0,
          profit: null,
          transactionType: (r.transactionType?.toUpperCase() === "SELL" ? "SELL" : "BUY") as TradeType,
          exchange: r.exchange,
          sector: null,
        };
      }),
    ];
    // Re-sort after merging two separately-ordered result sets.
    merged.sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
    return merged;
  } catch (err) {
    log.warn("trading-store", "DB read failed", { error: (err as Error).message });
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
  log.debug("trading-store", "persistTradeNeon upsert", {
    id,
    symbol: trade.itemName,
    type: trade.transactionType,
    qty: trade.quantity,
    unit: trade.unitPrice,
    date: trade.transactionDate,
  });
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
      log.warn("trading-store", "seed trade failed", { symbol: trade.itemName, error: (err as Error).message });
    }
  }
  log.info("trading-store", "seeded BUY trades from portfolio", { userId, synced });
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
    log.warn("trading-store", "no trades found at stock-service path", { path: stockServiceTradesPath(), key });
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
  log.info("trading-store", "imported trades from stock-service", { userId, key, count: source.length });
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
        log.warn("trading-store", "DB sync paused 5m after repeated failures", { failed, lastError });
        break;
      }
    }
  }

  if (opts?.force && failed > 0) {
    log.warn("trading-store", "JSON→DB sync completed with failures", { failed, total: trades.length, lastError });
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

  // Bundled JSON fallback — used when:
  //   a) DB read returned empty (trades not yet synced to Neon), or
  //   b) DB read failed transiently (readDbTrades catches errors and returns []).
  // The bundled file is read-only on Vercel; keep it in sync with Neon by
  // running `npm run sync:trades` locally and pushing the updated JSON.
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
  log.debug("trading-store", "syncPortfolioFromTrades start", { userId });
  const trades = await listTrades(userId);
  log.debug("trading-store", "syncPortfolioFromTrades trades loaded", { count: trades.length });

  let existingRows: Awaited<ReturnType<typeof listPortfolioHoldings>> = [];
  try {
    existingRows = await listPortfolioHoldings(userId);
  } catch (err) {
    log.warn("trading-store", "portfolio read failed during rebuild", { error: (err as Error).message });
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
  log.debug("trading-store", "portfolio rebuilt from trades", {
    tradingCount: trades.length,
    holdingsCount: rebuilt.length,
    symbols: rebuilt.map((h) => h.symbol),
  });
  await syncPortfolioHoldings(userId, rebuilt);
  log.info("trading-store", "portfolio holdings synced", { userId, count: rebuilt.length });
}

export async function addTrade(userId: string, input: TradeInput): Promise<TradeRecord> {
  const trade = buildTrade(userId, input);
  log.info("trading-store", "addTrade start", {
    tradeId: trade.id,
    symbol: trade.itemName,
    type: trade.transactionType,
    qty: trade.quantity,
    unit: trade.unitPrice,
    date: trade.transactionDate,
    userId,
  });

  if (canUseLocalDataFiles()) {
    const all = await listTrades(userId);
    all.push(trade);
    writeFileTrades(userId, all);
    log.debug("trading-store", "addTrade written to JSON file", { tradeId: trade.id, totalTrades: all.length });
  }

  try {
    await persistTradeNeon(userId, trade);
    log.info("trading-store", "addTrade persisted to Neon", { tradeId: trade.id });
  } catch (err) {
    log.warn("trading-store", "addTrade Neon upsert failed", { error: (err as Error).message, tradeId: trade.id });
    if (!canUseLocalDataFiles()) throw err;
  }

  try {
    await syncPortfolioFromTrades(userId);
    log.info("trading-store", "addTrade portfolio sync complete", { tradeId: trade.id, symbol: trade.itemName });
  } catch (err) {
    log.warn("trading-store", "addTrade portfolio rebuild failed", { error: (err as Error).message, tradeId: trade.id });
  }

  log.info("trading-store", "addTrade done", { tradeId: trade.id, symbol: trade.itemName, type: trade.transactionType });
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
    log.info("trading-store", "updateTrade persisted to Neon", { tradeId: trade.id });
  } catch (err) {
    log.warn("trading-store", "updateTrade Neon upsert failed", { error: (err as Error).message, tradeId: trade.id });
    if (!canUseLocalDataFiles()) throw err;
  }
  try {
    await syncPortfolioFromTrades(userId);
    log.info("trading-store", "updateTrade portfolio sync complete", { tradeId: trade.id });
  } catch (err) {
    log.warn("trading-store", "updateTrade portfolio rebuild failed", { error: (err as Error).message, tradeId: trade.id });
  }
  return trade;
}

export async function removeTrade(userId: string, id: string) {
  log.info("trading-store", "removeTrade start", { tradeId: id, userId });
  if (canUseLocalDataFiles()) {
    const all = (await listTrades(userId)).filter((t) => t.id !== id);
    writeFileTrades(userId, all);
    log.debug("trading-store", "removeTrade removed from JSON file", { tradeId: id });
  }
  await deleteTradeDb(userId, id);
  log.info("trading-store", "removeTrade deleted from DB", { tradeId: id });
  try {
    await syncPortfolioFromTrades(userId);
    log.info("trading-store", "removeTrade portfolio sync complete", { tradeId: id });
  } catch (err) {
    log.warn("trading-store", "removeTrade portfolio rebuild failed", { error: (err as Error).message, tradeId: id });
  }
}
