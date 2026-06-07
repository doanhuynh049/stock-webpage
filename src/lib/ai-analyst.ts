import { getAllStocks, getStock } from "@/lib/market-service";
import type { Stock } from "@/types/stock";

function extractSymbol(question: string, stocks: Stock[]): string | null {
  const upper = question.toUpperCase();
  for (const stock of stocks) {
    if (upper.includes(stock.symbol)) return stock.symbol;
    if (upper.includes(stock.name.toUpperCase())) return stock.symbol;
  }
  const match = upper.match(/\b([A-Z]{2,5})\b/);
  if (match) {
    const candidate = match[1];
    const found = stocks.find((s) => s.symbol === candidate);
    if (found) return candidate;
  }
  return null;
}

function buildStockAnalysis(stock: Stock): string {
  const strengths: string[] = [];
  const risks: string[] = [];

  if (stock.revenueGrowth >= 15)
    strengths.push(`Revenue growth ${stock.revenueGrowth}% YoY`);
  if (stock.roe >= 15) strengths.push(`Strong ROE at ${stock.roe}%`);
  if (stock.dividendYield >= 3)
    strengths.push(`Attractive dividend yield ${stock.dividendYield}%`);
  if (stock.changePercent > 0)
    strengths.push(`Positive momentum today (+${stock.changePercent}%)`);
  if (stock.analystRating === "Buy" || stock.analystRating === "Strong Buy")
    strengths.push(`Analyst rating: ${stock.analystRating}`);

  if (stock.pe > 18 && stock.pe > 0)
    risks.push(`Valuation above industry average (PE ${stock.pe})`);
  if (stock.rsi > 70) risks.push(`RSI overbought at ${stock.rsi}`);
  if (stock.rsi < 30)
    risks.push(`RSI oversold at ${stock.rsi} — potential value or weakness`);
  if (stock.roe < 10) risks.push(`Below-average ROE at ${stock.roe}%`);
  if (stock.revenueGrowth < 8)
    risks.push(`Slowing revenue growth at ${stock.revenueGrowth}%`);

  if (strengths.length === 0)
    strengths.push("Established market position in Vietnam");
  if (risks.length === 0) risks.push("General market volatility risk");

  const conclusion =
    strengths.length > risks.length + 1
      ? "Moderately bullish"
      : risks.length > strengths.length + 1
        ? "Cautious — consider waiting"
        : "Neutral — hold or accumulate on dips";

  return `**${stock.name} (${stock.symbol})** — ${stock.price.toLocaleString()} ₫ (${stock.changePercent > 0 ? "+" : ""}${stock.changePercent}%)

**Strengths:**
${strengths.map((s) => `- ${s}`).join("\n")}

**Risks:**
${risks.map((r) => `- ${r}`).join("\n")}

**Conclusion:** ${conclusion}

*Target: ${stock.analystTarget.toLocaleString()} ₫ | Sector: ${stock.sector} | Source: Entrade/Yahoo live data*`;
}

export async function analyzeQuestion(question: string): Promise<string> {
  const lower = question.toLowerCase();
  const stocks = await getAllStocks();

  if (
    lower.includes("market") ||
    lower.includes("vnindex") ||
    lower.includes("today")
  ) {
    const { getMarketSnapshot } = await import("@/lib/market-service");
    const market = await getMarketSnapshot();
    const vn = market.indices.find((i) => i.symbol === "VNINDEX");
    const gainers = [...stocks]
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 3);

    return `**Vietnam Market Overview** (live data)

VNINDEX: **${vn?.value.toLocaleString() ?? "N/A"}** (${vn && vn.changePercent > 0 ? "+" : ""}${vn?.changePercent ?? 0}%)
Sentiment: **${market.sentiment}** (${market.sentimentScore}%)

**Stats:** Volume ${(market.stats.totalVolume / 1e6).toFixed(0)}M shares · ${market.stats.advancing} advancing / ${market.stats.declining} declining

**Top gainers:** ${gainers.map((s) => `${s.symbol} (+${s.changePercent}%)`).join(", ")}

*Updated: ${market.lastUpdated}*`;
  }

  if (lower.includes("compare") || lower.includes(" vs ")) {
    const symbols = stocks
      .map((s) => s.symbol)
      .filter((sym) => question.toUpperCase().includes(sym));
    if (symbols.length >= 2) {
      const a = await getStock(symbols[0]);
      const b = await getStock(symbols[1]);
      if (a && b) {
        return `**${a.symbol} vs ${b.symbol}** (live prices)

| Metric | ${a.symbol} | ${b.symbol} |
|--------|-----------|-----------|
| Price | ${a.price.toLocaleString()} ₫ | ${b.price.toLocaleString()} ₫ |
| PE | ${a.pe || "N/A"} | ${b.pe || "N/A"} |
| ROE | ${a.roe}% | ${b.roe}% |
| Growth | ${a.revenueGrowth}% | ${b.revenueGrowth}% |
| RSI | ${a.rsi} | ${b.rsi} |

**Verdict:** ${a.roe > b.roe ? a.symbol : b.symbol} has stronger profitability.`;
      }
    }
  }

  if (
    lower.includes("screener") ||
    lower.includes("find stock") ||
    lower.includes("opportunit") ||
    lower.includes("undervalued") ||
    lower.includes("invest") ||
    lower.includes("recommend") ||
    lower.includes("good to buy")
  ) {
    const { getStockPicks } = await import("@/lib/stock-picks");
    const { picks, marketSentiment, criteria } = await getStockPicks(5);

    if (!picks.length) {
      return `No strong picks matched our screen in the current ${marketSentiment} market. Try the [Stock Screener](/screener) with relaxed filters.`;
    }

    const list = picks
      .map(
        (p) =>
          `- **${p.stock.symbol}** (${p.horizon === "short" ? "1–3 mo" : "3–12 mo"}) — ${p.stock.price.toLocaleString()} ₫ | Score ${p.score} | ${p.reasons[0]}`,
      )
      .join("\n");

    return `**Investment Picks** — ${marketSentiment} market

${list}

*Criteria: ${criteria}*

See full rankings on the [Dashboard](/) or refine in the [Screener](/screener).`;
  }

  const symbol = extractSymbol(question, stocks);
  if (symbol) {
    const stock = await getStock(symbol);
    if (stock) return buildStockAnalysis(stock);
  }

  const ticker = question.toUpperCase().match(/\b([A-Z]{2,5})\b/)?.[1];
  if (ticker) {
    const stock = await getStock(ticker);
    if (stock) return buildStockAnalysis(stock);
  }

  return `## Vietnam Stock AI Analyst

I use live **Entrade/Yahoo** data for Vietnamese equities.

**Try asking:**
- Should I buy FPT?
- Analyze VCB
- Compare FPT vs CMG
- What's the market outlook today?

> Add **GROQ_API_KEY** or **GEMINI_API_KEY** in .env for full LLM responses.`;
}
