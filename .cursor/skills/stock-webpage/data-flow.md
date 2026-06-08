# VN Stocks — Data Flow & Database

Reference for portfolio, trading, caching, and Vercel deployment.

---

## Prisma tables (user-facing)

| Table | Model | Purpose |
|-------|-------|---------|
| `app_user` | `AppUser` | Auth users |
| `portfolio_holding` | `PortfolioHolding` | Holdings per user (`user_id` + `symbol` PK) |
| `trading_transaction` | `TradingTransaction` | BUY/SELL ledger (**no `user_id` column**) |
| `watchlist_item` | `WatchlistItem` | Saved tickers |
| `recommendation` | `Recommendation` | Market picks |
| `fundamental_snapshot` | `FundamentalSnapshot` | Analysis inputs |
| `technical_snapshot` | `TechnicalSnapshot` | Analysis inputs |
| `ai_chat_session` / `ai_chat_message` | — | AI analyst history |

Market data (indices, screener) uses file cache + Entrade/Yahoo — not these tables.

---

## Trading → Portfolio pipeline

```
TradingLedger (client)
  → POST/PUT/DELETE /api/trading
  → trading-store.ts (addTrade / updateTrade / removeTrade)
  → trading_transaction (Neon upsert)
  → syncPortfolioFromTrades()
  → rebuildPortfolioFromTrades()   # Σ BUY − Σ SELL per symbol
  → syncPortfolioHoldings()
  → portfolio_holding
```

**Trading is source of truth.** Portfolio holdings are **rebuilt** after every trade mutation.

Direct edits on `/portfolio` (`POST /api/portfolio`) update `portfolio_holding` only — they do **not** create matching trades.

---

## Trade ID conventions (`trading_transaction.id`)

| Pattern | Example | When |
|---------|---------|------|
| Prefixed | `{userId}__{uuid}` | Web app writes via `trading-store` |
| Legacy UUID | plain UUID, no `__` | stock-service import; shared fallback read |

`listTrades(userId)` resolution order:

1. **Local dev**: `data/user-trades/{userId}.json` (read/write)
2. **Neon**: rows where `id` starts with `{userId}__`
3. **Legacy Neon**: all rows without `__` in id (single-user mirror)
4. **Bundled JSON** (Vercel fallback): read-only `data/user-trades/{userId}.json` shipped in repo
5. **CACHE_USER_ID fallback**: same file under `CACHE_USER_ID` if user's file missing

On Vercel, `canUseLocalDataFiles()` is false — no writes to `data/user-trades/`.

---

## File-based data (local vs Vercel)

| Path | Local | Vercel | Git |
|------|-------|--------|-----|
| `data/neon-cache/*.json` | Read fallback | **Not used** if missing | gitignored |
| `data/user-trades/{userId}.json` | Read/write | Read-only fallback | **tracked** |
| `data/investment-strategy.json` | Read | Read | tracked |
| `data/sector-stocks.json` | Read | Read | tracked |
| `.cache/market-data.json` | Read/write | Ephemeral | gitignored |

### `DB_CACHE_FIRST` (`src/lib/db/cache-first.ts`)

When `DB_CACHE_FIRST=1` **and** `data/neon-cache/*.json` exist → skip Neon reads.

On **Vercel**: if JSON cache files are absent, **always read Neon** even when `DB_CACHE_FIRST=1`.

Set `DB_CACHE_FIRST=0` on Vercel to avoid confusion.

---

## Sync scripts

| Script | Command | Purpose |
|--------|---------|---------|
| Import stock-service JSON | `npm run import:trades:service` | `stock-service/cache/trading-records.json` → `data/user-trades/{userId}.json` |
| Push JSON → Neon | `npm run sync:trades` | All `data/user-trades/*.json` → `trading_transaction` |
| Probe DB counts | `npm run probe:trades` | Count trades + holdings per user |
| Sync users cache | `npm run sync:users:cache` | User cache export |

**Env for import:**

- `CACHE_USER_ID` — target app user UUID
- `STOCK_SERVICE_TRADES_USER` — ledger key in JSON (default `quocthien049`)
- `STOCK_SERVICE_TRADES_FILE` — override JSON path
- `TRADING_WEB_USER_IDS` — comma-separated extra user IDs

---

## Page cache keys (important)

| Page | Cache key | Tags |
|------|-----------|------|
| `/portfolio` | `["portfolio", userId]` | `portfolio-{userId}` |
| `/analysis` portfolio | **Same** `["portfolio", userId]` | `portfolio-{userId}` |
| Analysis bundle | `["analysis-bundle-portfolio", userId, symbolKey]` | `analysis-{userId}` |
| Sector analysis | `["analysis-sector", userId, symbolKey]` | `analysis-{userId}` |

`symbolKey` = sorted symbols joined (not count alone — avoids stale empty cache).

Invalidate on mutations:

```ts
revalidateTag(`portfolio-${userId}`, { expire: 0 });
revalidateTag(`analysis-${userId}`, { expire: 0 });
```

Used in `/api/portfolio`, `/api/trading`, `/api/trading/[id]`.

---

## Quotes & enrichment

`enrichHoldings()` → `getQuotesForSymbols()`:

1. Seed cache from `.cache/market-data.json`
2. Entrade per missing symbol
3. **Yahoo** (`SYMBOL.VN`) fallback

Prices stored full VND; portfolio UI uses **thousands (K)** — divide by 1000 for display.

ETFs / illiquid tickers may still show `—` if both providers fail.

---

## User decision flows

### What to sell / trim today

| Source | Route | Signals |
|--------|-------|-----------|
| Strategy Review | `/strategy-review` | STOP_LOSS, TAKE_PROFIT, TRIM, SECTOR_CAP |
| Analysis portfolio | `/analysis` → Portfolio → Combined | SELL, TRIM, AVOID |
| Stock detail | `/stocks/[symbol]` | Recommendation badge |

### Trend leaders (next period)

| Source | Location |
|--------|----------|
| Sector analysis | `/analysis` → Sector → **Trend leaders** |
| Per-sector rank #1 | Sector tab leader tables (combined score DESC) |
| VN30 / VN100 | Analysis → VN30/VN100 → Combined top rows |

---

## Vercel checklist

```
DATABASE_URL=          # Neon pooler URL
AUTH_SECRET=
AUTH_URL=https://your-app.vercel.app
PERSISTENCE_ENABLED=true
DB_DRIVER=http
DB_CACHE_FIRST=0
CACHE_USER_ID=          # match data/user-trades/{id}.json if login uuid differs
```

Common empty-data causes:

1. Not signed in
2. `DATABASE_URL` missing on Vercel
3. `DB_CACHE_FIRST=1` with no neon-cache files (fixed in code — falls back to Neon)
4. Trading: Neon empty and no bundled JSON for logged-in `userId`
5. Analysis: stale cache — fixed by shared portfolio key + symbolKey
