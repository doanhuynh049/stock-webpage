/** Common English words that match ticker pattern but are not symbols. */
const TICKER_STOP_WORDS = new Set([
  "AI",
  "ALL",
  "AND",
  "ANY",
  "ARE",
  "ASK",
  "BAD",
  "BEST",
  "BUY",
  "CAN",
  "COMPARE",
  "DATA",
  "DAY",
  "FIND",
  "FOR",
  "FROM",
  "GET",
  "GOOD",
  "HAS",
  "HAVE",
  "HOLD",
  "HOW",
  "ITS",
  "LIVE",
  "LOW",
  "MARKET",
  "MORE",
  "NEW",
  "NOT",
  "NOW",
  "OUT",
  "PB",
  "PE",
  "ROE",
  "RSI",
  "SELL",
  "SHOULD",
  "STOCK",
  "THAT",
  "THE",
  "THIS",
  "TODAY",
  "TOP",
  "VND",
  "VS",
  "WHAT",
  "WHEN",
  "WHERE",
  "WHICH",
  "WHY",
  "WILL",
  "WITH",
  "YOU",
  "ANALYZE",
  "WOULD",
  "WERE",
  "BEEN",
  "ABOUT",
  "YES",
  "NO",
]);

/**
 * Pull likely VN tickers from free text.
 * Handles both regular stocks (2–5 uppercase letters) and Vietnamese ETF codes:
 *   - FUE…  (e.g. FUEMAV30, FUEVFVND, FUEKIV30 — 7–9 chars)
 *   - E1VF… (e.g. E1VFVN30 — 8 chars)
 */
export function extractTickersFromQuestion(question: string): string[] {
  const upper = question.toUpperCase();

  // ETF patterns must be checked first (before the 2–5 char pass strips the prefix letters)
  const etfMatches =
    upper.match(/\b(?:FUE[A-Z0-9]{2,6}|E1VF[A-Z0-9]{2,5})\b/g) ?? [];

  // Regular VN stock tickers: 2–5 uppercase letters
  const stockMatches = upper.match(/\b[A-Z]{2,5}\b/g) ?? [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of [...etfMatches, ...stockMatches]) {
    if (TICKER_STOP_WORDS.has(m) || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
}

const FOLLOW_UP_RE =
  /\b(it|this|that|them|the stock|same stock|that one|this one|above|previous)\b/i;

export function isFollowUpQuestion(question: string): boolean {
  return FOLLOW_UP_RE.test(question);
}

/** Last ticker mentioned in conversation text (for follow-ups like "should I buy it?"). */
export function extractLastMentionedSymbol(text: string): string | null {
  // Matches both regular symbols and long ETF codes (FUE… / E1VF…)
  const sectionMatches = [...text.matchAll(/---\s+([A-Z][A-Z0-9]{1,8})\s+\(/g)];
  if (sectionMatches.length) {
    return sectionMatches[sectionMatches.length - 1][1];
  }

  const boldMatches = [...text.matchAll(/\*\*([A-Z][A-Z0-9]{1,8})\*\*/g)];
  for (let i = boldMatches.length - 1; i >= 0; i--) {
    const sym = boldMatches[i][1];
    if (!TICKER_STOP_WORDS.has(sym)) return sym;
  }

  const tickers = extractTickersFromQuestion(text);
  return tickers.length ? tickers[tickers.length - 1] : null;
}
