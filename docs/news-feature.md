# VN Stocks — AI News & Earnings Feature

> Route: `/news` · Added: June 2026

---

## 1. What is this page?

The **News & Earnings** page is a real-time AI market intelligence hub for Vietnamese stock investors. It combines:

| Panel | What it does |
|---|---|
| **AI News Digest** | Fetches 30+ VN news items from 6 sources, classifies each with a 7-signal framework, generates AI summaries, and predicts which sectors/stocks will move |
| **Earnings Calendar** | Shows Vietnam's quarterly KQKD reporting deadlines, flags the active season, and surfaces earnings/guidance news from the digest |

---

## 2. Why only see a few "Hot" items?

The **Hot** tab shows only news the AI classifies as `HIGH` impact. Most days, market commentary is `LOW` impact because it does not directly affect a company's Revenue / Profit / Cash Flow / Growth.

**Hot items appear when:**
- A company releases its quarterly earnings (KQKD)
- Guidance is raised or cut
- M&A, CEO resignation, or major contract announced
- SBV issues a rate decision
- Analyst upgrades/downgrades a major stock

**How to see all news:** Click the **All (N)** tab — this shows every item with its signal badge and AI summary.

---

## 3. What is the VN Earnings Calendar?

### 3a. Vietnam Reporting Seasons

Vietnamese listed companies are legally required to publish their quarterly Business Results (Kết quả kinh doanh — KQKD) by:

| Quarter | Results cover | Regulatory deadline |
|---|---|---|
| Q1 | January – March | **April 30** |
| Q2 | April – June | **July 31** (small caps: Aug 14) |
| Q3 | July – September | **October 31** |
| Q4 | October – December | **January 31** (preliminary) / **March 31** (audited) |

> **VN30 / large-cap companies** typically publish 2–4 weeks *before* the deadline.  
> **Small caps** may use the extended deadline (+15 days).

### 3b. Current season status

The calendar automatically detects which season you are in:

| Status | Meaning |
|---|---|
| 🟢 Active Now / Peak | We are inside the reporting window — results are being published daily |
| 🔵 In Season | Window has opened but peak hasn't started yet |
| 🟡 Upcoming | Next season is coming — deadline is more than 30 days away |
| ✅ Completed | Deadline has passed |

As of **June 2026**, Q1 2026 is completed and **Q2 2026** is "In Season" with deadline July 31, 2026 (43 days remaining).

### 3c. How to know when a specific stock will release earnings

**No official earnings date API exists for VN stocks.** Unlike the US (where companies file 8-Ks and announce dates in advance), Vietnamese companies:
- Are only required to publish by the deadline
- Often post results on their investor relations pages (HOSE/HNX disclosure portal — CBTT)
- Major companies (VCB, FPT, HPG) typically publish within the first 2 weeks of the season

**Practical approach:**
1. During April / July / October / January: **watch the Hot tab daily** — earnings signals appear as `Earnings BEAT/MISS` badges
2. Follow the stock's CBTT page on HOSE: `https://www.hsx.vn/Modules/Listed/Web/StockDetail?StockId={TICKER}`
3. Set the Earnings Calendar tab to **Earnings News** — the AI digest automatically surfaces any KQKD news

### 3d. What to watch (key rules)

```
Surprise = Actual EPS − Expected EPS
```
The market reacts to the *gap vs expectation*, not the raw number.

| Scenario | Typical price reaction |
|---|---|
| EPS beats by >10% | +3–8% next session |
| EPS misses by >10% | −3–8% next session |
| Good Q but guidance cut | Often drops despite beat |
| Average Q but guidance raised | Often rises |
| Sector peer beats → others in sector | May follow up (+1–3%) |

---

## 4. Technical Implementation

### 4a. Data flow

```
[6 RSS Sources]              [news-service.ts]
  Google News (market)  ─┐
  Google News (earnings) ─┤
  Google News (macro)   ─┼──► fetchMarketNews() ──► dedupeNews() ──► 60 items
  Google News (M&A)     ─┤
  CafeF RSS             ─┤
  VnExpress Finance     ─┘

[getNewsLive(symbol?)] ──► up to 60 market items  or  25 per-symbol items
         │
         ▼
[/api/news/summary]
  ├── deduplicateNews()      remove near-duplicates by title similarity
  ├── buildNewsContext()     format 30 items as LLM context
  ├── callLlm(messages, "", { maxTokens: 6000 })
  │     └── Groq (llama-3.3-70b) or Gemini 2.0 Flash
  │           ├── Per item: signalType, impact, sentiment, surprise, scope,
  │           │            financialImpact, affectedSymbols, cascadeSymbols, aiSummary
  │           ├── sectorTrends[]   — UP/DOWN/NEUTRAL per sector
  │           └── stockMovers[]    — expected movers with reasons
  └── in-memory cache 30 min

[AiNewsSummary component]
  ├── Tab: Outlook   → sector trends grid + stock movers (UP/DOWN columns)
  ├── Tab: Hot (N)   → HIGH-impact + breaking items only
  ├── Tab: All (N)   → all 30 items with signal cards
  └── Tab: Guide     → 7-signal framework explanation in Vietnamese
```

### 4b. 7-Signal Classification Framework

Every news item is classified as one of:

| Signal | Badge colour | Vietnamese concept | HIGH impact examples |
|---|---|---|---|
| `earnings` | Violet | Báo cáo KQKD | EPS beat/miss vs expectations |
| `guidance` | Blue | Dự báo tương lai | Forward outlook raised/cut |
| `filing` | Amber | CBTT / Regulatory | CEO resign, major contract, investigation |
| `analyst` | Cyan | Khuyến nghị | Upgrade/downgrade, target price change |
| `insider` | Pink | Giao dịch nội bộ | CEO/CFO large buy or sell |
| `ma` | Orange | Mua lại / Sáp nhập | Acquisition, spin-off |
| `macro` | Teal | Vĩ mô / SBV | Rate decision, GDP, exchange rate |
| `noise` | Gray | Tin không ảnh hưởng | No effect on Rev/P&L/CF/Growth |

**Rule:** If a news item does not affect Revenue, Profit, Cash Flow, or Growth → it is `noise`.

### 4c. Surprise factor

```
BEAT     = actual result exceeded market expectation
MISS     = actual result fell short of expectation
IN_LINE  = within ±5% of expectation
UNKNOWN  = no earnings data in this item
```

### 4d. Scope

```
COMPANY   = affects one stock only
SECTOR    = affects all companies in an industry (e.g. banking rate change)
MARKET    = affects the entire VN market (e.g. SBV policy, VN-Index level)
```

### 4e. Financial impact checklist (per item)

Each news card shows coloured dot indicators:

| Dot | Meaning |
|---|---|
| `Rev` | Affects company Revenue |
| `P&L` | Affects Profit/EPS |
| `CF`  | Affects Cash Flow |
| `Gr`  | Affects Growth trajectory |

---

## 5. Key files

| File | Purpose |
|---|---|
| `src/app/news/page.tsx` | News page layout (2-column grid) |
| `src/app/api/news/summary/route.ts` | AI enrichment API, caching, rule-based fallback |
| `src/components/stock/ai-news-summary.tsx` | AI Digest component (tabs, news cards) |
| `src/components/news/earnings-calendar.tsx` | Earnings Calendar component |
| `src/lib/news-service.ts` | News fetch, dedup, cache (file + memory) |
| `src/lib/providers/rss-news.ts` | RSS URL builders + XML parser |
| `src/lib/providers/llm.ts` | Groq / Gemini LLM wrapper (maxTokens param added) |

---

## 6. Configuration

| Setting | Default | Where |
|---|---|---|
| LLM provider | Groq (llama-3.3-70b) → Gemini fallback | `GROQ_API_KEY`, `GEMINI_API_KEY` in `.env` |
| News cache TTL | 60 minutes | `CACHE_TTL_MS` in `news-service.ts` |
| AI summary cache | 30 minutes (in-memory) | `CACHE_TTL_MS` in `route.ts` |
| Items per refresh | 60 market items (deduped) | `fetchMarketNews()` |
| Items sent to LLM | 30 (top by recency) | `slice(0, 30)` in `route.ts` |
| LLM max tokens | 6000 | `maxTokens: 6000` in `route.ts` |

---

## 7. On production vs local

| Feature | Local dev | Vercel production |
|---|---|---|
| News fetch (RSS) | ✅ Works | ✅ Works |
| Keyword classification | ✅ Works (fallback) | ✅ Works |
| AI enrichment (LLM) | ❌ Blocked by firewall | ✅ Works (Groq/Gemini) |
| Sector trends | ❌ Empty | ✅ Generated |
| Stock movers | ❌ Empty | ✅ Generated |
| AI summaries | ❌ Title repeated | ✅ AI-generated one-liners |
| Earnings Calendar | ✅ Works | ✅ Works |
| `isRuleBased` flag | `true` | `false` |

> **Note:** The blue "Keyword analysis mode" banner appears automatically when the LLM is unavailable. All core features (news feed, calendar, classification) still function.
