---
name: stock-webpage
description: >-
  Vietnam stock dashboard (VN Stocks) — pages, components, DB, caching (Neon,
  localStorage, Vercel), analysis/scoring, trading/portfolio sync. Use when editing
  this repo, fixing Vercel production issues, or adding features.
---

# VN Stocks — Project Knowledge

| Doc | Contents |
|-----|----------|
| [components.md](components.md) | Full component & API catalog |
| [data-flow.md](data-flow.md) | DB, trading→portfolio, cache layers, Vercel ops |

**Cursor rules**: `action-first-navigation.mdc`, `page-state-cache.mdc`, `vercel-cache.mdc`

## Stack

- **Next.js 16** App Router, React 19, Tailwind 4
- **Auth**: NextAuth v5 credentials → JWT (`session.user.id`)
- **DB**: Prisma + Neon Postgres (`DB_DRIVER=http` on Vercel)
- **Market**: Entrade + Yahoo → `market-service.ts`
- **News**: Yahoo + Google RSS → `news-service.ts` (API); UI via `CachedNewsFeed` + localStorage
- **AI**: Groq/Gemini + rule fallback

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Dashboard — market, movers, **CachedNewsFeed**, picks |
| `/portfolio` | Sortable holdings ledger + charts |
| `/trading` | BUY/SELL ledger → rebuilds `portfolio_holding` |
| `/analysis` | Portfolio / Sector / VN30 / VN100 / **Scoring rules** / **Principles** |
| `/strategy-review` | Core–Satellite compliance, sell/trim signals |
| `/watchlist` | Quick-add panel + grid |
| `/screener` | Auto-runs default filters on first visit (URL redirect) |
| `/stocks/[symbol]` | Detail + **CachedNewsFeed** |
| `/ai-analyst` | Chat (Neon + localStorage session hydrate) |
| `/login` | Auth |

## Caching (critical on Vercel)

| Layer | Where | Use for |
|-------|--------|---------|
| **Neon** | `DATABASE_URL` | Portfolio, trades, snapshots, strategy overrides |
| **`unstable_cache`** | `page-cache.ts` | Server pages (portfolio, analysis) |
| **In-memory** | module vars | Warm lambda only; news/market server |
| **`.cache/`** | local dev only | `canWriteLocalCache()` — **never on Vercel** |
| **localStorage** | browser | News, market ticker (`vnstocks:*` keys) |
| **`data/neon-cache/`** | local dev | DB read fallback when TCP blocked |

See [data-flow.md](data-flow.md) and `.cursor/rules/vercel-cache.mdc`.

## Core data model

- **Portfolio** (`portfolio_holding`) — direct edits or rebuilt from trades
- **Trading** (`trading_transaction`) — scoped by id prefix `{userId}__`
- **Strategy overrides** — per user: local `data/user-strategy/` or Neon `ai_response_cache`

## Analysis & scoring

**Tabs**: Portfolio | Sector | VN30 | VN100 | Scoring rules | Principles

- **Batch DB**: `loadAnalysisSnapshotStore(symbols)` — 2 queries per universe
- **Combined**: `0.60 × Technical + 0.40 × Fundamental`
- **Signals**: ACCUMULATE / WATCH / HOLD / TRIM / AVOID / SELL (context-aware, not score bands alone)
- **Rules copy**: `src/lib/analysis/scoring-rules.ts`
- **Principles copy**: `src/lib/content/investment-principles.ts`, `data/investment-principles.json`
- **Sector P/E**: from snapshot store + `.cache/pe-ratios.json` (local disk only)
- **Principles tab** (Jun 2026): side-by-side layout — left = **Stock Evaluator** (`StockEvaluationPanel` → `/api/stock-eval`), right = investment principles reference

## Stock Evaluator (Jun 2026)

- Enter any VN ticker → 8-category AI analysis (Business / Financial / Valuation / Risks / Growth / Management / Timing / Fit)
- Uses Groq/Gemini LLM: quantitative from live data, qualitative from LLM training knowledge
- Falls back to rule-based analysis if LLM unavailable
- Returns `StockEvalResult` from `src/app/api/stock-eval/route.ts`

## Sector colors & avatars (Jun 2026)

- `sector-colors.ts` exports `SECTOR_ALIAS` (long → short name map) and `shortSectorName(name)`
- All long DB sector names like `"Banking & Financial Services"` now resolve to correct colors + icons
- `stock-avatar.tsx` uses `shortSectorName()` before looking up `SECTOR_ICONS`
- ETF sector color: `#10b981` (emerald); ETF icon: `BarChart2`

## Trading fixes (Jun 2026)

- **Trade ID**: `trading_transaction.id` is `VARCHAR(64)`. New trades use `{userId.slice(0,8)}__{uuid}` = 46 chars. Full UUID prefix (74 chars) was overflowing the column and silently failing every trade write.
- **Exchange inference**: `advisory-portfolio.ts` calls `inferExchange(symbol)` when `portfolio_holding.exchange` is NULL → uses `lookupIndexStock` then HNX list, defaults to HOSE

## Action-first pattern

`NavLink` + `useLinkStatus`; mutations optimistic → API → rollback. See `action-first-navigation.mdc`.

## Key env vars (Vercel)

```
DATABASE_URL, AUTH_SECRET, AUTH_URL
PERSISTENCE_ENABLED=true, DB_DRIVER=http, DB_CACHE_FIRST=0
CACHE_USER_ID=   # match bundled data/user-trades/{id}.json if needed
```

## Common tasks

### Vercel ENOENT `.cache`

Guard disk writes with `canWriteLocalCache()`. Use `CachedNewsFeed` / `useCachedFetch` for client cache.

### Empty portfolio/trading

See [data-flow.md](data-flow.md) — `DATABASE_URL`, `CACHE_USER_ID`, `npm run sync:trades`

### Screener defaults

`src/lib/screener-defaults.ts` — redirect `/screener` → `?maxPe=18&minRevenueGrowth=12&minRoe=14&maxRsi=55`. Reject `maxPe=0`.

### Import trades

```bash
npm run import:trades:service && npm run sync:trades && npm run probe:trades
```

## Reference

- [components.md](components.md) · [data-flow.md](data-flow.md)
- Rules: `.cursor/rules/*.mdc`
