---
name: stock-webpage
description: >-
  Vietnam stock dashboard (VN Stocks) — pages, components, lib modules, and API
  routes. Use when editing this repo, adding features, fixing bugs, or answering
  architecture questions about portfolio, trading, analysis, screener, watchlist,
  strategy, or AI analyst flows.
---

# VN Stocks — Project Knowledge

Read [components.md](components.md) for the full component catalog. Follow the **action-first** pattern below for navigation and mutations.

## Stack

- **Next.js 16** App Router, React 19, Tailwind 4
- **Auth**: NextAuth v5 credentials → JWT session
- **DB**: Prisma + Neon Postgres; JSON cache fallback (`src/lib/db/neon-cache.ts`)
- **Market data**: Entrade + Yahoo via `src/lib/market-service.ts`
- **AI**: OpenAI-compatible LLM + rule-based fallback (`src/lib/providers/llm.ts`, `src/lib/ai-analyst.ts`)

## Architecture

```
Pages (Server) ──► lib/* ──► market-service / Prisma / analysis
Client components ──► /api/* ──► lib/db/*
Server actions ──► prisma + revalidatePath
```

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Market dashboard |
| `/screener` | Stock filter (URL search params) |
| `/portfolio` | Holdings ledger + charts |
| `/trading` | BUY/SELL trade ledger |
| `/analysis` | Portfolio / VN30 / VN100 scores |
| `/strategy-review` | Core–Satellite compliance |
| `/watchlist` | Saved tickers |
| `/ai-analyst` | AI chat |
| `/stocks/[symbol]` | Stock detail |
| `/login` | Auth |

## Data layers

1. **Public market** — `market-service` (file cache + live providers)
2. **User data** — Prisma tables: `portfolio_holding`, trades, watchlist, strategy, AI chat
3. **Page cache** — `pageCache()` in `src/lib/page-cache.ts` with TTL tags per user
4. **Offline fallback** — `neon-cache` JSON when DB unreachable

## Action-first pattern (required)

**Navigation**: sidebar uses `NavLink` with `useTransition`. Route changes immediately; `src/app/loading.tsx` shows shell skeleton while server data loads.

**Mutations**: update local UI state first, close modals, then sync DB/API in background. Roll back on failure and surface error.

| Component | Optimistic action | Background sync |
|-----------|-------------------|-----------------|
| `WatchlistButton` | Toggle star state | `addToWatchlist` / `removeFromWatchlist` |
| `RemoveWatchlistButton` | Hide card | `removeFromWatchlist` |
| `HoldingsLedger` | Update table, close modal | `POST /api/portfolio` |
| `TradingLedger` | Update trades list | `POST/PUT/DELETE /api/trading` |
| `StrategyEditor` | Close editor | `PUT /api/strategy` |
| `SignOutButton` | Navigate to `/` | `signOut()` |
| `LoginPage` | Navigate to `/` | session established server-side |

Do **not** block navigation or UI on `await` DB calls when an optimistic path exists.

## Common tasks

### Add a new page

1. Create `src/app/<route>/page.tsx` (Server Component)
2. Add nav item in `src/components/layout/sidebar.tsx` (`navItems`)
3. Wrap slow loaders in `pageCache` — see `.cursor/rules/page-state-cache.mdc`
4. Add `loading.tsx` if page has heavy DB/analysis work

### Add a mutation

1. Prefer API route (`src/app/api/...`) for ledger-style CRUD
2. Use server actions (`src/lib/actions.ts`) for simple toggles
3. Apply action-first: local state → background sync → `revalidateTag` / `router.refresh()` on success
4. Invalidate cache tags: `portfolio-{userId}`, `trading-{userId}`, `analysis-{userId}`

### Add analysis scoring

Extend modules under `src/lib/analysis/`. Wire into `combined-analysis.ts` and surface via `AnalysisView`.

## Key env vars

- `DATABASE_URL` — Neon/Postgres connection
- `PERSISTENCE_ENABLED=true` — enable DB auth and user data
- `AUTH_SECRET` — NextAuth
- LLM provider vars in `src/lib/providers/llm.ts`

## Reference

- Full component catalog: [components.md](components.md)
- Page cache rules: `.cursor/rules/page-state-cache.mdc`
- Action-first rules: `.cursor/rules/action-first-navigation.mdc`
