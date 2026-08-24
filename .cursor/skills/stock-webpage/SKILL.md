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

**Cursor rules**: `action-first-navigation.mdc`, `page-state-cache.mdc`, `vercel-cache.mdc`, `theme-aware-interactive.mdc`, `auto-update-monitoring.mdc`

---

## Stack

- **Next.js 16** App Router, React 19, Tailwind 4
- **Auth**: NextAuth v5 credentials → JWT (`session.user.id`)
- **DB**: Prisma + Neon Postgres (`DB_DRIVER=http` on Vercel)
- **Market**: Entrade + Yahoo → `market-service.ts`
- **News**: Yahoo + Google RSS + CafeF + VnExpress → `news-service.ts`; UI via `CachedNewsFeed` + localStorage, AI digest via `AiNewsSummary`
- **AI**: 11-provider chain → Cerebras → Groq → Gemini → Mistral → OpenRouter → SambaNova → Cohere → Hugging Face → Cloudflare → Ollama → LLM7 → rule fallback (see `src/lib/providers/llm.ts`)

---

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Dashboard — market, movers, **AiNewsSummary**, **CachedNewsFeed**, picks |
| `/news` | **HotPicksPanel** (full-width, short/long-term AI picks) + **AI News Digest** + **Earnings Calendar** |
| `/portfolio` | Sortable holdings ledger + allocation charts |
| `/trading` | BUY/SELL ledger → rebuilds `portfolio_holding` |
| `/analysis` | Portfolio / Sector / VN30 / VN100 / ETF / **Short Swing** screener / Scoring rules / **Principles** (Stock Evaluator) |
| `/strategy-review` | Core–Satellite compliance, sell/trim signals |
| `/watchlist` | Quick-add panel + grid; cards show **"Added at" price + % change** stored in localStorage |
| `/screener` | Auto-runs default filters on first visit (URL redirect) |
| `/stocks/[symbol]` | Detail — **BackButton**, improved price chart (MA20 + volume), **Suggested Entry Price** (P/E & P/B fair value), ETF-specific layout when `isEtfSymbol()`; CachedNewsFeed |
| `/analyst` | **Multi-agent Investment Analyst** — enter a ticker → 6 specialized agents → decision engine → rated report (verdict, stars, buy zone, target, thesis) |
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
| **localStorage** | browser | News, market ticker, report settings, portfolio-holdings cache, watchlist add-prices (`vnstocks:*`) |
| **`data/neon-cache/`** | local dev | DB read fallback when TCP blocked |

See [data-flow.md](data-flow.md) and `.cursor/rules/vercel-cache.mdc`.

---

## Core data model

- **Portfolio** (`portfolio_holding`) — direct edits or rebuilt from trades; after successful edit, client also writes `vnstocks:portfolio-holdings` in localStorage for instant reload
- **Trading** (`trading_transaction`) — scoped by id prefix `{userId.slice(0,8)}__`
- **Strategy overrides** — per user: local `data/user-strategy/` or Neon `ai_response_cache`
- **AI settings** — per user: Neon `ai_response_cache` where `symbol="_ai_cfg_"`, `analysisType="ai_config"`, `modelName=userId`

---

## AI Provider chain (`src/lib/providers/llm.ts`)

Priority order (first enabled provider with a valid key wins):

| # | Provider | Free tier | Model | Env var |
|---|----------|-----------|-------|---------|
| 1 | **Cerebras** | 1M TPM | `gpt-oss-120b` | `CEREBRAS_API_KEY` |
| 2 | **Groq** | 12k TPM | `llama-3.3-70b-versatile` | `GROQ_API_KEY` |
| 3 | **Google Gemini** | 1.5M TPM · 1500 req/day | `gemini-2.0-flash` | `GEMINI_API_KEY` |
| 4 | **Mistral AI** | Free trial | `mistral-small-latest` | `MISTRAL_API_KEY` |
| 5 | **OpenRouter** | Free `:free` models | `meta-llama/llama-3.3-70b-instruct:free` | `OPENROUTER_API_KEY` |
| 6 | **SambaNova** | Free tier | `Meta-Llama-3.3-70B-Instruct` | `SAMBANOVA_API_KEY` |
| 7 | **Cohere** | Free trial ~1k calls/mo | `command-r-plus-08-2024` | `COHERE_API_KEY` |
| 8 | **Hugging Face** | Free inference credits | `meta-llama/Llama-3.3-70B-Instruct` | `HUGGINGFACE_API_KEY` |
| 9 | **Cloudflare Workers AI** | Free 10k neurons/day | `@cf/meta/llama-3.1-8b-instruct` | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` |
| 10 | **Ollama (local)** | Free, unlimited | `llama3.2` | `OLLAMA_BASE_URL` (no key; skipped unless set) |
| 11 | **LLM7 (anonymous)** | Free, no key required | `gpt-4o-mini` | `LLM7_API_KEY` (optional — raises rate limit) |
| — | Rule-based fallback | always | — | — |

Full field-by-field detail (tier, speed, models/chat URLs) lives in `data-flow.md` → "AI provider chain" and in `LLM_PROVIDERS` in `llm.ts` itself (single source of truth).

Key points:
- All OpenAI-compatible providers share `callOpenAICompat()` — adding a new one is a one-liner
- User can override any key via `/settings/ai` (stored in DB `ai_response_cache`)
- `callLlm(messages, context, opts)` accepts `opts.apiKeys` map for user-provided key overrides
- `getLlmStatus()` returns active provider + all model names for display
- **Chain logging (Jul 2026)**: each provider logs `[LLM] Using Cerebras/Groq/…` on success and `[LLM] … falling through to next provider` on error; final `[LLM] All providers failed — configure GROQ_API_KEY…` when hitting rule-based
- **Cerebras model name (Jul 2026 fix)**: model availability is **account-specific**. Older IDs `llama3.3-70b` / `llama-3.3-70b` now **404** on some accounts (`model_not_found`). This key's account serves **`gpt-oss-120b`**, `zai-glm-4.7`, `gemma-4-31b` — no Llama. Default + `CEREBRAS_MODEL` are now `gpt-oss-120b`. These are **reasoning models**, so `llm.ts` sends `reasoning_effort: "low"` (via `callOpenAICompat` `extraBody`) for any Cerebras model matching `/oss|glm/i` — otherwise reasoning tokens starve the JSON answer and it truncates. Verify a key's real models with `GET https://api.cerebras.ai/v1/models`.
- **Rule-based fallback**: `stockMovers = []` always in fallback — features that need directional picks must derive them from `allItems` instead

---

## Analysis & scoring

**Tabs**: Portfolio | **AI Analyst** | Sector | ETF | VN30 | VN100 | Avg Down | **Exit Strategy** | **Short Swing** | Scoring rules | Principles

### AI Analyst tab (Jul 2026) — auto-runs multi-agent analyst on holdings

- `AiHoldingsPanel` (client, in `analysis-view.tsx`) — **auto-runs on tab open** (once, cached to `vnstocks:ai-holdings` for 30 min; "Re-run" button forces refresh).
- Calls `GET /api/analyst/portfolio` → `runPortfolioAnalyst(userId)` in `src/lib/analyst/portfolio.ts`.
- Pipeline: loads holdings (`getPortfolioWithStocks` + `enrichHoldings` for weight/P&L) → runs the 6-agent `runAnalyst(sym, {skipLlm:true})` **per holding in parallel** (deterministic, no per-holding LLM) → **one** portfolio-level LLM synthesis (`portfolioSynthesis`, rule fallback) for summary/actions/risks.
- UI: value-weighted **health score /100**, verdict distribution chips, portfolio summary, Suggested Actions + Portfolio Risks columns, and a per-holding table (weight · P/L · conviction bar · verdict · action) with **expandable 6-agent breakdown** per row.
- `runAnalyst` gained a `skipLlm?: boolean` opt so the per-stock orchestrator uses `ruleSynthesis` and makes zero LLM calls — keeps N-holdings cost to one LLM call total. (Note: `getStock` may still trigger the unknown-stock classifier LLM once per new ticker; that result is DB-cached.)
- **Timing reconciliation (Jul 2026)**: the decision engine weights technical at only 18% (vs the Combined tab's 60%), so a stock can be STRONG BUY on conviction while its own Technical agent is weak. `TECHNICAL_TIMING_THRESHOLD` (45, `technical-scoring.ts`) is shared between the Combined tab's AVOID veto and `InvestmentReport.timingConfirmed` (set in `orchestrator.ts` from the Technical agent's score). Bullish verdict + `timingConfirmed:false` → portfolio `actionFromVerdict()` returns `"WAIT"` instead of `"ACCUMULATE"`; both synthesis functions are told explicitly and instructed not to recommend adding now. UI: `AiHoldingsPanel` shows a `WAIT` badge + amber note; `AnalystReport` shows a "Timing confirmed/not confirmed" badge + warning banner.

- **Lazy + background loading**: VN30/VN100/ETF load on tab open and are also background-prefetched once after first paint (idle callback → sequential fetch of `/api/analysis/bundle`), so tab switches are instant. Portfolio + Sector still render server-side on first paint.
- **Exit Strategy tab** (Jul 2026): `ExitStrategyPanel` — number-driven 6-factor sell framework (overvaluation, thesis, profit target, trailing stop, concentration, opportunity cost) → HOLD/TRIM/SELL verdict with suggested shares + proceeds. Uses portfolio props + live 52w-high fetch for the trailing stop.
- **Batch DB**: `loadAnalysisSnapshotStore(symbols)` — 2 queries per universe
- **Combined**: `0.60 × Technical + 0.40 × Fundamental`
- **Signals**: ACCUMULATE / WATCH / HOLD / TRIM / AVOID / SELL (context-aware, not score bands alone)
- **Rules copy**: `src/lib/analysis/scoring-rules.ts`
- **Principles copy**: `src/lib/content/investment-principles.ts`, `data/investment-principles.json`
- **Sector P/E**: from snapshot store + `.cache/pe-ratios.json` (local disk only)
- **Principles tab**: side-by-side layout — left = **Stock Evaluator** (`StockEvaluationPanel` → `/api/stock-eval`), right = investment principles reference
- **Technical table**: includes **current price (₫)** column and **Volume Ratio** (today vs 20-day avg) as a signal

### Short Swing tab (Jul 2026)

Interactive stock screener for short-term swing trading:

- **Auto-runs VN30 on tab open** (`useEffect` + `hasRun` ref) — table is populated immediately; **input stays empty** so the user can type custom tickers
- **VN30 chips + "Load VN30" button** — click any chip to append a symbol to input; "Load VN30" fills all VN30 symbols at once
- **Input**: comma-separated symbols → "Analyze" button re-runs with whatever is in the box
- **Data fetched**: `GET /api/market` (VN-Index context once) + `GET /api/stocks/{sym}?lite=true` per symbol (price, technicals; **skips news/AI**)
- **8 scored criteria**: `aboveMA20`, `aboveMA50`, `rsiStrong` (RSI 40–70), `volumeSpike` (ratio ≥ 1.5×), `near52wHigh` (within 15%), `outperformsMarket` (stock % > VN-Index %), `leadingSector`, `positiveMomentum` (price > 0)
- **Signal**: ENTRY (≥ 6/8) · WATCH (3–5/8) · SKIP (< 3/8)
- **Guide**: collapsible 10-step methodology guide (English)
- **Performance note**: uses `?lite=true` on the stocks API to skip 30 news RSS fetches for batch screener calls

---

## Stock Evaluator (Jul 2026)

- Enter any VN ticker → 8-category AI analysis (Business / Financial / Valuation / Risks / Growth / Management / Timing / Fit)
- Uses 11-provider AI chain: quantitative from live data, qualitative from LLM training knowledge
- For **unknown stocks** (not in VN30/VN100 JSON): parallel-fetches **TCBS company overview** (`/api/stock-eval` route) to inject real Vietnamese name + ICB sector into the prompt — prevents LLM hallucination about company identity
- Falls back to `buildRuleBasedEval(stock)` if LLM unavailable
- Returns `StockEvalResult` from `src/app/api/stock-eval/route.ts`
- **State persistence**: last evaluated ticker + result saved to `vnstocks:stock-eval-state` in localStorage; restored on mount so the result survives tab-switching

---

## Multi-Agent Investment Analyst (`/analyst`) — Jul 2026

Professional "investment committee" for a single ticker. Orchestrator runs 6 **deterministic** specialist agents in parallel (fast, always work on free tiers), a **decision engine** blends their scores, and **one** LLM pass writes the narrative thesis (rule-based fallback).

```
POST /api/analyst { symbol }
  → gatherAnalystContext(symbol)          # reuses getStock + getTechnicalSignals + analyzeStock + getNewsLive + getMarketSnapshot (1 batched Promise.all)
  → [financial, valuation, technical, news, risk, macro] agents  # each returns AgentReport {score 0-100, stance, headline, bullets, metrics}
  → decision engine: weighted blend → overallScore, stars, verdict, confidence, buy zone/target/stop
  → llmSynthesis(agents) → thesis + reasons + risks  # falls back to ruleSynthesis
  → InvestmentReport
```

**Key files** (`src/lib/analyst/`):
| File | Role |
|------|------|
| `types.ts` | `AgentReport`, `ValuationDetail`, `InvestmentReport`, `Verdict` |
| `context.ts` | `gatherAnalystContext(symbol)` — one batched data fetch; `findSignal()` |
| `specialized.ts` | 6 pure agents: `financialAgent`, `valuationAgent` (returns `{report, detail}`), `technicalAgent`, `newsAgent` (keyword sentiment), `riskAgent` (safety score = 100−risk), `macroAgent` |
| `orchestrator.ts` | `runAnalyst(symbol, {apiKeys?, skipLlm?})` — `WEIGHTS` blend (financial .26 / valuation .24 / technical .18 / risk .14 / news .10 / macro .08), `verdictFromScore`, `priceLevels`, LLM/rule `synthesis`; `skipLlm:true` → rule-based thesis, no LLM |
| `portfolio.ts` | `runPortfolioAnalyst(userId)` — runs `runAnalyst` per holding (`skipLlm`), value-weighted health score, one portfolio-level LLM synthesis → `PortfolioAnalystResult`. Powers the `/analysis` **AI Analyst** tab |

**Route**: `POST /api/analyst` (session auth) — loads per-user provider keys from `ai_response_cache` (`_ai_cfg_`), calls `runAnalyst`.
**UI**: `src/app/analyst/page.tsx` (server, auth gate) + `src/components/analyst/analyst-report.tsx` (client). Persists last report to `vnstocks:analyst-report` (localStorage, restored on mount); supports `?symbol=`.
**Naming**: folder is `src/lib/analyst/` (multi-agent report) — do NOT confuse with `src/lib/agent/` (the ReAct tool-loop for the `/ai-analyst` chat).

**Verdicts**: `STRONG BUY | BUY | ACCUMULATE | HOLD | TRIM | AVOID`. Agents are rule-based by design; per-agent LLM deep-dives are a future extension (see roadmap in the analyst modules).

---

## Stock Detail Page (`/stocks/[symbol]`) — Jul 2026

### BackButton
- `src/components/stock/back-button.tsx` — client component; calls `useRouter().back()`
- Renders as a small pill button in the page header so users can return to the previous page

### Price Chart (redesigned)
- `PriceChart` switched from `AreaChart` to `ComposedChart` (Recharts)
- Overlays: **Price area** + **MA20 dashed line** (amber `#f59e0b`) + **Volume histogram** (separate bar set)
- % change pill above chart shows period performance (green/red)
- Custom `ChartTooltip`: date, close price, MA20, volume
- Period selector on `PriceChartPanel` + stats bar: period high, low, % change, avg volume

### ETF-Specific Layout
- Detect with `isEtfSymbol(symbol)` from `src/lib/analysis/etf-utils.ts`
- If ETF: show **ETF meta block** (Benchmark index, Fund Manager, AUM, RSI) from `getEtfMeta(symbol)` in `src/lib/analysis/etf-universe.ts`
- Replaces standard company profile section and hides fundamentals (P/E, P/B, Revenue Growth)
- Shows an ETF investment guide section instead of stock-specific analysis text

### Suggested Entry Price Panel
- Displayed for all non-ETF stocks with enough data
- Calculates:
  - `entryLow` / `entryHigh` from MA20/MA50 band with RSI adjustment
  - `stopLoss` at 6–8% below entry
  - **`fairValue`** — calculated from fundamentals (replaces "Analyst Consensus" price target):
    - If P/E available (0 < P/E < 60): `impliedEps × targetPE` where `targetPE = clamp(14 + growthRate×0.4, 10, 25)`
    - If P/B also available: blended 65% P/E + 35% P/B
    - If only P/B: `impliedBookValue × targetPB`
    - Fair value is capped at ±60% of current price for realism
- `fairValueMethod` string shown in UI so the user understands which formula was applied
- Displays: "Fair Value / R:R" header (not "Price Target")

---

## Unknown Stock Resolution (Jul 2026)

When any stock is not in the curated JSON files (VN30/VN100), `enrichStockDetails()` runs a 3-step ladder:

```
1. stock_symbol DB cache   → instant lookup (populated by prior classification runs)
2. TCBS company API        → authoritative real data (no LLM hallucination)
   apipubaws.tcbs.com.vn/tcanalysis/v1/ticker/{symbol}/overview
   → returns organName (VI), organNameEn (EN), icbName3, icbName4, exchange
3. LLM classification      → last resort (TCBS doesn't know this ticker)
```

Result is always saved to `stock_symbol` DB table. Future requests hit step 1 instantly.

**Key files:**
| File | Role |
|------|------|
| `src/lib/providers/tcbs.ts` | TCBS API: `fetchTcbsCompanyOverview()`, `getTcbsStockMeta()`, `normalizeSector()` |
| `src/lib/stock-ai-classifier.ts` | 3-step classifier: DB → TCBS → LLM → saveToDB |
| `src/lib/stock-metadata.ts` | `lookupIndexStock()` (JSON), `lookupIndexStockFromDB()` (async DB), `clearMetaCache()` |
| `src/lib/market-service.ts` | `enrichStockDetails()` calls DB lookup then `classifyUnknownStock()` when sector = "Unknown" |

**TCBS sector normalization** (`normalizeSector` in `tcbs.ts`): maps raw ICB labels to the app vocabulary (Banking, Technology, Infrastructure, Real Estate, …). HHV example: `icbName3 = "Industrial Transportation"` → sector `"Infrastructure"`.

---

## Auto-Update Pipelines (Jul 2026)

Three scheduled/triggered processes keep data fresh. See [data-flow.md](data-flow.md#auto-update-pipelines) for full details.

| Process | Schedule | Route | What it updates |
|---------|----------|-------|-----------------|
| **Market quotes** | Weekdays 07:00 UTC | `POST /api/data/sync` | Live prices, market snapshot for seed stocks |
| **VN30/VN100 index** | Every Monday 08:00 UTC | `POST /api/admin/update-index` | `stock_symbol.is_vn30 / is_vn100` flags in DB; calls `clearMetaCache()` |
| **Stock classifier** | On first encounter of unknown ticker | (triggered by `getStock()`) | `stock_symbol` name + sector + exchange (TCBS → LLM) |

**Monitoring** — authenticated users:
```
GET /api/admin/update-index   → last sync time, VN30/VN100 member counts, DB stats
GET /api/data/sync            → last market sync status, LLM provider status
```

**Manual trigger:**
```bash
# VN30/VN100 index update
curl -X POST https://your-app.vercel.app/api/admin/update-index \
  -H "Authorization: Bearer $CRON_SECRET"

# Market data sync
curl -X POST https://your-app.vercel.app/api/data/sync \
  -H "Authorization: Bearer $CRON_SECRET"
```

**Vercel cron logs:** Dashboard → Logs → filter by `/api/admin/update-index` or `/api/data/sync`.

---

## TCBS Provider (`src/lib/providers/tcbs.ts`)

Public API — no auth required. Used for:
1. Company overview/classification (stock classifier)
2. Index composition fetch (update-index route)

| Function | Endpoint | Use |
|----------|----------|-----|
| `fetchTcbsCompanyOverview(symbol)` | `/tcanalysis/v1/ticker/{sym}/overview` | Get real company name + ICB sector |
| `getTcbsStockMeta(symbol)` | same | Returns normalized `{name, nameVi, sector, exchange, profile}` |
| `fetchTcbsIndex(indexCode)` | `/stock-insight/v1/index/{code}/components` | Get current VN30/VN100 member symbols |

**Rate limits:** No known strict limits for public endpoints. Uses `next: { revalidate: 3600 }` for company data (changes rarely) and `next: { revalidate: 0 }` for index composition (changes quarterly).

**Fallback:** If TCBS fails for index composition, `update-index` falls back to SSI iBoard API (`iboard-query.ssi.com.vn`).

---

---

## AI News Digest & Hot Picks (`/news`) — Jul 2026

### `AiNewsSummary` component
- Client → `/api/news/summary` → RSS (Yahoo + Google + CafeF + VnExpress) → LLM
- 7-signal classification: `earnings | guidance | filing | analyst | insider | ma | macro | noise`
- Tabs: Outlook (sector trends) | Hot (HIGH impact) | All | Guide
- `EarningsCalendar` component — VN quarterly deadlines, BEAT/MISS tracker; **Track ›** button opens earnings news tab
- Rate-limit mitigation: compact context format, 20 items max per LLM call, max_tokens=3500
- Fallback: Vietnamese keyword-based rule engine when LLM rate-limited or unavailable
- In-memory cache: 30 min

### `HotPicksPanel` component (NEW Jul 2026)
- Full-width banner at top of `/news` page above the existing 2-col grid
- Calls `/api/news/summary` (reuses same cache) — no new API route needed
- **`buildPicks()`** derives bullish stock picks from 3 sources (in priority order):
  1. `stockMovers` direction=UP (LLM mode only)
  2. `sectorTrends` direction=UP + keySymbols (LLM + rule-based)
  3. `allItems` + `hotItems` where `sentiment=Bullish` and `affectedSymbols` non-empty (**primary path in rule-based mode**)
- Splits picks into **Short-term (1–5 days)** — earnings/filing/analyst catalysts — and **Long-term (1–3 months)** — macro/guidance/M&A drivers
- In rule-based mode: `stockMovers = []` always; picks come from news items with extracted ticker symbols
- Empty state shows hint to configure `GROQ_API_KEY` or `GEMINI_API_KEY` for richer picks

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

# Cron protection
CRON_SECRET=     # sent as "Authorization: Bearer $CRON_SECRET" by Vercel crons

# AI providers (in priority order)
CEREBRAS_API_KEY, CEREBRAS_MODEL=gpt-oss-120b
GROQ_API_KEY, GROQ_MODEL=llama-3.3-70b-versatile
GEMINI_API_KEY, GEMINI_MODEL=gemini-2.0-flash
MISTRAL_API_KEY, MISTRAL_MODEL=mistral-small-latest
OPENROUTER_API_KEY, OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free
SAMBANOVA_API_KEY, SAMBANOVA_MODEL=Meta-Llama-3.3-70B-Instruct
COHERE_API_KEY, COHERE_MODEL=command-r-plus-08-2024
HUGGINGFACE_API_KEY, HUGGINGFACE_MODEL=meta-llama/Llama-3.3-70B-Instruct
CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_MODEL=@cf/meta/llama-3.1-8b-instruct
OLLAMA_BASE_URL, OLLAMA_MODEL=llama3.2   # local only, no key
LLM7_API_KEY (optional), LLM7_MODEL=gpt-4o-mini
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

### Batch screener API calls
Use `GET /api/stocks/{symbol}?lite=true` to skip news + AI summary. Reduces per-call cost from ~3 network requests (stock + news + AI) to 1 (stock + technicals only). Required for any component that calls the stocks endpoint for 5+ symbols concurrently.

---

## Reference

- [components.md](components.md) · [data-flow.md](data-flow.md)
- Rules: `.cursor/rules/*.mdc`
