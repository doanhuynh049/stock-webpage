import { getAllStocks, getStock, resolveStocksFromQuestion } from "@/lib/market-service";
import { extractLastMentionedSymbol, extractTickersFromQuestion } from "@/lib/symbol-utils";
import { isEtfSymbol } from "@/lib/analysis/etf-utils";
import { getEtfMeta } from "@/lib/analysis/etf-universe";
import type { Stock } from "@/types/stock";

async function extractSymbol(question: string, priorContext?: string): Promise<string | null> {
  const resolved = await resolveStocksFromQuestion(question, priorContext);
  if (resolved.length === 1) return resolved[0].symbol;
  if (resolved.length > 1) {
    const tickers = extractTickersFromQuestion(question);
    const match = tickers.find((t) => resolved.some((s) => s.symbol === t));
    return match ?? resolved[0].symbol;
  }

  for (const sym of extractTickersFromQuestion(question)) {
    const stock = await getStock(sym);
    if (stock?.price) return sym;
  }
  return null;
}

function buildEtfAnalysis(stock: Stock): string {
  const meta = getEtfMeta(stock.symbol);
  const positives: string[] = [];
  const cautions: string[] = [];

  if (meta?.aumBnVnd != null && meta.aumBnVnd >= 500)
    positives.push(`Large AUM (~${meta.aumBnVnd}B VND) — high liquidity`);
  else if (meta?.aumBnVnd != null)
    cautions.push(`Smaller AUM (~${meta.aumBnVnd}B VND) — may have wider spreads`);

  if (stock.changePercent > 0)
    positives.push(`Positive momentum today (+${stock.changePercent}%)`);
  else if (stock.changePercent < -1)
    cautions.push(`Negative session (${stock.changePercent}%)`);

  if (stock.rsi > 0 && stock.rsi < 35)
    positives.push(`RSI oversold at ${stock.rsi} — possible accumulation zone`);
  else if (stock.rsi > 70)
    cautions.push(`RSI overbought at ${stock.rsi} — momentum may be stretched`);

  if (positives.length === 0) positives.push("Passive index exposure with low cost");
  if (cautions.length === 0) cautions.push("Tracks benchmark index — returns mirror the index, not individual alpha");

  const priceStr = stock.price > 0
    ? `${stock.price.toLocaleString()} ₫ (${stock.changePercent > 0 ? "+" : ""}${stock.changePercent}%)`
    : "price unavailable";

  return `**${meta?.name ?? stock.name} (${stock.symbol})** — ${priceStr} [ETF]

**Benchmark:** ${meta?.benchmark ?? "index"} | **Manager:** ${meta?.manager ?? "N/A"} | **AUM:** ${meta?.aumBnVnd != null ? `~${meta.aumBnVnd}B VND` : "N/A"}

**ETFs are evaluated differently from stocks.** Key metrics: AUM & liquidity, expense ratio, benchmark tracking error, technical momentum.
PE / ROE / revenue growth do NOT apply to ETFs — they track an index, not a single company.

**Positives:**
${positives.map((s) => `- ${s}`).join("\n")}

**Watch out for:**
${cautions.map((r) => `- ${r}`).join("\n")}

*Source: Entrade/Yahoo live price + static ETF metadata*`;
}

function buildStockAnalysis(stock: Stock): string {
  if (isEtfSymbol(stock.symbol)) return buildEtfAnalysis(stock);

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

export async function analyzeQuestion(
  question: string,
  priorContext?: string,
): Promise<string> {
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
    const symbols = extractTickersFromQuestion(question).slice(0, 2);
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

  const symbol = await extractSymbol(question, priorContext);
  if (symbol) {
    const stock = await getStock(symbol);
    if (stock) return buildStockAnalysis(stock);
  }

  if (priorContext?.trim()) {
    const lastSym = extractLastMentionedSymbol(priorContext);
    if (lastSym) {
      const stock = await getStock(lastSym);
      if (stock) return buildStockAnalysis(stock);
    }
  }

  if (
    lower.includes("screener") ||
    lower.includes("find stock") ||
    lower.includes("opportunit") ||
    lower.includes("undervalued") ||
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

  for (const sym of extractTickersFromQuestion(question)) {
    const stock = await getStock(sym);
    if (stock?.price) return buildStockAnalysis(stock);
    // For known ETFs with no live price, still return metadata context
    if (isEtfSymbol(sym)) {
      const meta = getEtfMeta(sym);
      if (meta) {
        return buildEtfAnalysis({
          symbol: sym,
          name: meta.name,
          sector: "ETF",
          exchange: "HOSE",
          price: 0,
          change: 0,
          changePercent: 0,
          volume: 0,
          marketCap: 0,
          pe: 0,
          pb: 0,
          roe: 0,
          revenueGrowth: 0,
          rsi: 50,
          dividendYield: 0,
          high52w: 0,
          low52w: 0,
          analystRating: "Hold",
          analystTarget: 0,
          profile: "",
          financials: { years: [], revenue: [], netProfit: [], totalDebt: [] },
        });
      }
    }
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
