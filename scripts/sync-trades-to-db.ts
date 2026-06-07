#!/usr/bin/env npx tsx
/**
 * Push local JSON trading ledgers → Neon trading_transaction (per-user id prefix).
 * Usage: npx tsx scripts/sync-trades-to-db.ts
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  clearTradingDbSyncCooldown,
  syncUserTradesJsonToDb,
} from "../src/lib/db/trading-store";

import "dotenv/config";

const DIR = join(process.cwd(), "data", "user-trades");

async function main() {
  clearTradingDbSyncCooldown();
  if (!existsSync(DIR)) {
    console.log("[sync-trades] No data/user-trades directory — nothing to sync.");
    return;
  }
  const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
  let total = 0;
  for (const file of files) {
    const userId = file.replace(/\.json$/, "");
    const n = await syncUserTradesJsonToDb(userId, { force: true, retries: 2 });
    total += n;
    console.log(`[sync-trades] ${userId}: ${n} trades`);
  }
  console.log(`[sync-trades] OK — ${total} trades synced`);
}

main().catch((e) => {
  console.error("[sync-trades] failed:", e);
  process.exit(1);
});
