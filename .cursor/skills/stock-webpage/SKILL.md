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

**Cursor rules**: `action-first-navigation.mdc`, `page-state-cache.mdc`, `vercel-cache.mdc`, `theme-aware-interactive.mdc`

---

## Stack

- **Next.js 16** App Router, React 19, Tailwind 4
- **Auth**: NextAuth v5 credentials → JWT (`session.user.id`)
- **DB**: Prisma + Neon Postgres (`DB_DRIVER=http` on Vercel)
- **Market**: Entrade + Yahoo → `market-service.ts`
- **News**: Yahoo + Google RSS + CafeF + VnExpress → `news-service.ts`; UI via `CachedNewsFeed` + localStorage, AI digest via `AiNewsSummary`
- **AI**: 5-provider chain → Cerebras → Groq → Gemini → Mistral → OpenRouter → rule fallback (see `src/lib/providers/llm.ts`)

---

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Dashboard — market, movers, **AiNewsSummary**, **CachedNewsFeed**, picks |
| `/news` | **AI News Digest** + **Earnings Calendar** (2-col layout) |
| `/portfolio` | Sortable holdings ledger + allocation charts |
| `/trading` | BUY/SELL ledger → rebuilds `portfolio_holding` |
| `/analysis` | Portfolio / Sector / VN30 / VN100 / Scoring rules / **Principles** (Stock Evaluator) |
| `/strategy-review` | Core–Satellite compliance, sell/trim signals |
| `/watchlist` | Quick-add panel + grid |
| `/screener` | Auto-runs default filters on first visit (URL redirect) |
| `/stocks/[symbol]` | Detail + CachedNewsFeed |
| `/ai-analyst` | Chat (Neon + localStorage session hydrate) |
| `/settings` | Settings hub — account overview, links to sub-pages |
| `/settings/ai` | AI provider config — keys, model selection, priority order |
| `/settings/reports` | Reports & alerts config — email/Slack delivery, scheduled reports, real-time toggles |
| `/login` | Auth |

---

## Caching (critical on Vercel)

| Layer | Where | Use for |
|-------|--------|---------|
| **Neon** | `DATABASE_URL` | Portfolio, trades, snapshots, strategy overrides, AI settings |
| **`unstable_cache`** | `page-cache.ts` | Server pages (portfolio, analysis) |
| **In-memory** | module vars | Warm lambda only; news/market server |
| **`.cache/`** | local dev only | `canWriteLocalCache()` — **never on Vercel** |
| **localStorage** | browser | News, market ticker (`vnstocks:*`), report settings |
| **`data/neon-cache/`** | local dev | DB read fallback when TCP blocked |

See [data-flow.md](data-flow.md) and `.cursor/rules/vercel-cache.mdc`.

---

## Core data model

- **Portfolio** (`portfolio_holding`) — direct edits or rebuilt from trades
- **Trading** (`trading_transaction`) — scoped by id prefix `{userId.slice(0,8)}__`
- **Strategy overrides** — per user: local `data/user-strategy/` or Neon `ai_response_cache`
- **AI settings** — per user: Neon `ai_response_cache` where `symbol="_ai_cfg_"`, `analysisType="ai_config"`, `modelName=userId`

---

## AI Provider chain (`src/lib/providers/llm.ts`)

Priority order (first enabled provider with a valid key wins):

| # | Provider | Free tier | Model | Env var |
|---|----------|-----------|-------|---------|
| 1 | **Cerebras** | 1M TPM | `llama3.1-70b` | `CEREBRAS_API_KEY` |
| 2 | **Groq** | 12k TPM | `llama-3.3-70b-versatile` | `GROQ_API_KEY` |
| 3 | **Google Gemini** | 1.5M TPM · 1500 req/day | `gemini-2.0-flash` | `GEMINI_API_KEY` |
| 4 | **Mistral AI** | Free trial | `mistral-small-latest` | `MISTRAL_API_KEY` |
| 5 | **OpenRouter** | Free `:free` models | `meta-llama/...` | `OPENROUTER_API_KEY` |
| — | Rule-based fallback | always | — | — |

Key points:
- All OpenAI-compatible providers share `callOpenAICompat()` — adding a new one is a one-liner
- User can override any key via `/settings/ai` (stored in DB `ai_response_cache`)
- `callLlm(messages, context, opts)` accepts `opts.apiKeys` map for user-provided key overrides
- `getLlmStatus()` returns active provider + all model names for display

---

## Analysis & scoring

**Tabs**: Portfolio | Sector | VN30 | VN100 | Scoring rules | Principles

- **Batch DB**: `loadAnalysisSnapshotStore(symbols)` — 2 queries per universe
- **Combined**: `0.60 × Technical + 0.40 × Fundamental`
- **Signals**: ACCUMULATE / WATCH / HOLD / TRIM / AVOID / SELL (context-aware, not score bands alone)
- **Rules copy**: `src/lib/analysis/scoring-rules.ts`
- **Principles copy**: `src/lib/content/investment-principles.ts`, `data/investment-principles.json`
- **Sector P/E**: from snapshot store + `.cache/pe-ratios.json` (local disk only)
- **Principles tab**: side-by-side layout — left = **Stock Evaluator** (`StockEvaluationPanel` → `/api/stock-eval`), right = investment principles reference

---

## Stock Evaluator (Jun 2026)

- Enter any VN ticker → 8-category AI analysis (Business / Financial / Valuation / Risks / Growth / Management / Timing / Fit)
- Uses 5-provider AI chain: quantitative from live data, qualitative from LLM training knowledge
- Falls back to `buildRuleBasedEval(stock)` if LLM unavailable
- Returns `StockEvalResult` from `src/app/api/stock-eval/route.ts`

---

## AI News Digest (`/news`)

- `AiNewsSummary` component (client) → `/api/news/summary` → RSS (Yahoo + Google + CafeF + VnExpress) → LLM
- 7-signal classification: `earnings | guidance | filing | analyst | insider | ma | macro | noise`
- Tabs: Outlook (sector trends) | Hot (HIGH impact) | All | Guide
- `EarningsCalendar` component — VN quarterly deadlines, BEAT/MISS tracker; **Track ›** button opens earnings news tab
- Rate-limit mitigation: compact context format, 20 items max per LLM call, max_tokens=3500
- Fallback: Vietnamese keyword-based rule engine when LLM rate-limited or unavailable
- In-memory cache: 30 min

---

## Settings pages (Jun 2026)

### `/settings` hub
- Account info card
- Links to sub-pages

### `/settings/ai`
- Server section: live env key status per provider (green/red)
- Client `AiProviderPanel`: enable/disable any provider, enter API keys (masked), pick model, reorder priority with ↑↓, "Latest models" button fetches live model list from provider API
- Keys stored in Neon `ai_response_cache` (personal use)

### `/settings/reports`
- `ReportSettingsPanel` (client, localStorage persistence)
- Delivery: email, Slack webhook, preferred time
- Scheduled: portfolio summary (Daily/Weekly/Monthly/Off pill selector), weekly digest toggle, monthly review toggle
- Real-time alerts: trade confirmation, earnings beat, earnings miss, price movement (with % threshold slider)

**Settings layout**: `src/app/settings/layout.tsx` — left nav rail (Overview / AI / Reports) + full-width right panel. All settings pages use `<div class="space-y-6 p-6">` — no `max-w-*` constraint.

---

## Sidebar user menu (Jun 2026)

`UserMenu` component (`src/components/layout/user-menu.tsx`) replaces old static user card + `SignOutButton`:
- Click user card at bottom-left → opens popup menu above
- Menu items: Settings, AI Configuration, Reports & Alerts, Sign out
- All settings routes accessible from sidebar without navigating to `/settings` first

---

## Sector colors & avatars (Jun 2026)

- `sector-colors.ts` exports `SECTOR_ALIAS` (long → short name map) and `shortSectorName(name)`
- All long DB sector names like `"Banking & Financial Services"` now resolve to correct colors + icons
- `stock-avatar.tsx` uses `shortSectorName()` before looking up `SECTOR_ICONS`
- ETF sector color: `#10b981` (emerald); ETF icon: `BarChart2`

---

## Theme-aware interactive elements (Jun 2026)

**Bug**: `bg-accent` is a Tailwind v4 utility that resolves `var(--color-accent)`. If `--color-accent` is not in `@theme inline`, `bg-accent` is a no-op → `text-white` on white card = invisible.

**Fix**: `globals.css` now has:
```css
@theme inline {
  --color-accent:    var(--accent);
  --color-accent-fg: var(--accent-fg);
}
```
And both themes define `--accent-fg` (light: `#fff` on dark green; dark: `#052e16` on light green).

**Rule**: Always use `text-accent-fg` (not `text-white`) when pairing with `bg-accent`. See `.cursor/rules/theme-aware-interactive.mdc`.

---

## Trading fixes (Jun 2026)

- **Trade ID**: `trading_transaction.id` is `VARCHAR(64)`. New trades use `{userId.slice(0,8)}__{uuid}` = 46 chars. Full UUID prefix (74 chars) was overflowing the column and silently failing every trade write.
- **Exchange inference**: `advisory-portfolio.ts` calls `inferExchange(symbol)` when `portfolio_holding.exchange` is NULL → uses `lookupIndexStock` then HNX list, defaults to HOSE

---

## Action-first pattern

`NavLink` + `useLinkStatus`; mutations optimistic → API → rollback. See `action-first-navigation.mdc`.

---

## Key env vars

```
# DB & Auth
DATABASE_URL, AUTH_SECRET, AUTH_URL
PERSISTENCE_ENABLED=true, DB_DRIVER=http, DB_CACHE_FIRST=0
CACHE_USER_ID=   # match bundled data/user-trades/{id}.json if needed

# AI providers (in priority order)
CEREBRAS_API_KEY, CEREBRAS_MODEL=llama3.1-70b
GROQ_API_KEY, GROQ_MODEL=llama-3.3-70b-versatile
GEMINI_API_KEY, GEMINI_MODEL=gemini-2.0-flash
MISTRAL_API_KEY, MISTRAL_MODEL=mistral-small-latest
OPENROUTER_API_KEY, OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free
```

---

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

### New settings page pattern
```
src/app/settings/[section]/page.tsx  — server, auth() redirect, pass data to client panel
src/components/settings/[name]-panel.tsx — "use client", localStorage or fetch /api/settings/*
```
Settings pages must NOT use `mx-auto max-w-*` — they fill the full right panel via `settings/layout.tsx`.

### New LLM provider
Add to `LLM_PROVIDERS` array in `llm.ts` + add `callOpenAICompat(...)` call in `callLlm()`. One-liner for OpenAI-compatible APIs.

---

## Reference

- [components.md](components.md) · [data-flow.md](data-flow.md)
- Rules: `.cursor/rules/*.mdc`
