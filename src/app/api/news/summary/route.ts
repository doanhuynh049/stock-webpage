import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getNewsLive } from "@/lib/news-service";
import { callLlm } from "@/lib/providers/llm";
import type { NewsItem } from "@/types/stock";

// ─── types ───────────────────────────────────────────────────────────────────

/**
 * Professional news signal type (7-category framework for VN stocks)
 * earnings → KQKD; guidance → forward outlook; filing → CBTT/regulatory;
 * analyst → upgrade/downgrade; insider → CEO/CFO trade; ma → M&A/spin-off;
 * macro → SBV/GDP/rate; noise → no revenue/profit/cashflow/growth effect
 */
export type NewsSignalType =
  | "earnings"
  | "guidance"
  | "filing"
  | "analyst"
  | "insider"
  | "ma"
  | "macro"
  | "noise";

export type EarningsSurprise = "BEAT" | "MISS" | "IN_LINE" | "UNKNOWN";
export type NewsScope = "COMPANY" | "SECTOR" | "MARKET";

export type FinancialImpact = {
  revenue: boolean;
  profit: boolean;
  cashFlow: boolean;
  growth: boolean;
};

export type AiNewsItem = {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  link?: string;
  aiSummary: string;
  // impact rating
  impact: "HIGH" | "MEDIUM" | "LOW";
  sentiment: "Bullish" | "Bearish" | "Neutral";
  affectedSymbols: string[];
  category: NewsItem["category"];
  isBreaking: boolean;
  // professional signal fields
  signalType: NewsSignalType;
  scope: NewsScope;
  financialImpact: FinancialImpact;
  surprise: EarningsSurprise;
  // cascade: other symbols that may benefit/suffer (sector contagion)
  cascadeSymbols: string[];
};

export type SectorTrend = {
  sector: string;
  direction: "UP" | "DOWN" | "NEUTRAL";
  reason: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  keySymbols: string[];
};

export type StockMover = {
  symbol: string;
  name?: string;
  direction: "UP" | "DOWN";
  reason: string;
  impact: "HIGH" | "MEDIUM";
};

export type NewsSummaryResponse = {
  generatedAt: string;
  provider: string;
  isRuleBased: boolean;
  marketMood: "Bullish" | "Bearish" | "Neutral";
  moodSummary: string;
  hotItems: AiNewsItem[];
  allItems: AiNewsItem[];
  sectorTrends: SectorTrend[];
  stockMovers: StockMover[];
};

// ─── Deduplication ───────────────────────────────────────────────────────────
// Remove near-duplicate news items (same story from multiple Vietnamese news sites).
// Strategy: normalise title → first 40 chars lowercased → keep only first occurrence.

function deduplicateNews(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return items.filter((n) => {
    const key = n.title
      .toLowerCase()
      .replace(/[^a-z0-9àáâãèéêìíòóôõùúăđĩũơưạảấầẩẫậắằẳẵặẹẻẽềếểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ\s]/g, "")
      .trim()
      .slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── LLM prompt ──────────────────────────────────────────────────────────────

const NEWS_SYSTEM_PROMPT = `You are a senior Vietnamese stock strategist. Classify news and return JSON only.

SIGNAL TYPES: earnings|guidance|filing|analyst|insider|ma|macro|noise
- earnings: revenue/EPS beat or miss vs expectations
- guidance: company raises/cuts forward outlook
- filing: CBTT/8-K: CEO exit, M&A announce, legal, major contract
- analyst: upgrade/downgrade, target price change
- insider: CEO/CFO/major shareholder buy or sell
- ma: merger, acquisition, stake sale
- macro: SBV rate, GDP, inflation, FED, VND exchange rate
- noise: does NOT affect revenue/profit/cashflow/growth

RETURN valid JSON (no markdown):
{
  "marketMood": "Bullish|Bearish|Neutral",
  "moodSummary": "2-3 sentences on key themes",
  "sectorTrends": [{ "sector": "name", "direction": "UP|DOWN|NEUTRAL", "reason": "1 sentence", "confidence": "HIGH|MEDIUM|LOW", "keySymbols": ["TICK"] }],
  "stockMovers": [{ "symbol": "TICK", "name": "company", "direction": "UP|DOWN", "reason": "why", "impact": "HIGH|MEDIUM" }],
  "items": [{
    "id": "original_id",
    "aiSummary": "market implication in 1 sentence",
    "signalType": "earnings|guidance|filing|analyst|insider|ma|macro|noise",
    "impact": "HIGH|MEDIUM|LOW",
    "sentiment": "Bullish|Bearish|Neutral",
    "surprise": "BEAT|MISS|IN_LINE|UNKNOWN",
    "scope": "COMPANY|SECTOR|MARKET",
    "financialImpact": { "revenue": true, "profit": true, "cashFlow": false, "growth": true },
    "affectedSymbols": ["TICK"],
    "cascadeSymbols": [],
    "isBreaking": false
  }]
}`;

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildNewsContext(items: NewsItem[]): string {
  return items
    .map((n, i) => {
      // Compact single-line format to minimise input tokens
      const title = n.title.slice(0, 120);
      const blurb = n.summary ? n.summary.slice(0, 80) : "";
      const syms = n.symbols.length ? n.symbols.join(",") : "-";
      const date = n.publishedAt.slice(0, 10);
      return `[${i + 1}] id=${n.id}|${n.category}|${n.source}|${date}|syms=${syms}\nT: ${title}${blurb ? `\nB: ${blurb}` : ""}`;
    })
    .join("\n---\n");
}

// ─── Vietnamese keyword-based rule engine (fallback when LLM unavailable) ────

const VN_BEARISH = /giảm|sụt|lao dốc|bán tháo|thất bại|thua lỗ|phá sản|cắt giảm|rủi ro|hạ dự báo|downgrade|miss/i;
const VN_BULLISH = /tăng|bứt phá|lập đỉnh|kỷ lục|lợi nhuận tăng|doanh thu tăng|nâng dự báo|upgrade|beat|mua vào|hút vốn|khởi sắc/i;
const VN_EARNINGS = /kqkd|kết quả kinh doanh|lợi nhuận|doanh thu|eps|báo cáo tài chính|quý|earnings/i;
const VN_GUIDANCE = /dự báo|triển vọng|kế hoạch|guidance|mục tiêu năm|nâng mục tiêu|hạ mục tiêu|outlook/i;
const VN_MACRO = /lãi suất|sbv|ngân hàng nhà nước|fed|gdp|lạm phát|tỷ giá|vĩ mô|macro|interest rate|inflation/i;
const VN_ANALYST = /khuyến nghị|nâng giá mục tiêu|hạ giá mục tiêu|upgrade|downgrade|analyst|mua|bán|trung lập|target price/i;
const VN_INSIDER = /cổ đông nội bộ|lãnh đạo mua|lãnh đạo bán|insider|ceo|cfo|chủ tịch mua|chủ tịch bán/i;
const VN_MA = /mua lại|sáp nhập|thâu tóm|m&a|merger|acquisition|spin.?off|thoái vốn|chia tách/i;
const VN_FILING = /cbtt|công bố thông tin|từ chức|bổ nhiệm|kiện|điều tra|hợp đồng lớn/i;
const VN_HIGH_IMPACT = /đột biến|kỷ lục|vượt đỉnh|phá sản|thâu tóm|từ chức|ceo|điều tra|nâng hạn mức|nới room/i;

// Known VN stock tickers (top ~60 by liquidity)
const VN_TICKERS = new Set([
  "VCB","BID","CTG","MBB","TCB","VPB","ACB","HDB","STB","LPB","VIB","MSB","TPB","SSB","OCB",
  "FPT","VIC","VHM","VNM","VRE","GVR","PLX","HPG","HSG","NKG","SMC","PNJ","MWG","FRT","DGW",
  "MSN","SAB","VJC","HVN","GMD","REE","SCI","EVF","DIG","NLG","KDH","PDR","VPI","BCG","DXG",
  "GEX","SHI","PC1","PGV","POW","PPC","NT2","BSR","OIL","PVS","PVD","DPM","DCM","BMP","NTP",
  "VNM","TCH","VTO","VCG","SJS","HDG","VHC","ANV","CMG","ELC","FIR",
]);

function extractTickersFromText(text: string): string[] {
  // match 2-3 uppercase letter sequences surrounded by non-alpha
  const matches = text.match(/\b([A-Z]{2,4})\b/g) ?? [];
  return [...new Set(matches.filter((m) => VN_TICKERS.has(m)))];
}

function classifyItem(n: NewsItem): Partial<AiNewsItem> {
  const text = `${n.title} ${n.summary ?? ""}`;
  const lo = text.toLowerCase();

  // signal type
  let signalType: NewsSignalType = "noise";
  if (VN_MA.test(lo)) signalType = "ma";
  else if (VN_INSIDER.test(lo)) signalType = "insider";
  else if (VN_EARNINGS.test(lo)) signalType = "earnings";
  else if (VN_GUIDANCE.test(lo)) signalType = "guidance";
  else if (VN_FILING.test(lo)) signalType = "filing";
  else if (VN_ANALYST.test(lo)) signalType = "analyst";
  else if (VN_MACRO.test(lo) || n.category === "macro") signalType = "macro";
  else if (n.category === "breaking") signalType = "macro";

  // sentiment
  const bullScore = (lo.match(VN_BULLISH) ?? []).length;
  const bearScore = (lo.match(VN_BEARISH) ?? []).length;
  const sentiment: AiNewsItem["sentiment"] =
    bullScore > bearScore ? "Bullish" : bearScore > bullScore ? "Bearish" : "Neutral";

  // impact
  const isHighSignal = ["earnings", "ma", "insider", "filing"].includes(signalType);
  const hasHighKw = VN_HIGH_IMPACT.test(lo);
  const impact: AiNewsItem["impact"] = (isHighSignal || hasHighKw || n.category === "breaking") ? "HIGH"
    : signalType !== "noise" ? "MEDIUM" : "LOW";

  // financial impact
  const financialImpact: FinancialImpact = {
    revenue: /doanh thu|revenue/.test(lo),
    profit: /lợi nhuận|profit|eps|lãi/.test(lo),
    cashFlow: /dòng tiền|cash flow|thanh khoản/.test(lo),
    growth: /tăng trưởng|growth|mở rộng|expand/.test(lo),
  };

  // symbols from title + existing symbols
  const extracted = extractTickersFromText(text);
  const affectedSymbols = [...new Set([...n.symbols, ...extracted])];

  return {
    signalType,
    sentiment,
    impact,
    financialImpact,
    affectedSymbols,
    scope: affectedSymbols.length > 2 ? "SECTOR" : "COMPANY",
    surprise: "UNKNOWN",
    cascadeSymbols: [],
    isBreaking: n.category === "breaking" || signalType === "ma",
  };
}

function fallbackSummary(items: NewsItem[]): NewsSummaryResponse {
  const allItems: AiNewsItem[] = items.map((n) => {
    const classified = classifyItem(n);
    return {
      id: n.id,
      title: n.title,
      source: n.source,
      publishedAt: n.publishedAt,
      link: n.link,
      aiSummary: n.summary && n.summary !== n.title ? n.summary : n.title,
      category: n.category,
      impact: classified.impact ?? "LOW",
      sentiment: classified.sentiment ?? "Neutral",
      affectedSymbols: classified.affectedSymbols ?? n.symbols,
      isBreaking: classified.isBreaking ?? false,
      signalType: classified.signalType ?? "noise",
      scope: classified.scope ?? "COMPANY",
      financialImpact: classified.financialImpact ?? { revenue: false, profit: false, cashFlow: false, growth: false },
      surprise: "UNKNOWN",
      cascadeSymbols: [],
    };
  });

  const bullCount = allItems.filter((i) => i.sentiment === "Bullish").length;
  const bearCount = allItems.filter((i) => i.sentiment === "Bearish").length;
  const mood: NewsSummaryResponse["marketMood"] =
    bullCount > bearCount + 1 ? "Bullish" : bearCount > bullCount + 1 ? "Bearish" : "Neutral";

  const highCount = allItems.filter((i) => i.impact === "HIGH").length;
  const moodSummary = `${items.length} news items · ${highCount} high-impact · ${bullCount} bullish / ${bearCount} bearish signals detected (keyword analysis — upgrade to LLM for deeper insights).`;

  return {
    generatedAt: new Date().toISOString(),
    provider: "rule-based",
    isRuleBased: true,
    marketMood: mood,
    moodSummary,
    hotItems: allItems.filter((i) => i.impact === "HIGH" || i.isBreaking).slice(0, 5),
    allItems,
    sectorTrends: [],
    stockMovers: [],
  };
}

// ─── In-memory cache (30 min) ─────────────────────────────────────────────────

let summaryCache: { data: NewsSummaryResponse; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000;

// ─── route ───────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let forceRefresh = searchParams.get("refresh") === "true";

  // `refresh=true` bypasses the shared 30-min cache and always triggers a
  // real LLM call — gate it behind auth so an anonymous caller can't hammer
  // this endpoint to burn through the shared LLM provider quota. Reads of
  // the (possibly stale) cache stay public.
  if (forceRefresh) {
    const session = await auth();
    if (!session?.user?.id) forceRefresh = false;
  }

  if (!forceRefresh && summaryCache && Date.now() < summaryCache.expiresAt) {
    return NextResponse.json(summaryCache.data);
  }

  const rawNews = await getNewsLive();
  // Keep to 20 items — 30+ items push Groq free-tier over the 12k TPM input limit
  const recentNews = deduplicateNews(rawNews).slice(0, 20);

  if (!recentNews.length) {
    return NextResponse.json(fallbackSummary([]));
  }

  const context = buildNewsContext(recentNews);

  const llmResult = await callLlm(
    [
      { role: "system", content: NEWS_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Apply the 7-type professional framework to analyze these ${recentNews.length} Vietnam stock market news items. Return JSON only:\n\n${context}`,
      },
    ],
    "",  // context injected via user message above; don't double-inject
    { maxTokens: 3500 },  // 20 items × ~150 tokens/item = ~3k max response
  );

  if (!llmResult.content || llmResult.provider === "fallback") {
    const fb = fallbackSummary(recentNews);
    summaryCache = { data: fb, expiresAt: Date.now() + CACHE_TTL_MS };
    return NextResponse.json(fb);
  }

  try {
    const raw = llmResult.content
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    const parsed = JSON.parse(raw) as {
      marketMood?: string;
      moodSummary?: string;
      sectorTrends?: SectorTrend[];
      stockMovers?: StockMover[];
      items?: Array<{
        id: string;
        aiSummary?: string;
        signalType?: string;
        impact?: string;
        sentiment?: string;
        surprise?: string;
        scope?: string;
        financialImpact?: Partial<FinancialImpact>;
        affectedSymbols?: string[];
        cascadeSymbols?: string[];
        isBreaking?: boolean;
      }>;
    };

    const itemMap = new Map(
      (parsed.items ?? []).map((i) => [i.id, i]),
    );

    const allItems: AiNewsItem[] = recentNews.map((n) => {
      const ai = itemMap.get(n.id);
      const fi = ai?.financialImpact ?? {};
      return {
        id: n.id,
        title: n.title,
        source: n.source,
        publishedAt: n.publishedAt,
        link: n.link,
        aiSummary: ai?.aiSummary ?? n.summary ?? n.title,
        impact: (ai?.impact ?? "LOW") as AiNewsItem["impact"],
        sentiment: (ai?.sentiment ?? "Neutral") as AiNewsItem["sentiment"],
        affectedSymbols: ai?.affectedSymbols ?? n.symbols,
        category: n.category,
        isBreaking: ai?.isBreaking ?? n.category === "breaking",
        signalType: (ai?.signalType ?? "noise") as NewsSignalType,
        scope: (ai?.scope ?? "COMPANY") as NewsScope,
        financialImpact: {
          revenue: fi.revenue ?? false,
          profit: fi.profit ?? false,
          cashFlow: fi.cashFlow ?? false,
          growth: fi.growth ?? false,
        },
        surprise: (ai?.surprise ?? "UNKNOWN") as EarningsSurprise,
        cascadeSymbols: ai?.cascadeSymbols ?? [],
      };
    });

    const result: NewsSummaryResponse = {
      generatedAt: new Date().toISOString(),
      provider: llmResult.provider,
      isRuleBased: false,
      marketMood: (parsed.marketMood ?? "Neutral") as NewsSummaryResponse["marketMood"],
      moodSummary: parsed.moodSummary ?? "",
      hotItems: allItems.filter((i) => i.impact === "HIGH" || i.isBreaking).slice(0, 5),
      allItems,
      sectorTrends: parsed.sectorTrends ?? [],
      stockMovers: parsed.stockMovers ?? [],
    };

    summaryCache = { data: result, expiresAt: Date.now() + CACHE_TTL_MS };
    return NextResponse.json(result);
  } catch {
    const fb = fallbackSummary(recentNews);
    summaryCache = { data: fb, expiresAt: Date.now() + CACHE_TTL_MS };
    return NextResponse.json(fb);
  }
}
