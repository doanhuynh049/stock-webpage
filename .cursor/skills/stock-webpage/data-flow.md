# VN Stocks — Data Flow & Database

Reference for portfolio, trading, caching layers, and Vercel deployment.

**Rules**: `.cursor/rules/vercel-cache.mdc`, `.cursor/rules/page-state-cache.mdc`

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
| `ai_response_cache` | `AiResponseCache` | Cached AI responses; **`analysisType=user_strategy`** for per-user strategy overrides |

Market data (indices, screener) uses file/memory cache + Entrade/Yahoo — not these tables.

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

## Neon HTTP adapter — forbidden operations

`DB_DRIVER=http` uses Neon's serverless HTTP driver. **Any Prisma operation that requires an interactive transaction is rejected** with:

```
Error: Transactions are not supported in HTTP mode
```

| Forbidden Prisma call | Why | Fix |
|---|---|---|
| `upsert()` on most models | Prisma wraps SELECT+INSERT/UPDATE in a transaction | Use `$executeRaw` with `INSERT … ON CONFLICT DO UPDATE SET …` |
| `createMany({ skipDuplicates: true })` | Prisma still wraps in a transaction | Use `$executeRaw` with `INSERT … ON CONFLICT DO NOTHING` |
| `createMany()` (no skipDuplicates) | Same transaction wrapper | Use sequential `$executeRaw INSERT` calls |

**Pattern** (copy for new Neon-safe writes):

```ts
import { Prisma } from "@/generated/prisma/client";

// upsert-style
await prisma.$executeRaw(
  Prisma.sql`INSERT INTO my_table (col1, col2) VALUES (${v1}, ${v2})
    ON CONFLICT (unique_col) DO UPDATE SET col2 = EXCLUDED.col2`,
);

// insert-or-ignore
await prisma.$executeRaw(
  Prisma.sql`INSERT INTO my_table (id, col1) VALUES (${randomUUID()}, ${v1})
    ON CONFLICT (unique_col) DO NOTHING`,
);
```

**Files fixed** (Jun 2026):
- `src/lib/db/portfolio-sync.ts` — `syncPortfolioHoldings`: `createMany` → `deleteMany` + `$executeRaw` bulk INSERT
- `src/lib/actions.ts` — `addToWatchlist`: `createMany+skipDuplicates` → `$executeRaw ON CONFLICT DO NOTHING`
- `src/lib/actions.ts` — `saveAiMessage`: `createMany` → two sequential `$executeRaw` inserts
- `src/lib/db/ai-chat-store.ts` — `appendAiMessages`: same as `saveAiMessage`

> `upsert()` in `trading-store.ts` and `user-strategy.ts` happen to work because Prisma generates a single `INSERT … ON CONFLICT DO UPDATE` for those compound keys. Do **not** rely on this — always prefer `$executeRaw` for any write that involves conflict handling.

---

## Trade ID conventions (`trading_transaction.id`)

| Pattern | Example | Length | When |
|---------|---------|--------|------|
| **Short-prefixed** | `{8-char-userId}__{uuid}` | 46 chars | Web app writes (Jun 2026+) |
| Legacy UUID | plain UUID, no `__` | 36 chars | stock-service import directly into Neon |

> **Why 8-char prefix?** `trading_transaction.id` is `VARCHAR(64)`. A full UUID prefix would be `36+2+36=74 chars` — exceeds the column limit. Using the first 8 chars: `8+2+36=46 chars` ✓. Previous code used the full userId prefix and **all new trade writes were silently failing** with `"value too long for type character varying(64)"`. Fixed Jun 2026.

`listTrades(userId)` resolution order (verified Jun 2026):

1. **Local dev**: `data/user-trades/{userId}.json` (read/write)
2. **Prefixed Neon**: `WHERE id LIKE '{userId.slice(0,8)}__%'` (Prisma `startsWith` with `USER_PREFIX_LEN=8`)
3. **Legacy Neon**: `WHERE STRPOS(id, '__') = 0` — **must use raw SQL**, NOT Prisma `contains: "__"` (Prisma generates `LIKE '%__%'` where `_` is a SQL wildcard — matches everything)
4. **Bundled JSON fallback**: read-only `data/user-trades/{userId}.json` shipped in repo — used when Neon is empty or fails transiently

`stripUserPrefix(userId, id)` handles both the short 8-char format and any legacy long-prefix format.

On Vercel, `canUseLocalDataFiles()` is false — no writes to `data/user-trades/`.

### Syncing trades to Neon

`npm run sync:trades` uses Neon HTTP → fails if outbound HTTP to `*.neon.tech` is blocked by local firewall.
Use `psql` (wire protocol, port 5432) instead:

```bash
psql "$DATABASE_URL" -f /tmp/insert_missing.sql
```

`psql` works even when `fetch` is blocked.

---

## Cache layers (overview)

```
┌─────────────────────────────────────────────────────────────┐
│ Browser: localStorage (vnstocks:*) — news, market ticker    │
├─────────────────────────────────────────────────────────────┤
│ Next.js: unstable_cache (page-cache.ts) — portfolio/analysis│
├─────────────────────────────────────────────────────────────┤
│ Server: in-memory module vars — warm lambda only            │
├─────────────────────────────────────────────────────────────┤
│ Local disk: .cache/, data/neon-cache/ — dev only            │
├─────────────────────────────────────────────────────────────┤
│ Neon Postgres — durable user + snapshot data                │
└─────────────────────────────────────────────────────────────┘
```

### Serverless guards (`src/lib/serverless.ts`)

| Helper | Meaning |
|--------|---------|
| `isVercel()` | `VERCEL=1` |
| `canUseLocalDataFiles()` | Read/write `data/` JSON (local dev) |
| `canWriteLocalCache()` | Read/write `.cache/` (local dev only) |

**Never** `mkdir('.cache')` on Vercel — causes `ENOENT: mkdir '/var/task/.cache'`.

Guarded modules: `market-service.ts`, `news-service.ts`, `cache/pe-cache.ts`.

### Client localStorage (`src/lib/client/local-storage-cache.ts`)

Used by `useCachedFetch` for stale-while-revalidate:

| Key | TTL | Consumer |
|-----|-----|----------|
| `vnstocks:news-market` | 1h | Dashboard news |
| `vnstocks:news-{SYMBOL}` | 1h | Stock detail news |
| `vnstocks:market-snapshot` | 6h | Market ticker |
| `vnstocks:portfolio-holdings` | 24h | `HoldingsLedger` — instant reload after DB save |
| `vnstocks:watchlist-add-{SYMBOL}` | permanent | `WatchlistGrid` — "Added at" price per watchlist symbol |

Flow: show cached data immediately → background fetch → update UI + localStorage.

### Live news flow

```
CachedNewsFeed (client)
  → GET /api/news (?symbol= optional, ?refresh=true force)
  → news-service.ts
      → Yahoo RSS + Google News RSS (providers/rss-news.ts)
      → in-memory cache (warm lambda)
      → .cache/news.json (local dev only)
  → localStorage write on client
```

Do **not** call `getNewsLive()` from Server Components on pages that already mount `CachedNewsFeed`.

---

## File-based data (local vs Vercel)

| Path | Local | Vercel | Git |
|------|-------|--------|-----|
| `data/neon-cache/*.json` | Read fallback | **Not used** if missing | gitignored |
| `data/user-trades/{userId}.json` | Read/write | Read-only fallback | **tracked** |
| `data/investment-strategy.json` | Read | Read | tracked |
| `data/investment-principles.json` | Read | Read | tracked |
| `data/sector-stocks.json` | Read | Read | tracked |
| `.cache/market-data.json` | Read/write | **Never write** | gitignored |
| `.cache/news.json` | Read/write | **Never write** | gitignored |
| `.cache/pe-ratios.json` | Read/write | **Never write** | gitignored |

### `DB_CACHE_FIRST` (`src/lib/db/cache-first.ts`)

When `DB_CACHE_FIRST=1` **and** `data/neon-cache/*.json` exist → skip Neon reads.

On **Vercel**: if JSON cache files are absent, **always read Neon** even when `DB_CACHE_FIRST=1`.

Set `DB_CACHE_FIRST=0` on Vercel to avoid confusion.

---

## Analysis snapshots (batch DB reads)

`loadAnalysisSnapshotStore(symbols)` in `src/lib/db/analysis-snapshots.ts`:

- **2 queries** per universe: `findMany` on `fundamental_snapshot` + `technical_snapshot`
- Used by: `fundamental-analysis`, `stock-analysis`, `combined-analysis`, `sector-analysis`
- Replaces per-symbol N+1 reads

### Scoring weights

- **Combined score**: `0.60 × Technical + 0.40 × Fundamental`
- **Technical**: base 50 + MA/RSI/MACD/volume/S-R adjustments (`technical-scoring.ts`)
- **Volume Ratio signal**: `getTechnicalSignals` now returns a `Volume Ratio` indicator = today's volume ÷ 20-day average volume; ≥ 2× = Bullish signal; used in swing screener `volumeSpike` criterion
- **Signals**: ACCUMULATE / WATCH / HOLD / TRIM / AVOID / SELL (context-aware)
- UI copy: `scoring-rules.ts`, `investment-principles.ts`

### Sector P/E

Resolved from snapshot store (`fund?.peRatio`), not stale `stock.pe` column. Yahoo fallback via `pe-cache.ts` (local disk only).

---

## Exchange inference (`portfolio_holding.exchange`)

When `portfolio_holding.exchange` is NULL (e.g. old rows created before the column was populated):

`advisory-portfolio.ts → mapHolding() → inferExchange(symbol)`:

1. `lookupIndexStock(symbol)` — returns `exchange` from VN30/VN100 JSON files (most are `"HOSE"`)
2. Hardcoded `HNX_SYMBOLS` set — `SHB, NTP, VCG, PVS, HUT, IDJ, ACB, VCS, …`
3. Default: `"HOSE"`

> To add HNX/UPCOM stocks: update `HNX_SYMBOLS` in `src/lib/db/advisory-portfolio.ts`. For UPCOM tickers, add a similar `UPCOM_SYMBOLS` set.

---

## Stock Evaluator (`/api/stock-eval`)

**New Jun 2026.** Available at `/analysis` → Principles tab (left column).

**Flow:**

```
StockEvaluationPanel (client)
  → GET /api/stock-eval?symbol=FPT
  → getStock(symbol)           # live price + fundamentals
  → analyzeStock(stock)        # technical + fundamental scores
  → buildStockContext(stock)   # rich prompt context
  → callLlm(messages, context) # Groq/Gemini with structured JSON prompt
  → parse JSON response
  → return StockEvalResult
```

**LLM prompt strategy:**
- QUANTITATIVE fields (valuation, timing): LLM uses **only provided data**
- QUALITATIVE fields (business, management): LLM uses provided data **plus training knowledge** about Vietnamese companies
- Returns JSON with 8 `EvalCategory` objects + recommendation + thesis + confidence
- Falls back to `buildRuleBasedEval(stock)` when LLM fails / provider = "fallback"

**Context includes:** profile string, price + 52w range (% from high pre-calculated), upside % to analyst target, historical financials (revenue + net profit by year), RSI with overbought/oversold label, technical score + fundamental score + combined signal, MA trend, momentum, S/R levels.

**Recommendation values:** `ACCUMULATE | WATCH | HOLD | TRIM | AVOID`

---

## User strategy persistence

`user-strategy.ts` resolution:

1. **Local dev**: `data/user-strategy/{userId}.json`
2. **Neon**: `ai_response_cache` where `analysisType = 'user_strategy'`
3. Default: `data/investment-strategy.json`

---

## Auto-Update Pipelines

Three processes keep data fresh automatically. All server-side routes require `Authorization: Bearer $CRON_SECRET`.

### Pipeline overview

```
PROCESS 1 — Market Quotes
  Schedule: weekdays 07:00 UTC  Route: POST /api/data/sync
  syncMarketData(true)
    Entrade + Yahoo quotes for all seed stocks
    in-memory memoryCache + .cache/market-data.json (local dev only)
  Monitor: GET /api/data/sync (session required)

PROCESS 2 — VN30/VN100 Index Composition
  Schedule: every Monday 08:00 UTC  Route: POST /api/admin/update-index
    fetchTcbsIndex("VN30/VN100")   [TCBS primary]
    fetchSsiIndex("VN30/VN100")    [SSI fallback]
    stock_symbol: upsert is_vn30 / is_vn100 flags
    clearMetaCache() invalidates in-memory JSON meta cache
  Monitor: GET /api/admin/update-index (session required)

PROCESS 3 — Unknown Stock Classification (automatic)
  Trigger: first getStock() for any non-VN30/VN100 ticker
  enrichStockDetails() -> sector = "Unknown"
    lookupIndexStockFromDB()   DB cache (instant if classified before)
    getTcbsStockMeta()         TCBS authoritative company data
    callLlm(classify prompt)   LLM fallback if TCBS misses
    saveToDB(stock_symbol)     persists; future requests hit DB only
```

### Monitoring endpoints

| Route | Method | Auth | Returns |
|-------|--------|------|---------|
| `GET /api/admin/update-index` | GET | session | `lastIndexSync`, VN30 members, VN100-only symbols, DB count |
| `GET /api/data/sync` | GET | session | last market sync time, quote count, LLM status |

**Sample index monitoring response:**
```json
{
  "status": "ok",
  "lastIndexSync": "2026-07-07T08:03:22.000Z",
  "vn30": { "count": 30, "members": [{"symbol":"ACB","sector":"Banking"}] },
  "vn100": { "count": 100, "vn100OnlySymbols": ["AGR","ANV"] },
  "db": { "totalSymbolsWithSector": 147 }
}
```

**Vercel cron logs:** Dashboard → Logs → filter path `/api/admin/update-index`.

### Manual triggers

```bash
curl -X POST https://your-app.vercel.app/api/admin/update-index \
  -H "Authorization: Bearer $CRON_SECRET"

curl -X POST https://your-app.vercel.app/api/data/sync \
  -H "Authorization: Bearer $CRON_SECRET"
```

### vercel.json cron schedule

```json
"crons": [
  { "path": "/api/data/sync",          "schedule": "0 7 * * 1-5" },
  { "path": "/api/admin/update-index", "schedule": "0 8 * * 1"   }
]
```

### stock_symbol writes

| Writer | Trigger | Fields set |
|--------|---------|------------|
| `POST /api/admin/update-index` | Weekly cron or manual | `is_vn30`, `is_vn100`, `updated_at` |
| `classifyUnknownStock()` via TCBS | First unknown stock load | `name`, `sector`, `exchange`, `updated_at` |
| `classifyUnknownStock()` via LLM | First unknown stock load (TCBS miss) | `name`, `sector`, `exchange`, `updated_at` |

### Neon HTTP: stock_symbol upsert safety

`stock-ai-classifier.ts` uses `prisma.stockSymbol.upsert()` (single-field PK — Prisma generates one SQL statement, no transaction). If this fails, replace with:

```ts
import { Prisma } from "@/generated/prisma/client";
await prisma.$executeRaw(
  Prisma.sql\`INSERT INTO stock_symbol (symbol, name, sector, exchange, updated_at)
    VALUES (\${sym}, \${name}, \${sector}, \${exchange}, NOW())
    ON CONFLICT (symbol) DO UPDATE SET
      name = EXCLUDED.name, sector = EXCLUDED.sector,
      exchange = EXCLUDED.exchange, updated_at = NOW()\`,
);
```

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

## Short Swing screener (Jun 2026)

Runs inside `ShortSwingPanel` (client component in `analysis-view.tsx`):

```
ShortSwingPanel (useEffect on mount)
  → GET /api/market                  (once — VN-Index %, sector context)
  → Promise.allSettled(symbols.map)
      → GET /api/stocks/{sym}?lite=true   (skips news + AI — price + technicals only)
  → buildSwingResult(stock, technicals, marketCtx)
  → sort by score → ENTRY / WATCH / SKIP
```

**`?lite=true` param** on `/api/stocks/[symbol]`:
- Without: `getStock` + `getTechnicalSignals` + `getNewsLive` (~3 network requests per symbol)
- With: `getStock` + `getTechnicalSignals` only (1 network path)
- Always use `?lite=true` in any screener or batch component fetching 5+ symbols concurrently

**`getTechnicalSignals` signals returned**:
- RSI (14-day)
- MACD (Signal vs Line)
- MA50 (above/below 50-day MA)
- MA20 (above/below 20-day MA)
- **Volume Ratio** = today's volume ÷ 20-day avg volume; ≥ 2× = Bullish

---

## Screener defaults

First visit to `/screener` redirects with query params from `screener-defaults.ts`:

- `maxPe=18`, `minRevenueGrowth=12`, `minRoe=14`, `maxRsi=55`
- Reject `maxPe=0` (would match nothing)

---

## Quotes & enrichment

`enrichHoldings()` → `getQuotesForSymbols()`:

1. Seed cache from `.cache/market-data.json` (local only)
2. Entrade per missing symbol
3. **Yahoo** (`SYMBOL.VN`) fallback

Prices stored full VND; portfolio UI uses **thousands (K)** — divide by 1000 for display.

ETFs / illiquid tickers may still show `—` if both providers fail.

---

## User decision flows

### What to sell / trim today

| Source | Route | Signals |
|--------|-------|---------|
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

## AI provider chain (`src/lib/providers/llm.ts`)

`callLlm(messages, context, opts?)` tries providers in order, skipping any without a key:

```
1. Cerebras   — api.cerebras.ai        (model: llama3.3-70b,   1M TPM free)
2. Groq       — api.groq.com           (model: llama-3.3-70b-versatile, 12k TPM free)
3. Gemini     — generativelanguage...  (model: gemini-2.0-flash, 1.5M TPM free)
4. Mistral    — api.mistral.ai         (model: mistral-small-latest, free trial)
5. OpenRouter — openrouter.ai          (model: meta-llama/...free, aggregated free models)
6. fallback   — rule-based (always)
```

Keys: env vars `CEREBRAS_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY`.

User key overrides: passed via `opts.apiKeys: Partial<Record<LlmProvider, string>>` — checked first before env var. Stored in Neon `ai_response_cache` (symbol `_ai_cfg_`, analysisType `ai_config`, modelName `userId`).

**Adding a new OpenAI-compatible provider** — one call in `callLlm`:
```ts
const myKey = k(process.env.MY_API_KEY, "myprovider");
if (myKey) {
  const r = await callOpenAICompat("https://api.myprovider.com/v1/chat/completions",
    myKey, "model-name", fullMessages, maxTokens);
  if (r) return { ...r, provider: "myprovider" };
}
```

---

## AI settings storage (`ai_response_cache`)

User AI settings are stored reusing the existing `ai_response_cache` table:

| Column | Value |
|--------|-------|
| `symbol` | `_ai_cfg_` (≤16 chars — VARCHAR(16)) |
| `analysis_type` | `ai_config` |
| `model_name` | `{userId}` (VARCHAR(128)) |
| `payload` | JSON: `{ providers: ProviderConfig[], updatedAt }` |

`ProviderConfig = { id, enabled, model, priority, apiKey? }` — `apiKey` is stored in plain text (personal use only).

---

## AI News Digest (`/api/news/summary`)

Rate-limit mitigation (Groq 12k TPM free tier):
- Deduplicate news (`deduplicateNews`)
- Slice to 20 items max (`recentNews.slice(0, 20)`)
- Compact context format: single-line per item, title capped at 120 chars, blurb at 80 chars
- Compact system prompt: ~180 tokens (down from ~500)
- `maxTokens: 3500` output
- Total input: ~900 tokens → well under 12k TPM

7-signal classification: `earnings | guidance | filing | analyst | insider | ma | macro | noise`

Cache: in-memory 30 min, `?refresh=true` to bypass.

---

## Settings pages

New routes: `/settings`, `/settings/ai`, `/settings/reports`

Layout: `src/app/settings/layout.tsx` — left nav (3 items) + full-width right panel. All pages use `p-6 space-y-6` — **no `max-w-*` constraint** (matches other full-panel pages like `/portfolio`).

Pattern for new settings pages:
```
settings/[section]/page.tsx   ← server, auth() check, render wrapper
components/settings/*-panel.tsx ← "use client", handles save + fetch
api/settings/[section]/route.ts ← GET + PUT
```

`ReportSettingsPanel` saves to `localStorage` (key: `vnstocks:report-settings`). No server-side persistence needed for delivery preferences.

`AiProviderPanel` saves to Neon via `PUT /api/settings/ai`.

---

## Theme-aware interactive elements

**Problem**: Tailwind v4 `bg-accent` = `var(--color-accent)`. If `--color-accent` is not in `@theme inline`, it's a no-op. `text-white` on a transparent/white card = invisible in light mode.

**Fix**: `globals.css` `@theme inline` block includes:
```css
--color-accent:    var(--accent);
--color-accent-fg: var(--accent-fg);
```

Both `:root` and `.dark` define `--accent-fg`:
- Light: `#ffffff` (white text on dark `#059669` green)
- Dark: `#052e16` (dark text on light `#34d399` green)

**Rule**: Use `text-accent-fg` not `text-white` when pairing with `bg-accent`. See `.cursor/rules/theme-aware-interactive.mdc`.

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
6. **`.cache` write on Vercel** — fixed by `canWriteLocalCache()`; use client localStorage for news/market

Common production errors:

| Error | Root cause | Fix |
|-------|------------|-----|
| `ENOENT: mkdir '/var/task/.cache'` | Disk write on Vercel | Guard with `canWriteLocalCache()`; use client localStorage for news/market |
| Screener 0 matches | `maxPe=0` submitted | Never allow `maxPe=0`; ensure defaults redirect |
| Raw HTML in news titles | Missing decode | `decodeHtmlEntities` in `rss-news.ts` |
| Missing sector P/E | Stale `stock.pe` column | Use snapshot store (`fund?.peRatio`) |
| `Transactions are not supported in HTTP mode` | `createMany` / `upsert` with implicit transaction | Replace with `$executeRaw` using `INSERT … ON CONFLICT` (see Neon HTTP section above) |
| `Showing 0 trades` after add | Two bugs in `readDbTrades`: (1) `neonTradeId` stored new trades as plain UUID so prefixed query missed them; (2) legacy query used `NOT { contains: "__" }` → SQL `NOT LIKE '%__%'` which excludes ALL UUIDs | Fixed Jun 2026: always prefix new trade IDs; use `STRPOS(id,'__')=0` for legacy query |
| **`value too long for type character varying(64)` — trade add fails** | Full UUID prefix for trade IDs → 74 chars > VARCHAR(64) | Fixed Jun 2026: `USER_PREFIX_LEN=8` in `trading-store.ts`; ID is now `{8-char-userId}__{uuid}` = 46 chars |
| Deleted trade reappears | Bundled JSON fallback served stale data when Neon failed | Bundled JSON is now last resort; keep it in sync by removing deleted IDs locally and pushing |
| Holdings `Exch` column shows `—` | `portfolio_holding.exchange` was NULL; no fallback | `advisory-portfolio.ts` now calls `inferExchange(symbol)` which uses `lookupIndexStock` + hardcoded HNX set → defaults to HOSE |
| Stock avatars/icons all gray (sector icons wrong) | Long sector names (e.g. `"Banking & Financial Services"`) didn't match short keys in `SECTOR_COLORS` / `SECTOR_ICONS` | `sector-colors.ts` now has `SECTOR_ALIAS` + `shortSectorName()`; `stock-avatar.tsx` resolves via `shortSectorName()` |
| `sync:trades` hangs/fails locally | Neon HTTP endpoint blocked by local firewall (`fetch failed`) | Use `psql "$DATABASE_URL"` directly (wire protocol works) |
| `value too long for character varying(16)` — settings save | `ai_response_cache.symbol` is VARCHAR(16); `"__user_ai_settings__"` (20 chars) overflows | Use `"_ai_cfg_"` (8 chars) as the settings symbol key |
| LLM `429 Rate limit reached` on news summary | 30 items × ~300 token summaries exceeded Groq 12k TPM | Compact context format + 20 items + max_tokens=3500; add Cerebras (1M TPM free) as #1 provider |
| Cerebras `404 model not found` | Old model ID `llama3.1-70b` (or `llama-3.3-70b`) no longer available | Set `CEREBRAS_MODEL=llama3.3-70b` in `.env`; update default in `llm.ts` to match |
| Tab / button text invisible in light mode | `bg-accent` no-op in Tailwind v4 (missing `--color-accent` in `@theme inline`); `text-white` on white card | Added `--color-accent` + `--color-accent-fg` to `@theme inline`; use `text-accent-fg` not `text-white` with `bg-accent` |
