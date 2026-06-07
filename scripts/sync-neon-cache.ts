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
    timeout: 60_000,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  if (!out || out === "") return [] as T;
  return JSON.parse(out) as T;
}

function main() {
  mkdirSync(CACHE_DIR, { recursive: true });
  const syncedAt = new Date().toISOString();

  const portfolioUserId = process.env.PORTFOLIO_USER_ID?.trim();
  if (!portfolioUserId) {
    console.warn(
      "[sync-neon-cache] PORTFOLIO_USER_ID not set — cache will include all users and may duplicate symbols in the web app fallback.",
    );
  }
  const portfolioWhere = portfolioUserId
    ? `user_id = '${portfolioUserId.replace(/'/g, "''")}' AND shares > 0`
    : "shares > 0";
  const portfolio = psqlJson<unknown[]>(
    `SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (SELECT user_id, symbol, name, exchange, sector, industry, shares, avg_buy_price, target_3_month, target_long_term FROM portfolio_holding WHERE ${portfolioWhere} ORDER BY symbol) t`,
  );

  const recommendations = psqlJson<unknown[]>(
    "SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (SELECT symbol, name, recommendation, price_at_recommendation, technical_score, fundamental_score, combined_score, recommendation_date::text AS recommendation_date FROM recommendation WHERE recommendation_date = (SELECT MAX(recommendation_date) FROM recommendation) ORDER BY combined_score DESC LIMIT 50) t",
  );

  writeFileSync(
    join(CACHE_DIR, "portfolio-holdings.json"),
    JSON.stringify({ syncedAt, rows: portfolio }, null, 2),
  );
  writeFileSync(
    join(CACHE_DIR, "recommendations.json"),
    JSON.stringify({ syncedAt, rows: recommendations }, null, 2),
  );

  console.log(
    `[sync-neon-cache] OK — ${(portfolio as unknown[]).length} holdings, ${(recommendations as unknown[]).length} picks @ ${syncedAt}`,
  );
}

main();
