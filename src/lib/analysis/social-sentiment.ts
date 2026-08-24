import { fetchStocktwitsMessages, type StocktwitsMessage } from "@/lib/providers/stocktwits";

/**
 * AI News Reading & Sentiment Analysis — Social sentiment (Stocktwits only, see provider doc comment).
 *
 * Hard constraints from spec, enforced here:
 * - Never report a bullish/bearish % without the sample size next to it
 *   (`sample_size_note` is mandatory, not optional).
 * - Buzz spikes are reported as a neutral number — no color/direction
 *   judgment is computed or attached here; that's a UI concern and even
 *   there it must stay neutral (a spike can be a catalyst or a scandal).
 * - Below `MIN_RELIABLE_SAMPLE` tagged posts, `insufficientData` is set —
 *   the numbers are still returned (transparency), but callers must not
 *   present them as a clean signal.
 */

const MIN_RELIABLE_SAMPLE = 20;
/** Copy-paste spam + one prolific poster dominating the tally. */
const MAX_MESSAGES_PER_USER = 3;
/** Account younger than this relative to the post is a soft bot signal — excluded from the sentiment tally, not from post_volume. */
const MIN_ACCOUNT_AGE_MS = 2 * 24 * 60 * 60 * 1000;

const STOPWORDS = new Set([
  "the", "and", "for", "with", "this", "that", "from", "have", "will", "just", "your", "about",
  "into", "over", "than", "then", "they", "them", "what", "when", "where", "been", "would",
  "could", "should", "there", "still", "some", "more", "very", "much", "also", "like", "going",
]);

export type SocialSentimentSnapshot = {
  ticker: string;
  window: "24h";
  source: "stocktwits";
  bullish_pct: number | null;
  bearish_pct: number | null;
  post_volume: number;
  buzz_change_pct: number | null;
  top_keywords: string[];
  sample_size_note: string;
  insufficient_data: boolean;
  filtered_out_count: number;
  methodology_note: string;
};

function normalizeBody(body: string): string {
  return body.trim().toLowerCase().replace(/https?:\S+/g, "").replace(/\s+/g, " ");
}

/** Copy-paste spam dedup + per-user cap + newborn-account soft filter. Returns survivors + how many were dropped. */
function filterBotAndSpam(messages: StocktwitsMessage[]): { kept: StocktwitsMessage[]; filteredOutCount: number } {
  const seenBodies = new Set<string>();
  const perUserCount = new Map<number, number>();
  const kept: StocktwitsMessage[] = [];

  for (const m of messages) {
    const norm = normalizeBody(m.body);
    if (norm.length > 10 && seenBodies.has(norm)) continue; // exact/near-duplicate copy-paste
    const userCount = perUserCount.get(m.userId) ?? 0;
    if (userCount >= MAX_MESSAGES_PER_USER) continue; // one account flooding the tally

    if (m.userJoinedAt) {
      const age = new Date(m.createdAt).getTime() - new Date(m.userJoinedAt).getTime();
      if (age >= 0 && age < MIN_ACCOUNT_AGE_MS) continue; // brand-new account posting immediately
    }

    seenBodies.add(norm);
    perUserCount.set(m.userId, userCount + 1);
    kept.push(m);
  }

  return { kept, filteredOutCount: messages.length - kept.length };
}

function extractTopKeywords(messages: StocktwitsMessage[], limit = 5): string[] {
  const counts = new Map<string, number>();
  for (const m of messages) {
    const words = normalizeBody(m.body).replace(/[^a-z0-9À-ỹ\s]/gi, " ").split(/\s+/);
    for (const w of words) {
      if (w.length < 4 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

/** Best-effort buzz comparison — see module doc comment for why this is NOT a true 7-day baseline. */
function estimateBuzzChange(messages: StocktwitsMessage[]): { pct: number | null; note: string } {
  if (messages.length < 5) {
    return { pct: null, note: "Too few retrievable messages to estimate a baseline." };
  }
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const timestamps = messages.map((m) => new Date(m.createdAt).getTime());
  const oldest = Math.min(...timestamps);
  const spanMs = now - oldest;

  if (spanMs < oneDayMs) {
    return { pct: null, note: "Retrieved message history spans under 24h — no prior period to compare against." };
  }

  const last24h = timestamps.filter((t) => now - t < oneDayMs).length;
  const priorCount = timestamps.length - last24h;
  const priorDays = Math.max((spanMs - oneDayMs) / oneDayMs, 1 / 24);
  const priorDailyAvg = priorCount / priorDays;

  if (priorDailyAvg <= 0) {
    return { pct: null, note: "No prior-period posts retrievable to compare against." };
  }

  const pct = Math.round(((last24h - priorDailyAvg) / priorDailyAvg) * 100);
  return {
    pct,
    note: `Approximate — based on ${Math.round(spanMs / oneDayMs)}d of retrievable public history, not a true trailing 7-day average (the public API doesn't expose that range without auth).`,
  };
}

export async function fetchSocialSentiment(symbol: string): Promise<SocialSentimentSnapshot | null> {
  const raw = await fetchStocktwitsMessages(symbol);
  if (raw === null) return null; // fetch failed — caller must show "unavailable", not zero

  if (raw.length === 0) {
    return {
      ticker: symbol.toUpperCase(),
      window: "24h",
      source: "stocktwits",
      bullish_pct: null,
      bearish_pct: null,
      post_volume: 0,
      buzz_change_pct: null,
      top_keywords: [],
      sample_size_note: "0 posts found on Stocktwits for this ticker — VN stocks have little to no coverage on US-centric social platforms.",
      insufficient_data: true,
      filtered_out_count: 0,
      methodology_note: "Stocktwits only; no Reddit/X integration (see module doc comment).",
    };
  }

  const { kept, filteredOutCount } = filterBotAndSpam(raw);
  const tagged = kept.filter((m) => m.sentiment != null);
  const bullish = tagged.filter((m) => m.sentiment === "Bullish").length;

  const bullishPct = tagged.length > 0 ? Math.round((bullish / tagged.length) * 100) : null;
  const bearishPct = tagged.length > 0 ? 100 - (bullishPct ?? 0) : null;
  const insufficient = tagged.length < MIN_RELIABLE_SAMPLE;

  const buzz = estimateBuzzChange(kept);

  return {
    ticker: symbol.toUpperCase(),
    window: "24h",
    source: "stocktwits",
    bullish_pct: bullishPct,
    bearish_pct: bearishPct,
    post_volume: kept.length,
    buzz_change_pct: buzz.pct,
    top_keywords: extractTopKeywords(kept),
    sample_size_note: tagged.length > 0
      ? `Based on ${tagged.length} sentiment-tagged post(s) out of ${kept.length} retrieved (${filteredOutCount} filtered as likely bot/spam/duplicate).${insufficient ? " Sample is small — treat this % as low-confidence." : ""}`
      : `${kept.length} post(s) retrieved but none carried an explicit bullish/bearish tag — no sentiment % available.`,
    insufficient_data: insufficient,
    filtered_out_count: filteredOutCount,
    methodology_note: buzz.note,
  };
}
