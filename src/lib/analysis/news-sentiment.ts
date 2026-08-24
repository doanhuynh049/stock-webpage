import { getNewsLive } from "@/lib/news-service";
import { classifyNewsItems, type NewsClassification } from "@/lib/analysis/news-classification";
import { fetchSocialSentiment, type SocialSentimentSnapshot } from "@/lib/analysis/social-sentiment";
import type { LlmApiKeys } from "@/lib/providers/llm";

/**
 * AI News Reading & Sentiment Analysis — aggregation (Step 4 of the spec's pipeline).
 *
 * AI's job here is reading/classifying volume, not predicting price. Hard
 * constraints enforced at this layer:
 * - `disclaimer` is attached to the report object itself (not just shown
 *   once in some UI shell) — every caller of this function gets it inline.
 * - Conflicting news vs. social signals are surfaced as an explicit
 *   `conflicts[]` list, never quietly averaged into one number.
 * - No blended "score." Tier-1/VN-official news outweighs social sentiment
 *   in the *summary* and *conflict framing* (see news-classification.ts's
 *   trust-weighted `buildRuleBasedSummary`), never by computing a single
 *   directional number.
 */

export const SENTIMENT_DISCLAIMER =
  "Sentiment reflects public discussion and news tone. It is not a buy/sell signal and should not be used in isolation.";

export type NewsSentimentReport = {
  ticker: string;
  generatedAt: string;
  news_sentiment_summary: string;
  news_items: NewsClassification[];
  social_sentiment: SocialSentimentSnapshot | null;
  conflicts: string[];
  disclaimer: string;
  provider: string;
};

export type Stance = "positive" | "negative" | "neutral";

/**
 * News side of the "conflict" check — trust-weighted, majority-of-net-sentiment,
 * not a numeric score. Exported so `news-sentiment-portfolio.ts` can attach a
 * display-only stance per row server-side — client components must never
 * import this module as a value (it pulls in `getNewsLive`'s `fs` import);
 * only `import type` the report shapes, or read a plain string field like
 * this that a server module already computed.
 */
export function newsStance(items: NewsClassification[]): Stance {
  const weight = (t: NewsClassification["trust_tier"]) => (t === "general" ? 1 : 2);
  let score = 0;
  for (const it of items) {
    if (it.sentiment === "positive") score += weight(it.trust_tier);
    if (it.sentiment === "negative") score -= weight(it.trust_tier);
  }
  if (score > 0) return "positive";
  if (score < 0) return "negative";
  return "neutral";
}

export function socialStance(social: SocialSentimentSnapshot): Stance | null {
  if (social.insufficient_data || social.bullish_pct == null || social.bearish_pct == null) return null;
  const diff = social.bullish_pct - social.bearish_pct;
  if (diff > 10) return "positive";
  if (diff < -10) return "negative";
  return "neutral";
}

function detectConflicts(items: NewsClassification[], social: SocialSentimentSnapshot | null): string[] {
  const conflicts: string[] = [];
  if (!items.length || !social) return conflicts;

  const news = newsStance(items);
  const socialTone = socialStance(social);
  if (socialTone && news !== "neutral" && socialTone !== "neutral" && news !== socialTone) {
    conflicts.push(
      `News tone is net ${news} while social sentiment leans ${socialTone} (${social.bullish_pct}% bullish / ${social.bearish_pct}% bearish, ${social.post_volume} posts) — these are two separate signals, not netted together. Tier-1/official news should weigh more heavily than social buzz when they disagree.`,
    );
  }

  const buzz = social.buzz_change_pct;
  if (buzz != null && Math.abs(buzz) >= 100) {
    conflicts.push(
      `Social buzz changed ${buzz > 0 ? "+" : ""}${buzz}% vs. its recent baseline — this is reported neutrally: a spike this size can reflect a genuine catalyst OR a scandal/controversy. Check the news items above for what's actually driving it before drawing a conclusion.`,
    );
  }

  return conflicts;
}

export async function buildNewsSentimentReport(
  symbol: string,
  opts?: { apiKeys?: LlmApiKeys },
): Promise<NewsSentimentReport> {
  const sym = symbol.toUpperCase();

  const [rawNews, social] = await Promise.all([
    getNewsLive(sym),
    fetchSocialSentiment(sym).catch(() => null),
  ]);

  const recentNews = rawNews.slice(0, 15);
  const { items, overallSummary, provider } = await classifyNewsItems(sym, recentNews, opts);

  return {
    ticker: sym,
    generatedAt: new Date().toISOString(),
    news_sentiment_summary: overallSummary,
    news_items: items,
    social_sentiment: social,
    conflicts: detectConflicts(items, social),
    disclaimer: SENTIMENT_DISCLAIMER,
    provider,
  };
}
