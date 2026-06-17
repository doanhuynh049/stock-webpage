import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStock } from "@/lib/market-service";
import { callLlm } from "@/lib/providers/llm";
import { analyzeStock } from "@/lib/analysis/stock-analysis";
import { isEtfSymbol } from "@/lib/analysis/etf-utils";
import type { Stock } from "@/types/stock";

// ─── types ───────────────────────────────────────────────────────────────────

export type EvalCategory = {
  id: string;
  title: string;
  analysis: string;
};

export type StockEvalResult = {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  sector: string;
  categories: EvalCategory[];
  recommendation: "ACCUMULATE" | "WATCH" | "HOLD" | "TRIM" | "AVOID";
  thesis: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  provider: string;
};

// ─── helpers ─────────────────────────────────────────────────────────────────

async function buildStockContext(stock: Stock): Promise<string> {
  const lines: string[] = [];

  lines.push(`=== ${stock.symbol} — ${stock.name} ===`);
  lines.push(`Exchange: ${stock.exchange ?? "HOSE"} | Sector: ${stock.sector ?? "N/A"}`);
  if (stock.profile) lines.push(`Profile: ${stock.profile}`);

  lines.push("");
  lines.push("--- Live Market Data ---");
  lines.push(`Price: ${stock.price.toLocaleString()} VND (${stock.changePercent >= 0 ? "+" : ""}${stock.changePercent.toFixed(2)}% today)`);
  if (stock.high52w > 0 && stock.low52w > 0) {
    const pctFrom52High = ((stock.price - stock.high52w) / stock.high52w * 100).toFixed(1);
    lines.push(`52w Range: ${stock.low52w.toLocaleString()} – ${stock.high52w.toLocaleString()} VND (currently ${pctFrom52High}% from 52w high)`);
  }
  if (stock.marketCap > 0) lines.push(`Market Cap: ${(stock.marketCap / 1e12).toFixed(2)}T VND`);
  if (stock.volume > 0) lines.push(`Volume: ${stock.volume.toLocaleString()}`);

  lines.push("");
  lines.push("--- Valuation ---");
  lines.push(`P/E Ratio: ${stock.pe > 0 ? stock.pe.toFixed(1) : "N/A"}`);
  lines.push(`P/B Ratio: ${stock.pb > 0 ? stock.pb.toFixed(2) : "N/A"}`);
  lines.push(`Dividend Yield: ${stock.dividendYield > 0 ? stock.dividendYield.toFixed(2) + "%" : "None"}`);
  if (stock.analystTarget > 0) {
    const upside = ((stock.analystTarget - stock.price) / stock.price * 100).toFixed(1);
    lines.push(`Analyst Target: ${stock.analystTarget.toLocaleString()} VND (${Number(upside) >= 0 ? "+" : ""}${upside}% upside) — Rating: ${stock.analystRating}`);
  } else {
    lines.push(`Analyst Rating: ${stock.analystRating ?? "N/A"}`);
  }

  lines.push("");
  lines.push("--- Fundamentals ---");
  lines.push(`ROE: ${stock.roe > 0 ? stock.roe.toFixed(1) + "%" : "N/A"}`);
  lines.push(`Revenue Growth (YoY): ${stock.revenueGrowth !== 0 ? stock.revenueGrowth.toFixed(1) + "%" : "N/A"}`);

  if (stock.financials?.years?.length) {
    const { years, revenue, netProfit } = stock.financials;
    const rows = years.map((y, i) => {
      const rev = revenue[i] != null ? `${(revenue[i] / 1e9).toFixed(0)}B` : "—";
      const np = netProfit[i] != null ? `${(netProfit[i] / 1e9).toFixed(0)}B` : "—";
      return `  ${y}: Revenue ${rev} VND | Net Profit ${np} VND`;
    });
    lines.push("Historical Financials:");
    lines.push(...rows);
  }

  lines.push("");
  lines.push("--- Technical ---");
  lines.push(`RSI: ${stock.rsi > 0 ? stock.rsi.toFixed(1) + (stock.rsi > 70 ? " (overbought)" : stock.rsi < 30 ? " (oversold)" : " (neutral)") : "N/A"}`);

  // Enrich with computed analysis scores
  try {
    const analysis = await analyzeStock(stock);
    lines.push(`Technical Score: ${analysis.technicalScore}/100 (${analysis.technicalRating})`);
    lines.push(`Fundamental Score: ${analysis.fundamentalScore}/100`);
    lines.push(`Combined Score: ${analysis.combinedScore}/100 — Signal: ${analysis.recommendation}`);
    lines.push(`MA Trend: ${analysis.maTrend}`);
    lines.push(`Momentum: ${analysis.momentum}`);
    if (analysis.supportResistance) lines.push(`Support/Resistance: ${analysis.supportResistance}`);
  } catch {
    // analysis is optional
  }

  return lines.join("\n");
}

async function buildEtfContext(stock: Stock): Promise<string> {
  const lines: string[] = [];

  lines.push(`=== ${stock.symbol} — ${stock.name} (ETF) ===`);
  lines.push(`Exchange: ${stock.exchange ?? "HOSE"} | Type: Exchange-Traded Fund`);

  lines.push("");
  lines.push("--- Market Data ---");
  lines.push(`NAV/Price: ${stock.price.toLocaleString()} VND (${stock.changePercent >= 0 ? "+" : ""}${stock.changePercent.toFixed(2)}% today)`);
  if (stock.high52w > 0 && stock.low52w > 0) {
    const pctFrom52High = ((stock.price - stock.high52w) / stock.high52w * 100).toFixed(1);
    lines.push(`52w Range: ${stock.low52w.toLocaleString()} – ${stock.high52w.toLocaleString()} VND (currently ${pctFrom52High}% from 52w high)`);
  }
  if (stock.volume > 0) lines.push(`Volume: ${stock.volume.toLocaleString()}`);
  if (stock.marketCap > 0) lines.push(`AUM (approx): ${(stock.marketCap / 1e12).toFixed(2)}T VND`);
  if (stock.dividendYield > 0) lines.push(`Distribution Yield: ${stock.dividendYield.toFixed(2)}%`);

  lines.push("");
  lines.push("--- Note ---");
  lines.push("ETFs track indices and do not have individual company fundamentals (P/E, ROE, revenue growth). Analysis should focus on index methodology, composition, cost, liquidity, and macro context.");

  lines.push("");
  lines.push("--- Technical ---");
  lines.push(`RSI: ${stock.rsi > 0 ? stock.rsi.toFixed(1) + (stock.rsi > 70 ? " (overbought)" : stock.rsi < 30 ? " (oversold)" : " (neutral)") : "N/A"}`);

  try {
    const analysis = await analyzeStock(stock);
    lines.push(`Technical Score: ${analysis.technicalScore}/100 (${analysis.technicalRating})`);
    lines.push(`Combined Score: ${analysis.combinedScore}/100 — Signal: ${analysis.recommendation}`);
    lines.push(`MA Trend: ${analysis.maTrend}`);
    lines.push(`Momentum: ${analysis.momentum}`);
    if (analysis.supportResistance) lines.push(`Support/Resistance: ${analysis.supportResistance}`);
  } catch {
    // analysis is optional
  }

  return lines.join("\n");
}

function buildEtfSystemInstruction(): string {
  return `You are a professional Vietnam ETF analyst with deep knowledge of Vietnamese index funds, their underlying indices, and ETF market structure.

Your task: produce a structured 8-category ETF investment evaluation in JSON.

IMPORTANT — ETF-SPECIFIC RULES:
- ETFs track indices — they have NO individual company P/E, ROE, or revenue. Do NOT use company analysis frameworks.
- Use your training knowledge about the specific Vietnamese ETF code to describe what index it tracks (e.g. FUEIP100 tracks FTSE Vietnam 100; FUEVN100 tracks VN100; E1VFVN30 tracks VN30; FUEMAV30 tracks VN30).
- For expense ratio and AUM: cite from data if available; otherwise use known public information or state it is unavailable.
- Be concise but insightful: 3–5 sentences per category.
- Do NOT say "data unavailable" as the entire answer — add substantive insight about ETF mechanics or the underlying index.

Return ONLY valid JSON (no markdown fences, no extra text):
{
  "categories": [
    {"id": "index", "title": "1. Index & Structure", "analysis": "string — what index it tracks, index methodology (market-cap weighted, float-adjusted, rebalancing frequency), physical vs synthetic replication"},
    {"id": "composition", "title": "2. Portfolio Composition", "analysis": "string — number of constituents, top sectors and largest stocks in the index, concentration risk"},
    {"id": "performance", "title": "3. Performance & Tracking", "analysis": "string — historical NAV performance vs benchmark, tracking error quality, fund age and AUM size"},
    {"id": "cost", "title": "4. Cost & Efficiency", "analysis": "string — total expense ratio vs actively managed Vietnamese funds, bid-ask spread, creation/redemption efficiency"},
    {"id": "liquidity", "title": "5. Liquidity & Trading", "analysis": "string — daily trading volume, market maker support, ease of entry and exit, size of fund vs index"},
    {"id": "macro", "title": "6. Market Context", "analysis": "string — current VN-Index trend, Vietnam macro tailwinds/headwinds, foreign investor flows, sector rotation"},
    {"id": "timing", "title": "7. Timing", "analysis": "string — RSI, price vs 52-week range, technical score, DCA vs lump-sum entry consideration"},
    {"id": "fit", "title": "8. Investment Fit", "analysis": "string — suitable investor profile (passive, long-term), recommended holding horizon, role in a Vietnam equity portfolio (core holding), position size guidance"}
  ],
  "recommendation": "ACCUMULATE|WATCH|HOLD|TRIM|AVOID",
  "thesis": "one compelling sentence summarizing the ETF investment case for a Vietnamese long-term investor",
  "confidence": "HIGH|MEDIUM|LOW"
}`;
}

function buildEtfRuleBasedEval(stock: Stock): Omit<StockEvalResult, "provider"> {
  const isOversold = stock.rsi > 0 && stock.rsi < 35;
  const isOverbought = stock.rsi > 70;

  const recommendation: StockEvalResult["recommendation"] =
    isOverbought ? "TRIM"
    : isOversold ? "ACCUMULATE"
    : "WATCH";

  return {
    symbol: stock.symbol,
    name: stock.name,
    price: stock.price,
    changePercent: stock.changePercent,
    sector: "ETF",
    recommendation,
    thesis: `${stock.symbol} is a Vietnamese index ETF providing passive exposure to a broad basket of listed stocks. It offers diversification at low cost relative to active fund management.`,
    confidence: "LOW",
    categories: [
      {
        id: "index",
        title: "1. Index & Structure",
        analysis: `${stock.symbol} is a Vietnamese Exchange-Traded Fund listed on ${stock.exchange ?? "HOSE"}. It aims to replicate the performance of its benchmark index through physical replication. As a passive vehicle it removes stock-picking risk and follows a rules-based, transparent methodology.`,
      },
      {
        id: "composition",
        title: "2. Portfolio Composition",
        analysis: `The ETF holds a basket of Vietnamese listed equities mirroring its target index. Composition typically spans large-cap HOSE-listed stocks across banking, real estate, technology, and consumer sectors. Sector weights shift with the index rebalancing schedule.`,
      },
      {
        id: "performance",
        title: "3. Performance & Tracking",
        analysis: `Performance closely follows the underlying index with minimal tracking error. Long-term returns depend on Vietnam market growth. As an index product, performance is tied to broad market direction rather than individual stock selection.`,
      },
      {
        id: "cost",
        title: "4. Cost & Efficiency",
        analysis: `ETFs in Vietnam typically carry lower total expense ratios than actively managed domestic funds. The main costs are the management fee and bid-ask spread on-exchange. Comparing the expense ratio against the VN30/VN100 ETF peer group is recommended before investing.`,
      },
      {
        id: "liquidity",
        title: "5. Liquidity & Trading",
        analysis: `Volume: ${stock.volume > 0 ? stock.volume.toLocaleString() : "N/A"} units traded today. Adequate liquidity ensures tight spreads during normal sessions. Very large orders may need to be broken into smaller tranches to avoid market impact.`,
      },
      {
        id: "macro",
        title: "6. Market Context",
        analysis: `Vietnam's market is driven by domestic economic growth, manufacturing exports, and banking sector earnings. Foreign investor sentiment and USD/VND exchange rate are key macro variables affecting index ETF performance. The current market direction determines short-term NAV movement.`,
      },
      {
        id: "timing",
        title: "7. Timing",
        analysis: `RSI: ${stock.rsi > 0 ? stock.rsi.toFixed(0) : "N/A"} — ${isOversold ? "oversold, potential accumulation opportunity via DCA" : isOverbought ? "overbought, consider waiting for a pullback" : "neutral momentum, DCA entry is appropriate"}. Price is ${stock.high52w > 0 ? ((stock.price / stock.high52w) * 100).toFixed(0) + "% of 52-week high" : "at current level"}.`,
      },
      {
        id: "fit",
        title: "8. Investment Fit",
        analysis: `Suitable for long-term passive investors seeking broad Vietnamese equity exposure without single-stock risk. Recommended as a core portfolio allocation (40–60% of Vietnam equity sleeve). Pair with a 3–5 year holding horizon and dollar-cost averaging to smooth out market volatility.`,
      },
    ],
  };
}

/** Rule-based fallback when LLM is unavailable */
function buildRuleBasedEval(stock: Stock): Omit<StockEvalResult, "provider"> {
  const isOvervalued = stock.pe > 20 && stock.pe > 0;
  const hasGrowth = stock.revenueGrowth >= 12;
  const isOversold = stock.rsi > 0 && stock.rsi < 35;
  const isOverbought = stock.rsi > 70;
  const strongRoe = stock.roe >= 15;

  const recommendation: StockEvalResult["recommendation"] =
    isOverbought ? "TRIM"
    : isOvervalued && !hasGrowth ? "AVOID"
    : (hasGrowth && strongRoe) || isOversold ? "ACCUMULATE"
    : "WATCH";

  return {
    symbol: stock.symbol,
    name: stock.name,
    price: stock.price,
    changePercent: stock.changePercent,
    sector: stock.sector ?? "N/A",
    recommendation,
    thesis: `${stock.name} is a ${stock.sector ?? "Vietnamese"} company. ${hasGrowth ? "Revenue growth is strong" : "Revenue growth is moderate"}; ROE is ${stock.roe > 0 ? stock.roe.toFixed(0) + "%" : "unavailable"}.`,
    confidence: "LOW",
    categories: [
      {
        id: "business",
        title: "1. Business",
        analysis: `${stock.name} (${stock.symbol}) operates in the ${stock.sector ?? "Vietnamese"} sector. Current analyst rating: ${stock.analystRating ?? "N/A"}. The company is listed on ${stock.exchange ?? "HOSE"}.`,
      },
      {
        id: "financial",
        title: "2. Financial Health",
        analysis: `Revenue growth: ${stock.revenueGrowth > 0 ? stock.revenueGrowth.toFixed(1) + "% YoY" : "N/A"}. ROE: ${stock.roe > 0 ? stock.roe.toFixed(1) + "%" : "N/A"}. Dividend yield: ${stock.dividendYield > 0 ? stock.dividendYield.toFixed(2) + "%" : "no dividend"}.`,
      },
      {
        id: "valuation",
        title: "3. Valuation",
        analysis: `P/E: ${stock.pe > 0 ? stock.pe.toFixed(1) : "N/A"}. P/B: ${stock.pb > 0 ? stock.pb.toFixed(2) : "N/A"}. Analyst target: ${stock.analystTarget > 0 ? stock.analystTarget.toLocaleString() + " VND" : "N/A"}. Current price is ${stock.price.toLocaleString()} VND.`,
      },
      {
        id: "risks",
        title: "4. Risks",
        analysis: `${isOverbought ? "RSI at " + stock.rsi.toFixed(0) + " indicates overbought conditions. " : ""}${isOvervalued ? "P/E above 20 suggests elevated valuation risk. " : ""}General Vietnam market risks: USD/VND exchange rate, regulatory changes, and sector concentration.`,
      },
      {
        id: "growth",
        title: "5. Growth Opportunities",
        analysis: `${hasGrowth ? "Strong revenue growth of " + stock.revenueGrowth.toFixed(1) + "% suggests continued expansion. " : ""}Analyst target of ${stock.analystTarget > 0 ? stock.analystTarget.toLocaleString() + " VND" : "N/A"} implies ${stock.analystTarget > stock.price ? "upside potential" : "limited upside at current price"}.`,
      },
      {
        id: "management",
        title: "6. Management",
        analysis: `Management quality data is not available through automated data feeds. Please review annual reports, ESG scores, and recent management communication for qualitative assessment.`,
      },
      {
        id: "timing",
        title: "7. Timing",
        analysis: `RSI: ${stock.rsi > 0 ? stock.rsi.toFixed(0) : "N/A"} — ${isOversold ? "oversold zone, potential accumulation opportunity" : isOverbought ? "overbought, consider waiting for pullback" : "neutral momentum"}. Price is ${stock.high52w > 0 ? ((stock.price / stock.high52w) * 100).toFixed(0) + "% of 52w high" : "at current level"}.`,
      },
      {
        id: "fit",
        title: "8. Investment Fit",
        analysis: `${recommendation === "ACCUMULATE" ? "This stock appears suitable for long-term value investors with a 3–5 year horizon." : recommendation === "AVOID" ? "Current metrics suggest caution. Better entry points may emerge." : "This stock warrants monitoring before committing capital."} Assess position sizing against your overall Vietnam equity allocation.`,
      },
    ],
  };
}

// ─── route ───────────────────────────────────────────────────────────────────

function buildEvalSystemInstruction(hasFundamentals: boolean): string {
  const dataNote = hasFundamentals
    ? "Fundamental data (PE/ROE/revenue) is available — use it for precise valuation and financial analysis."
    : `IMPORTANT — FUNDAMENTAL DATA IS NOT AVAILABLE from the market feed for this stock (it may be a smaller HNX/UPCOM listing not covered by our snapshot DB).
For categories 1–3 and 6: draw heavily on your training knowledge about this Vietnamese company — its actual business, products, clients, financials if you know them, and management.
Do NOT say "data not provided" as your primary response — that adds no value. Instead, share what you know or provide informed sector-level analysis.
For categories 7 and 8: use the technical data which IS available.`;

  return `You are a professional Vietnam stock analyst with deep knowledge of Vietnamese listed companies, their business models, competitive landscape, and management teams.

Your task: produce a structured 8-category investment evaluation in JSON.

${dataNote}

GENERAL RULES:
- For quantitative claims (PE ratio, exact revenue figures, etc.): only cite numbers present in the provided data.
- For qualitative analysis (business model, moat, management): use your training knowledge freely and accurately.
- Do NOT write "information not provided" or "data unavailable" as the entire answer — always add insight.
- Be concise but insightful: 3–5 sentences per category.
- Vietnamese listed companies like NTP (Tien Phong Plastics), BMP (Binh Minh Plastics), REE (Refrigeration Electrical Engineering), NLG (Nam Long Group), etc. are well-known — describe them accurately from your knowledge.

Return ONLY valid JSON (no markdown fences, no extra text):
{
  "categories": [
    {"id": "business", "title": "1. Business", "analysis": "string — what the company does, revenue model, competitive moat, business sustainability"},
    {"id": "financial", "title": "2. Financial Health", "analysis": "string — use available metrics; if missing, describe what is known from public records or typical sector profile"},
    {"id": "valuation", "title": "3. Valuation", "analysis": "string — use PE/PB if available; otherwise describe how investors typically value this type of business and whether the price looks reasonable"},
    {"id": "risks", "title": "4. Risks", "analysis": "string — 3–4 specific risks for this company and its sector"},
    {"id": "growth", "title": "5. Growth Opportunities", "analysis": "string — concrete growth catalysts specific to this company and Vietnam context"},
    {"id": "management", "title": "6. Management", "analysis": "string — what is known about the leadership, ownership structure, and track record"},
    {"id": "timing", "title": "7. Timing", "analysis": "string — RSI, price vs 52w range, technical score, current entry attractiveness"},
    {"id": "fit", "title": "8. Investment Fit", "analysis": "string — investor type, holding horizon, position size consideration, verdict"}
  ],
  "recommendation": "ACCUMULATE|WATCH|HOLD|TRIM|AVOID",
  "thesis": "one compelling sentence summarizing the investment case",
  "confidence": "HIGH|MEDIUM|LOW"
}`;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.toUpperCase().trim();
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const stock = await getStock(symbol);
  if (!stock || stock.price <= 0) {
    return NextResponse.json({ error: `Stock "${symbol}" not found` }, { status: 404 });
  }

  const isEtf = isEtfSymbol(symbol);

  const context = isEtf
    ? await buildEtfContext(stock)
    : await buildStockContext(stock);

  const systemInstruction = isEtf
    ? buildEtfSystemInstruction()
    : buildEvalSystemInstruction(stock.pe > 0 || stock.roe > 0 || stock.revenueGrowth !== 0);

  const userPrompt = isEtf
    ? `Evaluate the ETF ${symbol} (${stock.name}) for a Vietnamese long-term passive investor.\n\nETF data:\n${context}\n\nReturn JSON only.`
    : `Evaluate ${symbol} (${stock.name}) for a Vietnamese long-term investor.\n\nStock data:\n${context}\n\nReturn JSON only.`;

  const llmResult = await callLlm(
    [
      { role: "system", content: systemInstruction },
      { role: "user", content: userPrompt },
    ],
    "",
    { maxTokens: 2000 },
  );

  if (llmResult.content && llmResult.provider !== "fallback") {
    try {
      const raw = llmResult.content
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
      const parsed = JSON.parse(raw) as {
        categories?: EvalCategory[];
        recommendation?: string;
        thesis?: string;
        confidence?: string;
      };

      const result: StockEvalResult = {
        symbol: stock.symbol,
        name: stock.name,
        price: stock.price,
        changePercent: stock.changePercent,
        sector: isEtf ? "ETF" : (stock.sector ?? "N/A"),
        categories: parsed.categories ?? [],
        recommendation: (parsed.recommendation ?? "WATCH") as StockEvalResult["recommendation"],
        thesis: parsed.thesis ?? "",
        confidence: (parsed.confidence ?? "MEDIUM") as StockEvalResult["confidence"],
        provider: llmResult.provider,
      };
      return NextResponse.json(result);
    } catch {
      // JSON parse failed — fall through to rule-based
    }
  }

  // Rule-based fallback
  const fallback = isEtf ? buildEtfRuleBasedEval(stock) : buildRuleBasedEval(stock);
  return NextResponse.json({ ...fallback, provider: "rule-based" } satisfies StockEvalResult);
}
