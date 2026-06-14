import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStock } from "@/lib/market-service";
import { callLlm } from "@/lib/providers/llm";
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

function buildStockContext(stock: Stock): string {
  return `Stock: ${stock.symbol} — ${stock.name}
Exchange: ${stock.exchange ?? "HOSE"} | Sector: ${stock.sector ?? "N/A"}
Price: ${stock.price.toLocaleString()} VND (${stock.changePercent > 0 ? "+" : ""}${stock.changePercent}%)
PE Ratio: ${stock.pe > 0 ? stock.pe.toFixed(1) : "N/A"}
P/B Ratio: ${stock.pb > 0 ? stock.pb.toFixed(2) : "N/A"}
ROE: ${stock.roe > 0 ? stock.roe.toFixed(1) + "%" : "N/A"}
Revenue Growth: ${stock.revenueGrowth ? stock.revenueGrowth.toFixed(1) + "% YoY" : "N/A"}
Dividend Yield: ${stock.dividendYield > 0 ? stock.dividendYield.toFixed(2) + "%" : "None"}
RSI: ${stock.rsi > 0 ? stock.rsi.toFixed(0) : "N/A"}
Analyst Target: ${stock.analystTarget > 0 ? stock.analystTarget.toLocaleString() + " VND" : "N/A"}
Analyst Rating: ${stock.analystRating ?? "N/A"}
52w High: ${stock.high52w > 0 ? stock.high52w.toLocaleString() : "N/A"} | 52w Low: ${stock.low52w > 0 ? stock.low52w.toLocaleString() : "N/A"}
Market Cap: ${stock.marketCap > 0 ? (stock.marketCap / 1e12).toFixed(1) + "T VND" : "N/A"}`;
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

const EVAL_SYSTEM_INSTRUCTION = `You are a professional Vietnam stock analyst. Given stock market data, produce a structured investment evaluation.

Return ONLY valid JSON (no markdown fences, no extra text) matching this exact schema:
{
  "categories": [
    {"id": "business", "title": "1. Business", "analysis": "string"},
    {"id": "financial", "title": "2. Financial Health", "analysis": "string"},
    {"id": "valuation", "title": "3. Valuation", "analysis": "string"},
    {"id": "risks", "title": "4. Risks", "analysis": "string"},
    {"id": "growth", "title": "5. Growth Opportunities", "analysis": "string"},
    {"id": "management", "title": "6. Management", "analysis": "string"},
    {"id": "timing", "title": "7. Timing", "analysis": "string"},
    {"id": "fit", "title": "8. Investment Fit", "analysis": "string"}
  ],
  "recommendation": "ACCUMULATE|WATCH|HOLD|TRIM|AVOID",
  "thesis": "one-sentence thesis",
  "confidence": "HIGH|MEDIUM|LOW"
}

For each category write 2-4 concise sentences covering the most important points.
Base your analysis ONLY on the data provided. If data is missing for a field, say so honestly.`;

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

  const context = buildStockContext(stock);

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
