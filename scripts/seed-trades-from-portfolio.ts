#!/usr/bin/env npx tsx
/**
 * Create BUY trades from portfolio holdings (bootstrap when no ledger exists).
 * Usage: npx tsx scripts/seed-trades-from-portfolio.ts [userId]
 */
import "dotenv/config";
import { getPortfolioWithStocks } from "../src/lib/db/advisory-portfolio";
import {
  listTrades,
  seedTradesFromPortfolioHoldings,
} from "../src/lib/db/trading-store";

async function main() {
  const userId =
    process.argv[2] ??
    process.env.CACHE_USER_ID ??
    "148e4bc6-7f91-440e-b407-9f5e4a22706f";

  const existing = await listTrades(userId);
  if (existing.length) {
    console.log(`[seed-trades] ${userId} already has ${existing.length} trades — skip`);
    return;
  }

  const portfolio = await getPortfolioWithStocks(userId);
  if (!portfolio.holdings.length) {
    console.log("[seed-trades] No portfolio holdings found");
    return;
  }

  const n = await seedTradesFromPortfolioHoldings(userId, portfolio.holdings);
  console.log(`[seed-trades] Created ${n} BUY trades for ${userId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
