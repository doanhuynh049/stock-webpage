-- Adds trading_transaction.user_id (nullable, indexed, no FK).
-- Equivalent to what `npm run db:push` generates for the schema.prisma change
-- in the same commit — kept here so it can be applied with `psql` when the
-- Neon HTTP endpoint isn't reachable (see data-flow.md: "sync:trades hangs
-- locally" — HTTP blocked by local firewall, wire protocol via psql works).
--
-- Usage:
--   psql "$DATABASE_URL" -f scripts/sql/2026_add_trading_transaction_user_id.sql
--
-- Safe to run multiple times (IF NOT EXISTS guards). Purely additive: does
-- not touch existing rows, columns, or the id-prefix logic still used as a
-- fallback in trading-store.ts.

ALTER TABLE trading_transaction
  ADD COLUMN IF NOT EXISTS user_id VARCHAR(64);

CREATE INDEX IF NOT EXISTS ix_trading_user ON trading_transaction (user_id);
