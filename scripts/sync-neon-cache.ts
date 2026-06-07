/**
 * Export Neon tables via psql → JSON cache.
 * Use when Node Prisma cannot reach Neon but psql can (common ETIMEDOUT case).
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

config();

const CACHE_DIR = join(process.cwd(), "data", "neon-cache");

function cleanPsqlUrl(url: string): string {
  return url
    .replace(/[?&]uselibpqcompat=true/g, "")
    .replace(/\?$/, "");
}

function psqlJson<T>(sql: string): T {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw?.includes("neon.tech")) {
    throw new Error("DATABASE_URL must point to Neon");
  }
  const url = cleanPsqlUrl(raw);
  const out = execSync(`psql "${url}" -t -A -c ${JSON.stringify(sql)}`, {
    encoding: "utf8",
    timeout: 120_000,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  if (!out || out === "") return [] as T;
  return JSON.parse(out) as T;
}

function esc(id: string): string {
  return id.replace(/'/g, "''");
}

function main() {
  mkdirSync(CACHE_DIR, { recursive: true });
  const syncedAt = new Date().toISOString();
  const cacheUserId = (
    process.env.PORTFOLIO_USER_ID ??
    process.env.CACHE_USER_ID ??
    ""
  ).trim();

  if (!cacheUserId) {
    console.warn(
      "[sync-neon-cache] CACHE_USER_ID / PORTFOLIO_USER_ID not set — portfolio/watchlist cache may include all users.",
    );
  }

  const portfolioWhere = cacheUserId
    ? `user_id = '${esc(cacheUserId)}' AND shares > 0`
    : "shares > 0";
  const portfolio = psqlJson<unknown[]>(
    `SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (SELECT user_id, symbol, name, exchange, sector, industry, shares, avg_buy_price, target_3_month, target_long_term FROM portfolio_holding WHERE ${portfolioWhere} ORDER BY symbol) t`,
  );

  const watchlistWhere = cacheUserId
    ? `WHERE user_id = '${esc(cacheUserId)}'`
    : "";
  const watchlist = psqlJson<unknown[]>(
    `SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (SELECT user_id, symbol, created_at::text AS created_at FROM watchlist_item ${watchlistWhere} ORDER BY created_at DESC) t`,
  );

  const recommendations = psqlJson<unknown[]>(
    "SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (SELECT DISTINCT ON (symbol) symbol, name, recommendation, price_at_recommendation, technical_score, fundamental_score, combined_score, recommendation_date::text AS recommendation_date FROM recommendation WHERE recommendation_date = (SELECT MAX(recommendation_date) FROM recommendation) ORDER BY symbol, combined_score DESC) t",
  );

  const technical = psqlJson<unknown[]>(
    "SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (SELECT DISTINCT ON (symbol) symbol, price, rsi, sma_20, sma_50, sma_200, macd, macd_signal, support_level, resistance_level, volume, volume_ma FROM technical_snapshot ORDER BY symbol, captured_at DESC) t",
  );

  const fundamental = psqlJson<unknown[]>(
    "SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (SELECT DISTINCT ON (symbol) symbol, pe_ratio, pb_ratio, roe, roa, revenue_growth, profit_growth, eps_growth, debt_to_equity, net_profit_margin, gross_profit_margin FROM fundamental_snapshot ORDER BY symbol, captured_at DESC) t",
  );

  const symbolList = [
    ...new Set([
      ...(portfolio as { symbol: string }[]).map((r) => r.symbol),
      ...(watchlist as { symbol: string }[]).map((r) => r.symbol),
    ]),
  ];
  const symbolsSql =
    symbolList.length > 0
      ? symbolList.map((s) => `'${esc(s)}'`).join(",")
      : "SELECT symbol FROM stock_symbol WHERE is_vn30 = true LIMIT 30";

  const priceDaily = psqlJson<unknown[]>(
    `SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (SELECT symbol, trade_date::text AS trade_date, open_px, high_px, low_px, close_px, volume::float8 AS volume FROM price_daily WHERE symbol IN (${symbolsSql}) AND trade_date >= CURRENT_DATE - INTERVAL '90 days' ORDER BY symbol, trade_date) t`,
  );

  const write = (name: string, rows: unknown[]) => {
    writeFileSync(
      join(CACHE_DIR, name),
      JSON.stringify({ syncedAt, rows }, null, 2),
    );
  };

  write("portfolio-holdings.json", portfolio as unknown[]);
  write("watchlist.json", watchlist as unknown[]);
  write("recommendations.json", recommendations as unknown[]);
  write("technical-snapshots.json", technical as unknown[]);
  write("fundamental-snapshots.json", fundamental as unknown[]);
  write("price-daily.json", priceDaily as unknown[]);

  console.log(
    `[sync-neon-cache] OK @ ${syncedAt} — portfolio ${(portfolio as unknown[]).length}, watchlist ${(watchlist as unknown[]).length}, recs ${(recommendations as unknown[]).length}, tech ${(technical as unknown[]).length}, fund ${(fundamental as unknown[]).length}, prices ${(priceDaily as unknown[]).length}`,
  );
}

main();
