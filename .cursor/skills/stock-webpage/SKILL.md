---
name: stock-webpage
description: >-
  Vietnam stock dashboard (VN Stocks) — pages, components, lib modules, DB tables,
  trading/portfolio sync, and API routes. Use when editing this repo, fixing empty
  portfolio/trading on Vercel, analysis/sector features, or architecture questions.
---

# VN Stocks — Project Knowledge

| Doc | Contents |
|-----|----------|
| [components.md](components.md) | Full component & API catalog |
| [data-flow.md](data-flow.md) | DB tables, trading→portfolio, cache, Vercel ops, sync scripts |

Follow **action-first** for navigation/mutations (`.cursor/rules/action-first-navigation.mdc`).

## Stack

- **Next.js 16** App Router, React 19, Tailwind 4
- **Auth**: NextAuth v5 credentials → JWT session (`session.user.id`)
- **DB**: Prisma + Neon Postgres (`DB_DRIVER=http` on Vercel)
- **Market**: Entrade + Yahoo fallback → `src/lib/market-service.ts`
- **AI**: Groq/Gemini + rule fallback → `src/lib/providers/llm.ts`

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Market dashboard |
| `/portfolio` | Holdings ledger (sortable), charts — `portfolio_holding` |
| `/trading` | BUY/SELL ledger — `trading_transaction` |
| `/analysis` | Portfolio / **Sector** / VN30 / VN100 |
| `/strategy-review` | Core–Satellite compliance, sell/trim signals |
| `/watchlist` | Saved tickers |
| `/ai-analyst` | AI chat |
| `/screener` | URL-param stock filter |
| `/stocks/[symbol]` | Stock detail + analysis panel |
| `/login` | Auth |

## Core data model

**Portfolio** (`portfolio_holding`): per-user holdings. Edited on `/portfolio` or **rebuilt from trades**.

**Trading** (`trading_transaction`): ledger. No `user_id` column — scoped by trade `id` prefix `{userId}__`.

**Flow**: trade CRUD → `syncPortfolioFromTrades()` → `rebuildPortfolioFromTrades()` → `portfolio_holding`.

See [data-flow.md](data-flow.md) for ID conventions, file paths, and sync commands.

## Data layers (read order)

1. **Live Neon** — when `PERSISTENCE_ENABLED` + `DATABASE_URL` set
2. **`data/neon-cache/*.json`** — local only; skipped on Vercel if files missing
3. **`data/user-trades/{userId}.json`** — trading fallback on Vercel (read-only, git-tracked)
4. **`.cache/market-data.json`** — market quotes (6h TTL)

## Action-first pattern

**Navigation**: `NavLink` + `useLinkStatus`; `src/app/loading.tsx` skeleton.

**Mutations**: UI first → background API → rollback on failure → `revalidateTag` / `router.refresh()`.

| Component | Optimistic | Background |
|-----------|------------|------------|
| `WatchlistButton` | Toggle star | server actions |
| `WatchlistGrid` / `RemoveWatchlistButton` | Hide card | `removeFromWatchlist` |
| `HoldingsLedger` | Table + close modal | `POST /api/portfolio` |
| `TradingLedger` | Trades list | `/api/trading` |
| `StrategyEditor` | Close editor | `PUT /api/strategy` |
| `SignOutButton` | Navigate `/` | `signOut()` |

## Analysis page

Tabs: **Portfolio** | **Sector** | VN30 | VN100 | Scoring rules.

- Portfolio bundle shares cache key with `/portfolio` page
- Cache key includes **symbol list**, not just count
- **Sector tab**: `computeSectorAnalysis()` — 9 sectors × 10 leaders from `data/sector-stocks.json`
- **Trend leaders**: top combined scores across sectors (ACCUMULATE/WATCH candidates)

Lib: `sector-analysis.ts`, `sector-universe.ts`, `combined-analysis.ts`, `db/analysis-snapshots.ts` (batch snapshot loader — 2 DB queries per universe).

## Strategy / sell signals

`/strategy-review` compares holdings vs `data/investment-strategy.json` targets:

- STOP_LOSS, TAKE_PROFIT, TARGET_REACHED, TRIM, SECTOR_CAP

Editable via Strategy editor → `PUT /api/strategy`.

## Key env vars

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | Neon pooler URL (**required on Vercel**) |
| `PERSISTENCE_ENABLED=true` | Enable DB auth + user data |
| `DB_DRIVER=http` | Neon HTTP on Vercel |
| `DB_CACHE_FIRST=0` | **Vercel** — do not rely on gitignored neon-cache |
| `AUTH_SECRET`, `AUTH_URL` | NextAuth |
| `CACHE_USER_ID` | Fallback user for bundled trade JSON |
| `STOCK_SERVICE_TRADES_USER` | Ledger key for import (default `quocthien049`) |
| `GROQ_API_KEY` / `GEMINI_API_KEY` | LLM |

## Common tasks

### Fix empty portfolio/trading on Vercel

1. Set `DATABASE_URL`, `PERSISTENCE_ENABLED`, `DB_CACHE_FIRST=0`
2. Set `CACHE_USER_ID` to match `data/user-trades/{id}.json`
3. Run `npm run sync:trades` from host that reaches Neon
4. See [data-flow.md](data-flow.md) troubleshooting

### Add a page

1. `src/app/<route>/page.tsx` + nav in `sidebar.tsx`
2. Wrap loaders in `pageCache()` — `.cursor/rules/page-state-cache.mdc`
3. Invalidate tags on mutations

### Import trades from stock-service

```bash
npm run import:trades:service
npm run sync:trades
npm run probe:trades
```

## Scripts (`package.json`)

| Script | Purpose |
|--------|---------|
| `dev` | Next dev :4873 |
| `sync:trades` | JSON → Neon |
| `import:trades:service` | stock-service JSON → local JSON |
| `probe:trades` | DB row counts |
| `sync:users:cache` | User cache export |

## Reference

- Components: [components.md](components.md)
- Data & DB: [data-flow.md](data-flow.md)
- Page cache: `.cursor/rules/page-state-cache.mdc`
- Action-first: `.cursor/rules/action-first-navigation.mdc`
