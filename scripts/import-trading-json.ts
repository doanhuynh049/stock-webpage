#!/usr/bin/env npx tsx
/**
 * Import stock-service trading-records.json → local JSON (+ optional Neon).
 *
 * Usage:
 *   npm run import:trades:service              # CACHE_USER_ID only
 *   npm run import:trades:service -- --all     # every data/user-trades/*.json
 *   npx tsx scripts/import-trading-json.ts [path] [userId] [ledgerKey]
 */
import "dotenv/config";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma";
import {
  loadStockServiceTrades,
  stockServiceLedgerKey,
  stockServiceTradesPath,
} from "../src/lib/db/trading-import";
import {
  clearTradingDbSyncCooldown,
  importTradesFromStockService,
  syncUserTradesJsonToDb,
} from "../src/lib/db/trading-store";

function userIdsToImport(argv: string[]): string[] {
  const allFlag = argv.includes("--all");
  const dir = join(process.cwd(), "data", "user-trades");
  const fromDir = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.replace(/\.json$/, ""))
    : [];

  const explicit = argv.find(
    (a) =>
      !a.startsWith("--") &&
      !a.includes("/") &&
      !a.endsWith(".json") &&
      a.length >= 12,
  );
  const cache = process.env.CACHE_USER_ID;
  const extra = process.env.TRADING_WEB_USER_IDS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];

  const ids = new Set<string>();
  if (allFlag || fromDir.length) {
    for (const id of fromDir) ids.add(id);
  }
  if (explicit) ids.add(explicit);
  if (cache) ids.add(cache);
  for (const id of extra) ids.add(id);

  if (!ids.size) {
    ids.add("148e4bc6-7f91-440e-b407-9f5e4a22706f");
  }
  return [...ids];
}

async function main() {
  const argv = process.argv.slice(2);
  const jsonPath =
    argv.find((a) => a.endsWith(".json")) ?? stockServiceTradesPath();
  const ledgerKey =
    argv.find((a) => !a.startsWith("--") && !a.endsWith(".json") && a.length < 24) ??
    stockServiceLedgerKey();

  process.env.STOCK_SERVICE_TRADES_FILE = jsonPath;
  process.env.STOCK_SERVICE_TRADES_USER = ledgerKey;

  const source = loadStockServiceTrades(ledgerKey);
  if (!source.length) {
    console.log(`[import-trading] No trades for key "${ledgerKey}" in ${jsonPath}`);
    return;
  }

  const userIds = userIdsToImport(argv);
  console.log(`[import-trading] Source: ${source.length} trades (${ledgerKey})`);
  console.log(`[import-trading] Targets: ${userIds.join(", ")}`);

  mkdirSync(join(process.cwd(), "data", "user-trades"), { recursive: true });

  for (const userId of userIds) {
    const n = importTradesFromStockService(userId, ledgerKey, { force: true });
    console.log(`[import-trading] ${userId}: ${n} trades in local JSON`);
  }

  clearTradingDbSyncCooldown();
  let totalSynced = 0;
  for (const userId of userIds) {
    const synced = await syncUserTradesJsonToDb(userId, {
      force: true,
      retries: 2,
    });
    totalSynced += synced;
    console.log(`[import-trading] ${userId}: synced ${synced} to Neon`);
  }

  if (totalSynced === 0) {
    console.warn(
      "[import-trading] Neon sync wrote 0 rows — network/Neon unreachable from this host. Local JSON is ready; retry: npm run sync:trades",
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
