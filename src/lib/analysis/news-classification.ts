import type { NewsItem } from "@/types/stock";
import { callLlm, type LlmApiKeys } from "@/lib/providers/llm";

/**
 * AI News Reading & Sentiment Analysis — Step 2 (per-article classification).
 *
 * Hard constraints from spec, enforced structurally:
 * - `ticker` / `headline` / `source` / `timestamp` / `link` are ALWAYS copied
 *   from the real, already-fetched `NewsItem` — never from the LLM's output.
 *   The LLM is only ever asked for category/sentiment/time_horizon/
 *   confidence/reasoning about an item we already retrieved; it has no
 *   channel to invent a headline or source.
 * - `reasoning` must be non-empty and is validated; an empty/missing one
 *   falls back to a deterministic rule-based reason, never left blank.
 * - `overall_summary` is scrubbed for buy/sell/mua/bán language — sentiment
 *   analysis must never become a trading signal (see also `news-sentiment.ts`).
 */

export type NewsCategory = "partnership" | "earnings" | "regulatory" | "management" | "macro" | "analyst_rating" | "other";
export type NewsSentiment = "positive" | "negative" | "neutral";
export type TimeHorizon = "short_term" | "long_term";
export type TrustTier = "tier1_global" | "vn_official" | "general";

export type NewsClassification = {
  ticker: string;
  headline: string;
  source: string;
  timestamp: string;
  link?: string;
  trust_tier: TrustTier;
  category: NewsCategory;
  sentiment: NewsSentiment;
  time_horizon: TimeHorizon;
  confidence: number;
  reasoning: string;
};

const CATEGORIES: NewsCategory[] = ["partnership", "earnings", "regulatory", "management", "macro", "analyst_rating", "other"];
const SENTIMENTS: NewsSentiment[] = ["positive", "negative", "neutral"];
const HORIZONS: TimeHorizon[] = ["short_term", "long_term"];

const DIRECTIVE_LANGUAGE = /\b(buy|sell|mua ngay|bán ngay|nên mua|nên bán|strong buy|strong sell)\b/i;

/**
 * Tier-1 global (Reuters/Bloomberg/AP/etc.) is inferred from Google News'
 * publisher attribution — this app has no direct Reuters/Bloomberg/EDGAR
 * API access (paid, or not applicable: VN-listed companies don't file
 * with SEC EDGAR). "vn_official" = CafeF/VnExpress, the two VN financial
 * outlets already wired into `news-service.ts`.
 */
const TIER1_PUBLISHERS = /reuters|bloomberg|associated press|\bap\b|nikkei|financial times|\bwsj\b|wall street journal/i;

export function inferTrustTier(item: NewsItem): TrustTier {
  if (/^(cafef|vnexpress)/i.test(item.source)) return "vn_official";
  if (TIER1_PUBLISHERS.test(item.source)) return "tier1_global";
  return "general";
}

// ─── rule-based fallback (no LLM available) ──────────────────────────────────

const CATEGORY_PATTERNS: Array<{ category: NewsCategory; pattern: RegExp }> = [
  { category: "regulatory", pattern: /thanh tra|xử phạt|vi phạm|ủy ban chứng khoán|quy định mới|regulat|fined?\b|penalt|investigation|probe/i },
  { category: "management", pattern: /chủ tịch|tổng giám đốc|\bceo\b|từ nhiệm|bổ nhiệm|miễn nhiệm|resign|appoint(s|ed|ment)?|steps? down/i },
  { category: "analyst_rating", pattern: /khuyến nghị|mục tiêu giá|giá mục tiêu|target price|price target|upgrade(d|s)?|downgrade(d|s)?|analyst rating/i },
  { category: "earnings", pattern: /lợi nhuận|doanh thu|kết quả kinh doanh|báo cáo tài chính|earnings|quarterly (profit|results|revenue)/i },
  { category: "partnership", pattern: /hợp tác|ký kết|liên doanh|đối tác chiến lược|partnership|joint venture|signs? (a )?(deal|contract|agreement)/i },
  { category: "macro", pattern: /lãi suất|ngân hàng nhà nước|lạm phát|\bgdp\b|\bfed\b|interest rate|inflation|macro(economic)?/i },
];

const POSITIVE_PATTERN = /tăng trưởng mạnh|vượt kỳ vọng|lãi lớn|mở rộng|ký hợp đồng lớn|surg(e|ing)|beats? expectations|record profit|expansion|upgrade(d|s)?|raises? (guidance|target)|capacity expansion/i;
const NEGATIVE_PATTERN = /giảm mạnh|thua lỗ|cắt giảm|hạ mục tiêu|vi phạm|xử phạt|sa thải|miss(es)? expectations|cuts? (guidance|target)|downgrade(d|s)?|lawsuit|target price cut/i;

const LONG_TERM_PATTERN = /chiến lược dài hạn|kế hoạch 5 năm|long-term|multi-year|capacity expansion|nhà máy mới|expansion plan/i;

function ruleBasedClassify(item: NewsItem): Omit<NewsClassification, "ticker" | "headline" | "source" | "timestamp" | "link" | "trust_tier"> {
  const text = `${item.title} ${item.summary}`;
  const category = CATEGORY_PATTERNS.find((c) => c.pattern.test(text))?.category ?? "other";

  let sentiment: NewsSentiment = "neutral";
  if (POSITIVE_PATTERN.test(text) && !NEGATIVE_PATTERN.test(text)) sentiment = "positive";
  else if (NEGATIVE_PATTERN.test(text) && !POSITIVE_PATTERN.test(text)) sentiment = "negative";

  const time_horizon: TimeHorizon =
    LONG_TERM_PATTERN.test(text) || category === "partnership" || category === "macro" ? "long_term" : "short_term";

  return {
    category,
    sentiment,
    time_horizon,
    confidence: 0.35, // deliberately low — keyword matching, not real comprehension
    reasoning: "Rule-based keyword match (LLM unavailable) — verify against the full article before acting on this.",
  };
}

// ─── LLM path ─────────────────────────────────────────────────────────────────

type LlmClassificationItem = {
  index: number;
  category?: string;
  sentiment?: string;
  time_horizon?: string;
  confidence?: number;
  reasoning?: string;
};

function buildSystemInstruction(): string {
  return `You are a financial news classifier for Vietnamese-market stocks. You receive a numbered list of REAL, already-retrieved news items (headline + summary + source). Classify EACH item.

HARD RULES:
- Base your classification only on the text given — never invent facts, never assume information the text doesn't state.
- Do not extrapolate beyond what the article states (e.g. don't call something "long_term" impact unless the text itself implies duration/scale).
- category must be exactly one of: ${CATEGORIES.join(", ")}.
- sentiment must be exactly one of: ${SENTIMENTS.join(", ")}.
- time_horizon must be exactly one of: ${HORIZONS.join(", ")}. Example patterns: "target price cut" → negative/short_term; "capacity expansion" / new long-term contract → positive/long_term.
- confidence: 0.0–1.0, reflecting how clearly the text supports your call — use low confidence for vague or ambiguous headlines, do not default to a high number.
- reasoning: one short phrase (≤20 words) that cites something concrete from the given text — not a generic statement.
- Never write "buy", "sell", or any trading recommendation anywhere in your output — you are classifying tone, not giving trading advice.

Return ONLY valid JSON (no markdown fences):
{"items": [{"index": 0, "category": "...", "sentiment": "...", "time_horizon": "...", "confidence": 0.0, "reasoning": "..."}], "overall_summary": "one sentence describing the net tone across all items, no trading language"}`;
}

function clampConfidence(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0.3;
  return Math.max(0, Math.min(1, n));
}

/**
 * Classifies up to `items.length` news items for `symbol` in a single LLM
 * call (token-conscious, same pattern as /api/news/summary). Falls back to
 * per-item rule-based classification for any item the LLM didn't return a
 * valid entry for, or entirely when the LLM is unavailable.
 */
export async function classifyNewsItems(
  symbol: string,
  items: NewsItem[],
  opts?: { apiKeys?: LlmApiKeys },
): Promise<{ items: NewsClassification[]; overallSummary: string; provider: string }> {
  const sym = symbol.toUpperCase();
  if (!items.length) {
    return { items: [], overallSummary: "No recent news retrieved for this ticker.", provider: "rule-based" };
  }

  const ruleFallback = () => ({
    items: items.map((item) => ({
      ticker: sym,
      headline: item.title,
      source: item.source,
      timestamp: item.publishedAt,
      link: item.link,
      trust_tier: inferTrustTier(item),
      ...ruleBasedClassify(item),
    })),
    overallSummary: buildRuleBasedSummary(items),
    provider: "rule-based",
  });

  const userLines = items
    .map((item, i) => `${i}. [${inferTrustTier(item)}] (${item.source}, ${item.publishedAt.slice(0, 10)}) ${item.title} — ${item.summary}`)
    .join("\n");

  let llmResult;
  try {
    llmResult = await callLlm(
      [
        { role: "system", content: buildSystemInstruction() },
        { role: "user", content: `Ticker: ${sym}\n\n${userLines}\n\nReturn the JSON now.` },
      ],
      "",
      { maxTokens: Math.min(3000, 300 + items.length * 120), apiKeys: opts?.apiKeys },
    );
  } catch {
    return ruleFallback();
  }

  if (!llmResult.content || llmResult.provider === "fallback") return ruleFallback();

  let parsed: { items?: LlmClassificationItem[]; overall_summary?: string };
  try {
    const raw = llmResult.content
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    parsed = JSON.parse(raw);
  } catch {
    return ruleFallback();
  }

  const byIndex = new Map((parsed.items ?? []).map((it) => [it.index, it]));
  const classified: NewsClassification[] = items.map((item, i) => {
    const llmItem = byIndex.get(i);
    const fallback = ruleBasedClassify(item);
    const category = CATEGORIES.includes(llmItem?.category as NewsCategory) ? (llmItem!.category as NewsCategory) : fallback.category;
    const sentiment = SENTIMENTS.includes(llmItem?.sentiment as NewsSentiment) ? (llmItem!.sentiment as NewsSentiment) : fallback.sentiment;
    const time_horizon = HORIZONS.includes(llmItem?.time_horizon as TimeHorizon) ? (llmItem!.time_horizon as TimeHorizon) : fallback.time_horizon;
    const reasoning = llmItem?.reasoning?.trim() && !DIRECTIVE_LANGUAGE.test(llmItem.reasoning) ? llmItem.reasoning.trim() : fallback.reasoning;
    const confidence = llmItem ? clampConfidence(llmItem.confidence) : fallback.confidence;

    return {
      ticker: sym,
      headline: item.title,
      source: item.source,
      timestamp: item.publishedAt,
      link: item.link,
      trust_tier: inferTrustTier(item),
      category,
      sentiment,
      time_horizon,
      confidence,
      reasoning,
    };
  });

  const overallSummary =
    parsed.overall_summary && !DIRECTIVE_LANGUAGE.test(parsed.overall_summary)
      ? parsed.overall_summary.trim()
      : buildRuleBasedSummary(items, classified);

  return { items: classified, overallSummary, provider: llmResult.provider };
}

function buildRuleBasedSummary(items: NewsItem[], classified?: NewsClassification[]): string {
  const rows = classified ?? items.map((item) => ({ ...ruleBasedClassify(item), trust_tier: inferTrustTier(item) }));
  const weight = (t: TrustTier) => (t === "tier1_global" || t === "vn_official" ? 2 : 1);
  let score = 0;
  for (const r of rows) {
    if (r.sentiment === "positive") score += weight(r.trust_tier);
    if (r.sentiment === "negative") score -= weight(r.trust_tier);
  }
  const tone = score > 0 ? "net positive" : score < 0 ? "net negative" : "mixed/neutral";
  return `News tone is ${tone} across ${items.length} recent article(s) (trust-weighted).`;
}
