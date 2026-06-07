# VN Stocks — Component & Module Catalog

High-level reference for AI agents. Server = React Server Component; Client = `"use client"`.

---

## Pages (`src/app/`)

| Route | File | Type | Purpose | Data sources |
|-------|------|------|---------|--------------|
| `/` | `page.tsx` | Server | Market dashboard: indices, movers, sectors, news, picks | `stocks`, `stock-picks`, `user-data` |
| `/login` | `login/page.tsx` | Client | Email/password login & registration | `actions` |
| `/portfolio` | `portfolio/page.tsx` | Server | Holdings ledger, allocation charts | `advisory-portfolio`, `holdings-enrichment`, `page-cache` |
| `/watchlist` | `watchlist/page.tsx` | Server | User watchlist + discover stocks | `user-data`, `stocks` |
| `/analysis` | `analysis/page.tsx` | Server | Portfolio / VN30 / VN100 analysis | `combined-analysis`, `recommendations`, `page-cache` |
| `/ai-analyst` | `ai-analyst/page.tsx` | Server | AI chat shell | `auth`; chat via `/api/ai` |
| `/stocks/[symbol]` | `stocks/[symbol]/page.tsx` | Server | Stock detail: quote, charts, fundamentals | `stocks`, `stock-analysis`, `user-data` |
| `/trading` | `trading/page.tsx` | Server | Trade ledger wrapper | `auth`; `TradingLedger` → `/api/trading` |
| `/screener` | `screener/page.tsx` | Server | Filter stocks via URL params | `stocks` (`screenStocks`) |
| `/strategy-review` | `strategy-review/page.tsx` | Server | Core–Satellite compliance | `advisory-portfolio`, `strategy/*` |

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
| `nav-link.tsx` | Client | Nav link with `useTransition` pending state |
| `market-ticker.tsx` | Client | Scrolling index strip; fetches `/api/market` |
| `theme-toggle.tsx` | Client | Light / dark / system cycle |
| `sign-out-button.tsx` | Client | Sign out — navigates first, DB session cleared after |

### `ui/`

| File | Type | Purpose |
|------|------|---------|
| `badge.tsx` | Server | Status / label pill |
| `button.tsx` | Server | Button variants |
| `card.tsx` | Server | Card container + title |
| `input.tsx` | Server | Input, label, select |
| `page-header.tsx` | Server | Page title + description + badge slot |
| `stat-card.tsx` | Server | KPI metric tile |
| `empty-state.tsx` | Server | Auth-gated empty page with CTA |
| `brand-logo.tsx` | Server | App logo SVG |
| `stock-avatar.tsx` | Server | Sector-colored ticker avatar |
| `markdown-lite.tsx` | Client | Minimal markdown for AI replies |
| `db-unavailable-banner.tsx` | Server | DB connectivity warning |

### `stock/`

| File | Type | Purpose |
|------|------|---------|
| `change-badge.tsx` | Server | Colored % change with trend icon |
| `mover-list.tsx` | Server | Top gainers/losers rows |
| `stock-table.tsx` | Server | Market table |
| `sector-heatmap.tsx` | Server | Sector performance grid |
| `news-feed.tsx` | Server | News list |
| `investment-picks.tsx` | Server | Curated picks card |
| `stock-analysis-panel.tsx` | Server | Combined analysis on detail page |
| `price-chart.tsx` | Client | Recharts line chart |
| `price-chart-panel.tsx` | Client | Chart + range; fetches history API |
| `financial-chart.tsx` | Client | Revenue/profit bar chart |
| `watchlist-button.tsx` | Client | Toggle watchlist — optimistic UI |

### `portfolio/`

| File | Type | Purpose |
|------|------|---------|
| `portfolio-charts.tsx` | Client | Sector allocation pie + value summary |
| `holdings-ledger.tsx` | Client | Editable holdings table; optimistic save → `/api/portfolio` |

### `trading/`

| File | Type | Purpose |
|------|------|---------|
| `trading-ledger.tsx` | Client | CRUD trade table; optimistic mutations → `/api/trading` |

### `analysis/`

| File | Type | Purpose |
|------|------|---------|
| `analysis-view.tsx` | Client | Tabbed Portfolio / VN30 / VN100 grids |
| `analysis-detail-panel.tsx` | Client | Slide-over detail for scored row |

### `strategy/`

| File | Type | Purpose |
|------|------|---------|
| `strategy-page-client.tsx` | Client | Orchestrates editor + review |
| `strategy-editor.tsx` | Client | Edit/save Core–Satellite config |
| `strategy-review-view.tsx` | Client | Allocation compliance, action items |

### `ai-analyst/`

| File | Type | Purpose |
|------|------|---------|
| `chat.tsx` | Client | Chat UI; `/api/ai`, `/api/ai/session` |

### `screener/`

| File | Type | Purpose |
|------|------|---------|
| `screener-form.tsx` | Client | Filter form; navigates with query params |

### `watchlist/`

| File | Type | Purpose |
|------|------|---------|
| `watchlist-grid.tsx` | Client | Watchlist cards with optimistic remove |
| `remove-watchlist-button.tsx` | Client | Remove symbol — optimistic hide |

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
| `db/advisory-portfolio.ts` | Portfolio holdings + summary |
| `db/portfolio-sync.ts` | Sync `portfolio_holding` rows |
| `db/trading-store.ts` | Trade CRUD, portfolio rebuild |
| `db/trading-types.ts` | Trade types |
| `db/ai-chat-store.ts` | AI chat persistence |
| `db/recommendations.ts` | Market picks from Neon |
| `db/price-history.ts` | DB price history |
| `db/cache-first.ts` | Skip DB when cache-only |
| `db/neon-cache.ts` | JSON cache snapshots |
| `user-data.ts` | Watchlist + AI sessions for pages |

### Market

| Module | Purpose |
|--------|---------|
| `market-service.ts` | Sync, quotes, screener, news, AI context |
| `stocks.ts` | Re-export barrel → market-service |
| `stock-metadata.ts` | Index/universe metadata |
| `stock-picks.ts` | Scored picks for dashboard |
| `providers/entrade.ts` | Entrade API |
| `providers/yahoo.ts` | Yahoo Finance fallback |
| `sector-colors.ts` | Sector → color mapping |

### Analysis

| Module | Purpose |
|--------|---------|
| `analysis/stock-analysis.ts` | Single-stock combined analysis |
| `analysis/fundamental-analysis.ts` | Universe fundamental rows |
| `analysis/fundamental-scoring.ts` | PE/PB/ROE scoring |
| `analysis/technical-scoring.ts` | RSI/MACD scoring |
| `analysis/combined-analysis.ts` | Bundled universes |
| `analysis/index-universe.ts` | VN30 / VN100 lists |
| `analysis/scoring-rules.ts` | UI rule copy |
| `analysis/strategy-review.ts` | Portfolio vs targets |

### Portfolio & Strategy

| Module | Purpose |
|--------|---------|
| `portfolio/holdings-enrichment.ts` | Live quotes/P&L on holdings |
| `portfolio/from-trades.ts` | Rebuild holdings from trades |
| `strategy/strategy-types.ts` | Core–Satellite types |
| `strategy/strategy-config.ts` | Default config |
| `strategy/user-strategy.ts` | Per-user strategy persistence |
| `strategy/strategy-review.ts` | Compliance comparison |

### AI & Infra

| Module | Purpose |
|--------|---------|
| `ai-analyst.ts` | Rule-based fallback Q&A |
| `providers/llm.ts` | OpenAI-compatible LLM |
| `page-cache.ts` | `unstable_cache` wrapper + TTL |
| `utils.ts` | `cn`, formatting helpers |

---

## API routes (`src/app/api/`)

| Route | Methods | Purpose | Auth |
|-------|---------|---------|------|
| `/api/auth/[...nextauth]` | GET, POST | NextAuth handlers | — |
| `/api/health` | GET | Health + cache age | Public |
| `/api/market` | GET | Market snapshot | Public |
| `/api/stocks` | GET | All/screened stocks | Public |
| `/api/stocks/[symbol]` | GET | Stock detail | Public |
| `/api/stocks/[symbol]/history` | GET | Price history | Public |
| `/api/news` | GET | News feed | Public |
| `/api/picks` | GET | Investment picks | Public |
| `/api/data/sync` | GET, POST | Market data sync | Session / cron |
| `/api/portfolio` | GET, POST | Portfolio holdings | Session |
| `/api/trading` | GET, POST | Trades list/add | Session |
| `/api/trading/[id]` | PUT, DELETE | Update/delete trade | Session |
| `/api/strategy` | GET, PUT, DELETE | Strategy config | Session |
| `/api/ai` | POST | AI analyst Q&A | Session |
| `/api/ai/session` | GET, DELETE | Chat session | Session |

---

## Dependency graph

```
layout (Sidebar, Ticker)
  └── pages (Server prefetch)
        └── client components (ledgers, charts, chat)
              └── /api routes
                    └── lib/db + market-service + analysis
```
