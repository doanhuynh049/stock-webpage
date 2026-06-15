# VN Stocks — Component & Module Catalog

High-level reference for AI agents. Server = React Server Component; Client = `"use client"`.

**Related**: [data-flow.md](data-flow.md) — DB, cache layers, Vercel. **Rules**: `.cursor/rules/vercel-cache.mdc`

---

## Pages (`src/app/`)

| Route | File | Type | Purpose | Data sources |
|-------|------|------|---------|--------------|
| `/` | `page.tsx` | Server | Market dashboard: indices, movers, sectors, picks, **AI news digest** | `stocks`, `stock-picks`; news via **`AiNewsSummary`** + **`CachedNewsFeed`** (both client) |
| `/login` | `login/page.tsx` | Client | Email/password login & registration | `actions` |
| `/portfolio` | `portfolio/page.tsx` | Server | Holdings ledger (sortable), allocation charts | `advisory-portfolio`, `holdings-enrichment`, `page-cache` |
| `/watchlist` | `watchlist/page.tsx` | Server | **Quick-add panel** + watchlist grid | `user-data`, `stocks` |
| `/analysis` | `analysis/page.tsx` | Server | Portfolio / Sector / VN30 / VN100 / **Scoring rules** / **Principles** | `combined-analysis`, `sector-analysis`, `recommendations`, shared portfolio cache |
| `/ai-analyst` | `ai-analyst/page.tsx` | Server | AI chat shell | `auth`; chat via `/api/ai` |
| `/stocks/[symbol]` | `stocks/[symbol]/page.tsx` | Server | Stock detail: quote, charts, fundamentals | `stocks`, `stock-analysis`, `user-data`; news via **`CachedNewsFeed`** |
| `/trading` | `trading/page.tsx` | Server | Trade ledger wrapper | `auth`; `TradingLedger` → `/api/trading` |
| `/screener` | `screener/page.tsx` | Server | Filter stocks; **redirects with defaults** on first visit | `stocks`, `screener-defaults` |
| `/strategy-review` | `strategy-review/page.tsx` | Server | Core–Satellite compliance, action items | `advisory-portfolio`, `strategy/*` |

**Global loading**: `loading.tsx` — route transition skeleton.

**Layout**: `layout.tsx` — root shell, fonts, `auth()`, `AppShell`, `Providers`.

---

## Components by folder

### Root

| File | Type | Purpose |
|------|------|---------|
| `providers.tsx` | Client | Theme + NextAuth session providers |

### `layout/`

| File | Type | Purpose |
|------|------|---------|
| `app-shell.tsx` | Server | Wrapper → `ShellContent` |
| `shell-content.tsx` | Client | Sidebar + market ticker + main; hides chrome on `/login` |
| `sidebar.tsx` | Client | Nav links, user info, theme toggle, sign out |
| `nav-link.tsx` | Client | Nav link with `useLinkStatus` pending indicator |
| `market-ticker.tsx` | Client | Scrolling index strip; **`useCachedFetch`** → `/api/market` |
| `theme-toggle.tsx` | Client | Light / dark / system cycle |
| `sign-out-button.tsx` | Client | Sign out — navigates first, session cleared after |

### `ui/`

| File | Type | Purpose |
|------|------|---------|
| `badge.tsx` | Server | Status / label pill |
| `button.tsx` | Server | Button variants |
| `card.tsx` | Server | Card container + title |
| `input.tsx` | Server | Input, label, select |
| `page-header.tsx` | Server | Page title + description + badge slot |
| `stat-card.tsx` | Server | KPI metric tile; optional **`valueClass`** prop overrides value text color (e.g. `"text-emerald-500"` for positive P/L) |
| `empty-state.tsx` | Server | Auth-gated empty page with CTA |
| `brand-logo.tsx` | Server | App logo SVG |
| `stock-avatar.tsx` | Server | Sector-colored ticker avatar; resolves long sector names (e.g. `"Banking & Financial Services"`) via **`shortSectorName()`** — shows correct icon + color for all sectors including ETF |
| `markdown-lite.tsx` | Client | Minimal markdown for AI replies |
| `db-unavailable-banner.tsx` | Server | DB connectivity warning |

### `stock/`

| File | Type | Purpose |
|------|------|---------|
| `change-badge.tsx` | Server | Colored % change with trend icon |
| `mover-list.tsx` | Server | Top gainers/losers rows |
| `stock-table.tsx` | Server | Market table |
| `sector-heatmap.tsx` | Server | Sector performance grid |
| `news-feed.tsx` | Server | Static news list (legacy; prefer **`cached-news-feed`**) |
| `cached-news-feed.tsx` | Client | Live news via **`useCachedFetch`** → `/api/news`; localStorage TTL 1h |
| `ai-news-summary.tsx` | Client | **NEW (Jun 2026)** — AI news digest: fetches `/api/news/summary`, renders market mood banner, impact/sentiment labels, breaking alerts, and AI-generated 1-sentence market implication per item; in-memory cached 30 min |
| `investment-picks.tsx` | Server | Curated picks card |
| `stock-analysis-panel.tsx` | Server | Combined analysis on detail page |
| `price-chart.tsx` | Client | Recharts line chart |
| `price-chart-panel.tsx` | Client | Chart + range; fetches history API |
| `financial-chart.tsx` | Client | Revenue/profit bar chart |
| `watchlist-button.tsx` | Client | Toggle watchlist — optimistic UI |

### `portfolio/`

| File | Type | Purpose |
|------|------|---------|
| `portfolio-charts.tsx` | Client | Sector allocation donut + breakdown cards; **redesigned Jun 2026** — interactive donut (hover dims other slices), gradient progress bars, compact legend, summary card; uses `shortSectorName()` |
| `holdings-ledger.tsx` | Client | **Sortable** holdings table; optimistic save → `POST /api/portfolio` |

### `trading/`

| File | Type | Purpose |
|------|------|---------|
| `trading-ledger.tsx` | Client | CRUD trade table; optimistic mutations → `/api/trading`; **Net P/L + Win rate StatCards** are green when positive, red when negative |

### `analysis/`

| File | Type | Purpose |
|------|------|---------|
| `analysis-view.tsx` | Client | Tabs: Portfolio / Sector / VN30 / VN100 / **Scoring rules** / **Principles**; **Principles tab** = left (StockEvaluationPanel) + right (investment principles) side-by-side |
| `sector-analysis-view.tsx` | Client | Per-sector leaders + trend leaders panel |
| `analysis-detail-panel.tsx` | Client | Slide-over detail for scored row |
| `stock-evaluation-panel.tsx` | Client | **NEW (Jun 2026)** — 8-category AI stock evaluation; user enters ticker → calls `/api/stock-eval` → renders accordion (Business / Financial / Valuation / Risks / Growth / Management / Timing / Fit) + final-decision checklist + verdict banner |
| `etf-analysis-view.tsx` | Client | ETF-specific analysis rows |

### `strategy/`

| File | Type | Purpose |
|------|------|---------|
| `strategy-page-client.tsx` | Client | Orchestrates editor + review |
| `strategy-editor.tsx` | Client | Edit/save Core–Satellite config |
| `strategy-review-view.tsx` | Client | Allocation compliance, STOP_LOSS / TRIM action items |

### `ai-analyst/`

| File | Type | Purpose |
|------|------|---------|
| `chat.tsx` | Client | Chat UI; `/api/ai`, `/api/ai/session`; localStorage session hydrate |

### `screener/`

| File | Type | Purpose |
|------|------|---------|
| `screener-form.tsx` | Client | Filter form; always submits valid defaults; `startTransition` + navigate |

### `watchlist/`

| File | Type | Purpose |
|------|------|---------|
| `watchlist-add-panel.tsx` | Client | Quick-add symbol search + add to watchlist |
| `watchlist-grid.tsx` | Client | Watchlist cards with optimistic remove |
| `remove-watchlist-button.tsx` | Client | Remove symbol — optimistic hide |

---

## Hooks & client cache

| File | Purpose |
|------|---------|
| `src/hooks/use-cached-fetch.ts` | Stale-while-revalidate fetch; reads/writes localStorage |
| `src/lib/client/local-storage-cache.ts` | `readLocalCache` / `writeLocalCache`; keys prefixed `vnstocks:` |

**localStorage keys**

| Key | TTL | Used by |
|-----|-----|---------|
| `vnstocks:news-market` | 1h | Dashboard `CachedNewsFeed` |
| `vnstocks:news-{SYMBOL}` | 1h | Stock detail news |
| `vnstocks:market-snapshot` | 6h | `MarketTicker` |

---

## Lib modules (`src/lib/`)

### Auth

| Module | Purpose |
|--------|---------|
| `auth.ts` | NextAuth config (Credentials, JWT) |
| `auth-utils.ts` | Email normalization |
| `auth/user-store.ts` | DB user lookup for login |
| `actions.ts` | Server actions: register, login, watchlist, AI save |

### Database

| Module | Purpose |
|--------|---------|
| `prisma.ts` | Lazy Prisma client |
| `prisma-query.ts` | Retry + connectivity helpers |
| `database-url.ts` | Neon URL resolution |
| `persistence.ts` | `PERSISTENCE_ENABLED` flag |
| `db/advisory-portfolio.ts` | Portfolio holdings + summary (reads `portfolio_holding`) |
| `db/portfolio-sync.ts` | Upsert/delete `portfolio_holding` rows |
| `db/trading-store.ts` | Trade CRUD, Neon + JSON fallback, **portfolio rebuild** |
| `db/trading-types.ts` | Trade types |
| `db/ai-chat-store.ts` | AI chat persistence |
| `db/recommendations.ts` | Market picks from Neon |
| `db/price-history.ts` | DB price history |
| `db/cache-first.ts` | Skip Neon when local JSON exists; **Vercel auto-fallback to Neon** |
| `db/analysis-snapshots.ts` | **Batch** fundamental + technical snapshot loads (2 queries per universe) |
| `db/neon-cache.ts` | JSON cache snapshots (`data/neon-cache/`) |
| `user-data.ts` | Watchlist + AI sessions for pages |

### Market & news

| Module | Purpose |
|--------|---------|
| `market-service.ts` | Sync, quotes (Entrade + Yahoo fallback); disk cache guarded by `canWriteLocalCache()` |
| `news-service.ts` | Yahoo + Google RSS; in-memory + optional `.cache/news.json` (local only) |
| `providers/rss-news.ts` | RSS parse, HTML entity decode, tag strip |
| `stocks.ts` | Re-export barrel → market-service |
| `stock-metadata.ts` | Index/universe metadata |
| `stock-picks.ts` | Scored picks for dashboard |
| `screener-defaults.ts` | Default screener params + URL redirect helper |
| `providers/entrade.ts` | Entrade API |
| `providers/yahoo.ts` | Yahoo Finance fallback |
| `sector-colors.ts` | Sector → color mapping; **`SECTOR_ALIAS`** maps long names (e.g. `"Banking & Financial Services"`) to canonical short keys; **`shortSectorName()`** returns display-safe short name; ETF color added |
| `cache/pe-cache.ts` | Sector P/E Yahoo fallback cache (local disk only) |

### Analysis

| Module | Purpose |
|--------|---------|
| `analysis/stock-analysis.ts` | Single-stock combined analysis |
| `analysis/fundamental-analysis.ts` | Universe fundamental rows (batch snapshots) |
| `analysis/fundamental-scoring.ts` | PE/PB/ROE scoring |
| `analysis/technical-scoring.ts` | RSI/MACD/MA/volume scoring (base 50 + adjustments) |
| `analysis/combined-analysis.ts` | Bundled universes (portfolio, VN30, VN100); **0.60×Tech + 0.40×Fund** |
| `analysis/sector-universe.ts` | Load `data/sector-stocks.json` |
| `analysis/sector-analysis.ts` | Sector scores, trend leaders, P/E from snapshot store |
| `analysis/index-universe.ts` | VN30 / VN100 lists |
| `analysis/scoring-rules.ts` | Scoring rules tab copy (technical + combined weights) |
| `analysis/strategy-review.ts` | Portfolio vs targets |

### Content

| Module | Purpose |
|--------|---------|
| `content/investment-principles.ts` | Principles tab copy from `data/investment-principles.json` |

### Portfolio & Strategy

| Module | Purpose |
|--------|---------|
| `portfolio/holdings-enrichment.ts` | Live quotes/P&L on holdings |
| `portfolio/from-trades.ts` | Rebuild holdings from trade ledger |
| `strategy/strategy-types.ts` | Core–Satellite types |
| `strategy/strategy-config.ts` | Default config |
| `strategy/user-strategy.ts` | Per-user strategy: local file + Neon `ai_response_cache` |
| `strategy/strategy-review.ts` | Compliance comparison |

### AI & Infra

| Module | Purpose |
|--------|---------|
| `ai-analyst.ts` | Rule-based fallback Q&A |
| `providers/llm.ts` | OpenAI-compatible LLM (Groq/Gemini) |
| `page-cache.ts` | `unstable_cache` wrapper + TTL |
| `serverless.ts` | `isVercel`, `canUseLocalDataFiles`, **`canWriteLocalCache`** |
| `utils.ts` | `cn`, formatting helpers |

---

## Static data (`data/`)

| File | Purpose |
|------|---------|
| `sector-stocks.json` | 9 sectors × 10 leader symbols (Sector analysis tab) |
| `investment-strategy.json` | Default Core–Satellite targets |
| `investment-principles.json` | Investment principles (English) for Analysis tab |
| `user-trades/{userId}.json` | Bundled trade ledger (Vercel read fallback) |
| `neon-cache/*.json` | Local DB read cache (gitignored; not on Vercel) |

---

## Scripts (`scripts/`)

| Script | npm command | Purpose |
|--------|-------------|---------|
| `import-trading-json.ts` | `import:trades`, `import:trades:service` | Import stock-service JSON → `data/user-trades/` |
| `sync-trades-to-db.ts` | `sync:trades` | Push JSON → `trading_transaction` + rebuild portfolio |
| `probe-trades-db.ts` | `probe:trades` | Count trades/holdings per user in Neon |

---

## API routes (`src/app/api/`)

| Route | Methods | Purpose | Auth | Cache invalidation |
|-------|---------|---------|------|-------------------|
| `/api/auth/[...nextauth]` | GET, POST | NextAuth handlers | — | — |
| `/api/health` | GET | Health + cache age | Public | — |
| `/api/market` | GET | Market snapshot | Public | — |
| `/api/stocks` | GET | All/screened stocks | Public | — |
| `/api/stocks/[symbol]` | GET | Stock detail | Public | — |
| `/api/stocks/[symbol]/history` | GET | Price history | Public | — |
| `/api/news` | GET | Live RSS news (`?refresh=true` bypasses server memory) | Public | — |
| `/api/picks` | GET | Investment picks | Public | — |
| `/api/data/sync` | GET, POST | Market data sync | Session / cron | — |
| `/api/portfolio` | GET, POST | Portfolio holdings | Session | `portfolio-*`, `analysis-*` |
| `/api/trading` | GET, POST | Trades list/add; supports `dateFrom`/`dateTo` filters | Session | `portfolio-*`, `analysis-*` |
| `/api/trading/[id]` | PUT, DELETE | Update/delete trade | Session | `portfolio-*`, `analysis-*` |
| `/api/strategy` | GET, PUT, DELETE | Strategy config | Session | — |
| `/api/ai` | POST | AI analyst Q&A | Session | — |
| `/api/ai/session` | GET, DELETE | Chat session | Session | — |
| `/api/stock-eval` | GET | **NEW (Jun 2026)** — 8-category AI investment evaluation for any ticker (`?symbol=FPT`); fetches live data + `analyzeStock` scores; calls Groq/Gemini; adapts system prompt to data availability (data-scarce companies → LLM uses training knowledge); rule-based fallback | Session | — |
| `/api/news/summary` | GET | **NEW (Jun 2026)** — AI news digest (`?refresh=true` to force); fetches 15 recent items, calls LLM to rate impact (HIGH/MEDIUM/LOW), sentiment (Bullish/Bearish/Neutral), affected symbols, and AI summary; returns `NewsSummaryResponse`; in-memory cache 30 min | None | — |

---

## Dependency graph

```
layout (Sidebar, NavLink, MarketTicker + localStorage)
  └── pages (Server prefetch + pageCache)
        └── client components (CachedNewsFeed, ledgers, charts, analysis tabs, chat)
              └── /api routes
                    └── lib/db (trading-store → portfolio-sync)
                          └── market-service + news-service + analysis (batch snapshots)
```

**Trading mutation path**: `TradingLedger` → `/api/trading` → `trading-store` → `trading_transaction` → `syncPortfolioFromTrades` → `portfolio_holding`.

**News path (preferred)**: `CachedNewsFeed` → `/api/news` → `news-service` (RSS); browser caches in localStorage.
