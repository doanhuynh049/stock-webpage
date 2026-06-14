import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStock } from "@/lib/market-service";
import { callLlm } from "@/lib/providers/llm";
import { analyzeStock } from "@/lib/analysis/stock-analysis";
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

const EVAL_SYSTEM_INSTRUCTION = `You are a professional Vietnam stock analyst with deep knowledge of Vietnamese listed companies, their business models, competitive landscape, and management teams.

Your task: produce a structured 8-category investment evaluation in JSON.

IMPORTANT INSTRUCTIONS:
- For QUANTITATIVE fields (valuation, financials, timing, technical): use ONLY the market data provided.
- For QUALITATIVE fields (business model, management, competitive advantages): use BOTH the provided data AND your training knowledge about the company. Vietnamese blue-chips like VCB, FPT, VHM, HPG, VIC, MSN, REE, BMP are well-known — describe them accurately.
- Never invent specific numbers not in the provided data.
- Be concise but insightful (3-5 sentences per category).
- If a metric is N/A in the data, explain why it matters and what the user should research.

Return ONLY valid JSON (no markdown fences, no extra text):
{
  "categories": [
    {"id": "business", "title": "1. Business", "analysis": "string — describe what the company does, how it makes money, its competitive moat, and business model sustainability"},
    {"id": "financial", "title": "2. Financial Health", "analysis": "string — revenue growth trend, profitability, cash flow quality, debt level, margin trajectory"},
    {"id": "valuation", "title": "3. Valuation", "analysis": "string — P/E, P/B, dividend yield, analyst target vs current price, over/undervalued assessment"},
    {"id": "risks", "title": "4. Risks", "analysis": "string — 3-4 specific risks for this company and sector"},
    {"id": "growth", "title": "5. Growth Opportunities", "analysis": "string — concrete growth catalysts: new markets, products, M&A, demographic tailwinds"},
    {"id": "management", "title": "6. Management", "analysis": "string — leadership track record, ownership alignment, communication quality, notable decisions"},
    {"id": "timing", "title": "7. Timing", "analysis": "string — RSI signal, price vs 52w range, technical score, current entry attractiveness"},
    {"id": "fit", "title": "8. Investment Fit", "analysis": "string — suitable for which investor type, holding horizon, position size suggestion, final verdict"}
  ],
  "recommendation": "ACCUMULATE|WATCH|HOLD|TRIM|AVOID",
  "thesis": "one compelling sentence summarizing the investment case",
  "confidence": "HIGH|MEDIUM|LOW"
}`;

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

  const context = await buildStockContext(stock);

  const llmResult = await callLlm(
    [
      {
        role: "system",
        content: EVAL_SYSTEM_INSTRUCTION,
      },
      {
        role: "user",
        content: `Evaluate ${symbol} for a Vietnamese long-term investor. Stock data:\n\n${context}\n\nReturn JSON only.`,
      },
    ],
    context,
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
        sector: stock.sector ?? "N/A",
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
  const fallback = buildRuleBasedEval(stock);
  return NextResponse.json({ ...fallback, provider: "rule-based" } satisfies StockEvalResult);
}
