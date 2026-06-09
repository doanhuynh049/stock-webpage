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

/** Pull likely VN tickers (2–5 uppercase letters) from free text. */
export function extractTickersFromQuestion(question: string): string[] {
  const matches = question.toUpperCase().match(/\b[A-Z]{2,5}\b/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
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
  const sectionMatches = [...text.matchAll(/---\s+([A-Z0-9]{2,5})\s+\(/g)];
  if (sectionMatches.length) {
    return sectionMatches[sectionMatches.length - 1][1];
  }

  const boldMatches = [...text.matchAll(/\*\*([A-Z0-9]{2,5})\*\*/g)];
  for (let i = boldMatches.length - 1; i >= 0; i--) {
    const sym = boldMatches[i][1];
    if (!TICKER_STOP_WORDS.has(sym)) return sym;
  }

  const tickers = extractTickersFromQuestion(text);
  return tickers.length ? tickers[tickers.length - 1] : null;
}
