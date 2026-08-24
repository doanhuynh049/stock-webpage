# VN Stocks — Component & Module Catalog

High-level reference for AI agents. Server = React Server Component; Client = `"use client"`.

**Related**: [data-flow.md](data-flow.md) — DB, cache layers, Vercel. **Rules**: `.cursor/rules/vercel-cache.mdc`, `.cursor/rules/theme-aware-interactive.mdc`

---

## Pages (`src/app/`)

| Route | File | Type | Purpose | Data sources |
|-------|------|------|---------|--------------|
| `/` | `page.tsx` | Server | Market dashboard: indices, movers, sectors, picks, **AiNewsSummary**, **CachedNewsFeed** | `stocks`, `stock-picks`; news via client components |
| `/login` | `login/page.tsx` | Client | Email/password login & registration | `actions` |
| `/news` | `news/page.tsx` | Server | **AI News Digest** + **Earnings Calendar** | `AiNewsSummary`, `EarningsCalendar` (both client) |
| `/portfolio` | `portfolio/page.tsx` | Server | Holdings ledger (sortable), allocation charts | `advisory-portfolio`, `holdings-enrichment`, `page-cache` |
| `/watchlist` | `watchlist/page.tsx` | Server | **Quick-add panel** + watchlist grid; cards show **"Added at" price + % Δ** | `user-data`, `stocks` |
| `/analysis` | `analysis/page.tsx` | Server | Portfolio / Sector / VN30 / VN100 / ETF / **Short Swing** screener / Scoring rules / **Principles** | `combined-analysis`, `sector-analysis`, `etf-analysis`, shared portfolio cache |
| `/analyst` | `analyst/page.tsx` | Server | **Multi-agent Investment Analyst** — ticker → 6 agents → decision engine → rated report | `auth`; `AnalystReport` (client) → `/api/analyst` |
| `/ai-analyst` | `ai-analyst/page.tsx` | Server | AI chat shell | `auth`; chat via `/api/ai` |
| `/stocks/[symbol]` | `stocks/[symbol]/page.tsx` | Server | Stock detail: quote, charts, fundamentals | `stocks`, `stock-analysis`, `user-data`; news via **`CachedNewsFeed`** |
| `/trading` | `trading/page.tsx` | Server | Trade ledger wrapper | `auth`; `TradingLedger` → `/api/trading` |
| `/screener` | `screener/page.tsx` | Server | Filter stocks; **redirects with defaults** on first visit | `stocks`, `screener-defaults` |
| `/strategy-review` | `strategy-review/page.tsx` | Server | Core–Satellite compliance, action items | `advisory-portfolio`, `strategy/*` |
| `/settings` | `settings/page.tsx` | Server | Settings hub — account card + nav tiles | `auth`, `getLlmStatus` |
| `/settings/ai` | `settings/ai/page.tsx` | Server | AI provider config — key status + `AiProviderPanel` | `auth`, `getLlmStatus`, `LLM_PROVIDERS` |
| `/settings/reports` | `settings/reports/page.tsx` | Server | Reports & alerts config | `auth`; `ReportSettingsPanel` (client) |

**Settings layout**: `src/app/settings/layout.tsx` — left nav rail (Overview / AI / Reports) + full-width right content. Pages use `p-6 space-y-6`, no `max-w-*`.

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
| `sidebar.tsx` | Client | Nav links, **UserMenu** (bottom-left), theme toggle |
| `user-menu.tsx` | Client | **NEW (Jun 2026)** — clickable user card at bottom-left opens popup: Settings, AI Config, Reports, Sign out |
| `nav-link.tsx` | Client | Nav link with `useLinkStatus` pending indicator |
| `market-ticker.tsx` | Client | Scrolling index strip; **`useCachedFetch`** → `/api/market` |
| `theme-toggle.tsx` | Client | Light / dark / system cycle |
| `sign-out-button.tsx` | Client | Sign out (legacy; still used in compact sidebar) |
| `nav-items.ts` | — | Nav item definitions; includes `/news` |

### `ui/`

| File | Type | Purpose |
|------|------|---------|
| `badge.tsx` | Server | Status / label pill |
| `button.tsx` | Server | Button variants |
| `card.tsx` | Server | Card container + title |
| `input.tsx` | Server | Input, label, select |
| `page-header.tsx` | Server | Page title + description + badge slot |
| `stat-card.tsx` | Server | KPI metric tile; optional **`valueClass`** prop overrides value text color |
| `empty-state.tsx` | Server | Auth-gated empty page with CTA |
| `brand-logo.tsx` | Server | App logo SVG |
| `stock-avatar.tsx` | Server | Sector-colored ticker avatar; resolves long sector names via **`shortSectorName()`** |
| `markdown-lite.tsx` | Client | Minimal markdown for AI replies |
| `db-unavailable-banner.tsx` | Server | DB connectivity warning |

### `stock/`

| File | Type | Purpose |
|------|------|---------|
| `change-badge.tsx` | Server | Colored % change with trend icon |
| `mover-list.tsx` | Server | Top gainers/losers rows |
| `stock-table.tsx` | Server | Market table |
| `sector-heatmap.tsx` | Server | Sector performance grid |
| `news-feed.tsx` | Server | Static news list (legacy) |
| `cached-news-feed.tsx` | Client | Live news via **`useCachedFetch`** → `/api/news`; localStorage TTL 1h |
| `ai-news-summary.tsx` | Client | **NEW (Jun 2026)** — AI news digest; tabs: Outlook / Hot / All / Guide; sector trends; stock movers; BEAT/MISS signals; 7-signal framework; rule-based fallback when LLM unavailable |
| `investment-picks.tsx` | Server | Curated picks card |
| `stock-analysis-panel.tsx` | Server | Combined analysis on detail page |
| `price-chart.tsx` | Client | **Upgraded (Jul 2026)** — `ComposedChart` with MA20 dashed overlay, volume histogram, % change pill, custom tooltip; `computeMA(closes, 20)` helper |
| `price-chart-panel.tsx` | Client | **Upgraded (Jul 2026)** — stats bar (period hi/lo, % change, avg volume), modern period selector; fetches history API |
| `financial-chart.tsx` | Client | Revenue/profit bar chart |
| `watchlist-button.tsx` | Client | Toggle watchlist — optimistic UI |
| `back-button.tsx` | Client | **NEW (Jul 2026)** — `router.back()` arrow button; shown at top of `/stocks/[symbol]` |

### `news/`

| File | Type | Purpose |
|------|------|---------|
| `earnings-calendar.tsx` | Client | **NEW (Jun 2026)** — VN quarterly earnings calendar; **Track ›** button on active season switches to "Earnings News" tab; BEAT/MISS tracker header; tabs: VN Season Calendar / Earnings News |
| `hot-picks-panel.tsx` | Client | **NEW (Jul 2026)** — full-width AI hot picks at top of `/news`; calls `/api/news/summary`; `buildPicks()` extracts bullish picks from `stockMovers` → `sectorTrends` → `allItems` (3-source fallback for rule-based mode); groups into Short-term (1–5 days) and Long-term (1–3 months) |

### `portfolio/`

| File | Type | Purpose |
|------|------|---------|
| `portfolio-charts.tsx` | Client | Sector allocation donut + breakdown cards; interactive donut; gradient progress bars; uses `shortSectorName()` |
| `holdings-ledger.tsx` | Client | **Sortable** holdings table; optimistic save → `POST /api/portfolio`; on success also writes `vnstocks:portfolio-holdings` to localStorage as 24h cache |

### `trading/`

| File | Type | Purpose |
|------|------|---------|
| `trading-ledger.tsx` | Client | CRUD trade table; optimistic mutations → `/api/trading`; date range filters; **Net P/L + Win rate** green when positive |

### `analysis/`

| File | Type | Purpose |
|------|------|---------|
| `analysis-view.tsx` | Client | Tabs: Portfolio / Sector / ETF / VN30 / VN100 / Avg Down / **Exit Strategy** / **Short Swing** / Scoring rules / Principles; `TechnicalTable` has **current price (₫)** and **Volume Ratio** columns; passes VN30 symbols as `defaultSymbols` to `ShortSwingPanel`. **Lazy loading (Jul 2026)**: VN30/VN100/ETF load on tab open AND are **background-prefetched** once after first paint (`requestIdleCallback` → sequential `loadLazyUniverse`), so tab switches are instant. `loadingUniverses: Set<LazyUniverse>` drives per-tab spinners; a subtle "Preparing … in background" line shows while prefetch runs |
| `ai-holdings-panel.tsx` | Client | **NEW (Jul 2026)** — `/analysis` **AI Analyst** tab. Auto-runs `GET /api/analyst/portfolio` on open (cached `vnstocks:ai-holdings` 30 min; Re-run button). Renders value-weighted health score, verdict chips, portfolio summary, actions/risks, and a per-holding table with expandable 6-agent breakdown. **Timing reconciliation (Jul 2026)**: rows with a bullish verdict but `timingConfirmed:false` show action `WAIT` (not `ACCUMULATE`) + an amber "timing not confirmed" note in the expanded panel |
| `exit-strategy-panel.tsx` | Client | **NEW (Jul 2026)** — 6-factor sell/exit calculator per holding (left list sorted by gain% desc). Factors: **1** Overvaluation (P/E vs sector avg + growth-fair P/E), **2** Thesis (interactive intact/uncertain/broken + auto fundamental deterioration), **3** Profit target (editable +% vs gain%), **4** Trailing stop (editable peak = live 52w-high via `/api/stocks/{sym}?lite=true`, trail% slider), **5** Concentration/rebalance (weight vs 20/25% caps → exact shares to trim), **6** Better opportunity (combinedScore rank). Aggregates a `sellFraction` → verdict HOLD / CONSIDER TRIMMING / TAKE PARTIAL PROFITS / TRIM SUBSTANTIALLY / SELL / EXIT with suggested shares + proceeds. Collapsible "When to Sell" framework table. Same props as `AverageDownPanel` (holdings, fundamentalRows, combinedRows, sectorAnalysis) |
| `sector-analysis-view.tsx` | Client | Per-sector leaders + trend leaders panel |
| `analysis-detail-panel.tsx` | Client | Slide-over detail for scored row |
| `stock-evaluation-panel.tsx` | Client | **Updated (Jul 2026)** — 8-category AI stock evaluation; ticker input → `/api/stock-eval` → accordion; **persists last result** to `vnstocks:stock-eval-state` localStorage; restores on mount (survives tab switches) |
| `etf-analysis-view.tsx` | Client | ETF-specific analysis rows |
| `ShortSwingPanel` (in `analysis-view.tsx`) | Client | **Updated (Jul 2026)** — auto-runs VN30 on mount (table pre-populated); **input starts empty** for custom tickers; **"Load VN30" button** fills input; **VN30 chips** (click to append); scores 8 criteria: `aboveMA20`, `aboveMA50`, `rsiStrong`, `volumeSpike`, `near52wHigh`, `outperformsMarket`, `leadingSector`, `positiveMomentum`; ENTRY (≥6) / WATCH (3–5) / SKIP (<3); collapsible 10-step guide |

### `settings/`

| File | Type | Purpose |
|------|------|---------|
| `ai-provider-panel.tsx` | Client | **NEW (Jun 2026)** — AI provider priority UI: enable/disable toggle (independent of env key), masked API key input, model selector, "Latest models" fetch button, ↑↓ priority reorder; saves to Neon via `/api/settings/ai` |
| `report-settings-panel.tsx` | Client | **NEW (Jun 2026)** — Email/Slack delivery config; portfolio report frequency selector (pill: Daily/Weekly/Monthly/Off); toggle items for weekly digest, monthly review, trade alert, earnings beat/miss, price movement alert (with slider); localStorage persistence |

### `strategy/`

| File | Type | Purpose |
|------|------|---------|
| `strategy-page-client.tsx` | Client | Orchestrates editor + review |
| `strategy-editor.tsx` | Client | Edit/save Core–Satellite config |
| `strategy-review-view.tsx` | Client | Allocation compliance, STOP_LOSS / TRIM action items |

### `analyst/`

| File | Type | Purpose |
|------|------|---------|
| `analyst-report.tsx` | Client | **NEW (Jul 2026)** — Multi-agent report UI: ticker input, animated agent pipeline, verdict/stars/confidence header, thesis, buy zone/fair value/target/stop tiles, Why-Buy vs Risks columns, valuation card, 6 agent cards (score bar + metrics + bullets). Calls `POST /api/analyst`; persists last result to `vnstocks:analyst-report`. **Timing reconciliation (Jul 2026)**: header shows a "Timing confirmed/not confirmed" badge next to the verdict; bullish + unconfirmed shows an amber warning banner under the thesis |

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
| `watchlist-grid.tsx` | Client | Watchlist cards; reads `vnstocks:watchlist-add-{SYMBOL}` from localStorage to show **"Added at: price ₫ +/−%"** badge; uses `useEffect` for SSR-safe localStorage read |
| `watchlist-section.tsx` | Client | Orchestrates add-panel + grid; on new add tracks symbol in `newlyAddedRef`; when price is first fetched for a new add, stores `{price, addedAt}` in `vnstocks:watchlist-add-{SYMBOL}` (permanent TTL) |
| `remove-watchlist-button.tsx` | Client | Remove symbol — optimistic hide |

---

## Hooks & client cache

| File | Purpose |
|------|---------|
| `src/hooks/use-cached-fetch.ts` | Stale-while-revalidate fetch; reads/writes localStorage |
| `src/lib/client/local-storage-cache.ts` | `readLocalCache` / `writeLocalCache` / `removeLocalCache`; keys prefixed `vnstocks:` |

**localStorage keys**

| Key | TTL | Used by |
|-----|-----|---------|
| `vnstocks:news-market` | 1h | Dashboard `CachedNewsFeed` |
| `vnstocks:news-{SYMBOL}` | 1h | Stock detail news |
| `vnstocks:market-snapshot` | 6h | `MarketTicker` |
| `vnstocks:report-settings` | permanent | `ReportSettingsPanel` config |
| `vnstocks:portfolio-holdings` | 24h | `HoldingsLedger` — fast reload after edit |
| `vnstocks:watchlist-add-{SYMBOL}` | permanent | `WatchlistGrid` — "Added at" price display |
| `vnstocks:stock-eval-state` | permanent | `StockEvaluationPanel` — last ticker + full result; restored on mount |
| `vnstocks:analyst-report` | permanent | `AnalystReport` (`/analyst`) — last multi-agent `InvestmentReport`; restored on mount |
| `vnstocks:ai-holdings` | 30 min | `AiHoldingsPanel` (`/analysis` AI Analyst tab) — last `PortfolioAnalystResult` |

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
| `db/advisory-portfolio.ts` | Portfolio holdings + summary; `inferExchange(symbol)` |
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
| `market-service.ts` | Sync, quotes (Entrade + Yahoo fallback); disk cache guarded by `canWriteLocalCache()`; `getTechnicalSignals` returns RSI, MA20, MA50, MACD, **Volume Ratio** (today vs 20-day avg) |
| `news-service.ts` | Yahoo + Google + CafeF + VnExpress RSS; in-memory + optional `.cache/news.json` (local only); `deduplicateNews()` |
| `providers/rss-news.ts` | RSS parse, HTML entity decode, tag strip |
| `stocks.ts` | Re-export barrel → market-service |
| `stock-metadata.ts` | Index/universe metadata |
| `stock-picks.ts` | Scored picks for dashboard |
| `screener-defaults.ts` | Default screener params + URL redirect helper |
| `providers/entrade.ts` | Entrade API |
| `providers/yahoo.ts` | Yahoo Finance fallback |
| `sector-colors.ts` | `SECTOR_ALIAS` (long→short map) + `shortSectorName()` + sector color/icon lookup |
| `cache/pe-cache.ts` | Sector P/E Yahoo fallback cache (local disk only) |

### Analysis

| Module | Purpose |
|--------|---------|
| `analysis/stock-analysis.ts` | Single-stock combined analysis |
| `analysis/fundamental-analysis.ts` | Universe fundamental rows (batch snapshots) |
| `analysis/fundamental-scoring.ts` | PE/PB/ROE scoring |
| `analysis/technical-scoring.ts` | RSI/MACD/MA/volume scoring (base 50 + adjustments) |
| `analysis/combined-analysis.ts` | Bundled universes (portfolio, VN30, VN100); **0.60×Tech + 0.40×Fund**; `TechnicalAnalysisRow` includes `currentPrice` |
| `analysis/sector-universe.ts` | Load `data/sector-stocks.json` |
| `analysis/sector-analysis.ts` | Sector scores, trend leaders, P/E from snapshot store |
| `analysis/index-universe.ts` | VN30 / VN100 lists |
| `analysis/scoring-rules.ts` | Scoring rules tab copy |
| `analysis/strategy-review.ts` | Portfolio vs targets |
| `analysis/etf-analysis.ts` | ETF universe analysis |

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
| `analyst/*` | **Multi-agent Investment Analyst** — `orchestrator.ts` (`runAnalyst`), `specialized.ts` (6 agents), `context.ts` (`gatherAnalystContext`), `types.ts`. Deterministic agents + weighted decision engine + LLM thesis synthesis. **Distinct from `agent/` (chat tool-loop).** |
| `agent/agent-loop.ts` | ReAct tool-calling loop for the `/ai-analyst` chat (`runAgent`) |
| `ai-analyst.ts` | Rule-based fallback Q&A |
| `providers/llm.ts` | **11-provider chain** (Cerebras → Groq → Gemini → Mistral → OpenRouter → SambaNova → Cohere → Hugging Face → Cloudflare → Ollama → LLM7 → fallback); `LLM_PROVIDERS` metadata array; `callLlm(messages, context, opts)` accepts `opts.apiKeys` for user-supplied key overrides; `getLlmStatus()` |
| `page-cache.ts` | `unstable_cache` wrapper + TTL |
| `serverless.ts` | `isVercel`, `canUseLocalDataFiles`, **`canWriteLocalCache`** |
| `utils.ts` | `cn`, formatting helpers |

---

## API routes (`src/app/api/`)

| Route | Methods | Purpose | Auth |
|-------|---------|---------|------|
| `/api/auth/[...nextauth]` | GET, POST | NextAuth handlers | — |
| `/api/health` | GET | Health + cache age | Public |
| `/api/market` | GET | Market snapshot | Public |
| `/api/stocks` | GET | All/screened stocks | Public |
| `/api/stocks/[symbol]` | GET | Stock detail + technicals + news + AI summary; **`?lite=true`** skips news + AI (for batch screeners) | Public |
| `/api/stocks/[symbol]/history` | GET | Price history | Public |
| `/api/news` | GET | Live RSS news | Public |
| `/api/news/summary` | GET | **AI news digest** (`?refresh=true` bypasses 30-min cache — **requires session auth**, Jul 2026, to stop LLM-quota abuse; unauthenticated requests always get cached data); 20 items max; compact context; 3500 output tokens; Cerebras→Groq→…→rule fallback; returns `NewsSummaryResponse` with `sectorTrends`, `stockMovers`, `items[]` | Session (only for `refresh=true`) |
| `/api/picks` | GET | Investment picks | Public |
| `/api/data/sync` | GET, POST | Market data sync | Session/cron |
| `/api/portfolio` | GET, POST | Portfolio holdings | Session |
| `/api/trading` | GET, POST | Trades list/add; `dateFrom`/`dateTo` filters | Session |
| `/api/trading/[id]` | PUT, DELETE | Update/delete trade | Session |
| `/api/strategy` | GET, PUT, DELETE | Strategy config | Session |
| `/api/analyst` | POST | **Multi-agent investment report** (`{symbol}` → `InvestmentReport`); runs 6 agents + decision engine + LLM thesis; loads per-user provider keys | Session |
| `/api/analyst/portfolio` | GET | **Auto portfolio review** — runs the analyst per holding (`skipLlm`) + one portfolio-level LLM synthesis → `PortfolioAnalystResult`. Powers `/analysis` AI Analyst tab | Session |
| `/api/ai` | POST | AI analyst Q&A | Session |
| `/api/ai/session` | GET, DELETE | Chat session | Session |
| `/api/stock-eval` | GET | 8-category AI stock evaluation (`?symbol=FPT`); 11-provider LLM chain; rule-based fallback | Session |
| `/api/settings/ai` | GET, PUT | Load/save user AI config (provider priority, models, API keys) from `ai_response_cache` | Session |
| `/api/settings/ai/models` | GET | Fetch live model list from provider (`?provider=groq`); falls back to curated defaults | Session |

---

## Static data (`data/`)

| File | Purpose |
|------|---------|
| `sector-stocks.json` | 9 sectors × 10 leader symbols |
| `investment-strategy.json` | Default Core–Satellite targets |
| `investment-principles.json` | Investment principles (English) |
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

## Dependency graph

```
layout (Sidebar → UserMenu, NavLink, MarketTicker)
  └── pages (Server prefetch + pageCache)
        └── client components (AiNewsSummary, EarningsCalendar, ledgers, charts, analysis tabs, ShortSwingPanel, settings panels, chat)
              └── /api routes
                    └── lib/db (trading-store → portfolio-sync)
                          └── market-service + news-service + analysis + llm
```

**Trading mutation path**: `TradingLedger` → `/api/trading` → `trading-store` → `trading_transaction` → `syncPortfolioFromTrades` → `portfolio_holding`.

**News path (preferred)**: `CachedNewsFeed` → `/api/news` → `news-service` (RSS); browser caches in localStorage.

**AI news path**: `AiNewsSummary` → `/api/news/summary` → `news-service` + `callLlm` (11-provider chain); in-memory 30-min cache.

**Swing screener path**: `ShortSwingPanel` → `GET /api/market` (once) + `GET /api/stocks/{sym}?lite=true` (per symbol, parallel) → score 8 criteria → ENTRY/WATCH/SKIP.
