#!/usr/bin/env npx tsx
/**
 * Backfill trading_transaction.user_id from the existing id-prefix scheme.
 *
 * Must run AFTER the column exists — either `npm run db:push` or
 * `psql "$DATABASE_URL" -f scripts/sql/2026_add_trading_transaction_user_id.sql`.
 *
 * Resolution (mirrors trading-store.ts exactly, see USER_PREFIX_LEN):
 *   - "{8-char-prefix}__{uuid}" ids  → match prefix against every app_user.id,
 *     set user_id when exactly one user matches.
 *   - plain-UUID legacy ids (no "__") → these were imported directly from
 *     stock-service for a single known user. Falls back to CACHE_USER_ID
 *     (same env var trading-store.ts / import scripts already use) since
 *     there's no per-row attribution data for this format.
 *
 * Idempotent: only touches rows where user_id IS NULL. Safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/backfill-trading-user-id.ts           # dry run (default)
 *   npx tsx scripts/backfill-trading-user-id.ts --apply    # write changes
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { USER_PREFIX_LEN } from "../src/lib/db/trading-store";

const APPLY = process.argv.includes("--apply");

async function main() {
  const users = await prisma.appUser.findMany({ select: { id: true } });
  const prefixToUsers = new Map<string, string[]>();
  for (const u of users) {
    const pfx = u.id.slice(0, USER_PREFIX_LEN);
    prefixToUsers.set(pfx, [...(prefixToUsers.get(pfx) ?? []), u.id]);
  }

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM trading_transaction WHERE user_id IS NULL
  `;
  console.log(`Found ${rows.length} row(s) with NULL user_id (of ${users.length} known users).`);

  const cacheUserId = process.env.CACHE_USER_ID?.trim();
  let prefixMatched = 0;
  let legacyMatched = 0;
  let ambiguous = 0;
  let unmatched = 0;

  for (const row of rows) {
    const sepIdx = row.id.indexOf("__");
    let targetUserId: string | null = null;

    if (sepIdx === USER_PREFIX_LEN) {
      const pfx = row.id.slice(0, USER_PREFIX_LEN);
      const candidates = prefixToUsers.get(pfx) ?? [];
      if (candidates.length === 1) {
        targetUserId = candidates[0];
        prefixMatched++;
      } else if (candidates.length > 1) {
        console.warn(`  ambiguous prefix "${pfx}" for id=${row.id} — ${candidates.length} users share it, skipping`);
        ambiguous++;
        continue;
      } else {
        console.warn(`  no app_user matches prefix "${pfx}" for id=${row.id}, skipping`);
        unmatched++;
        continue;
      }
    } else if (cacheUserId) {
      // Legacy plain-UUID row — single-user personal deployment assumption
      // (see data-flow.md "Trade ID conventions").
      targetUserId = cacheUserId;
      legacyMatched++;
    } else {
      console.warn(`  legacy id=${row.id} has no "__" and CACHE_USER_ID is unset, skipping`);
      unmatched++;
      continue;
    }

    if (APPLY && targetUserId) {
      await prisma.$executeRaw`
        UPDATE trading_transaction SET user_id = ${targetUserId} WHERE id = ${row.id}
      `;
    }
  }

  console.log({ prefixMatched, legacyMatched, ambiguous, unmatched, mode: APPLY ? "APPLIED" : "DRY RUN (pass --apply to write)" });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
