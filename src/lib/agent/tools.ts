import { getStock, getMarketSnapshot } from "@/lib/market-service";
import { getNewsLive } from "@/lib/news-service";
import { getStockPicks } from "@/lib/stock-picks";
import { analyzeStock } from "@/lib/analysis/stock-analysis";

export type AgentTraceStep = {
  thought: string;
  action?: string;
  observation?: string;
};

export type ToolResult = { ok: boolean; data: string };
export type ToolContext = { userId?: string };

type ToolDef = {
  description: string;
  run(args: Record<string, string>, ctx: ToolContext): Promise<ToolResult>;
};

export const TOOLS: Record<string, ToolDef> = {
  get_stock: {
    description: 'Live price + fundamentals for one ticker. Args: {"symbol":"FPT"}',
    async run({ symbol }) {
      if (!symbol) return { ok: false, data: "symbol is required" };
      const s = await getStock(symbol.toUpperCase());
      if (!s) return { ok: false, data: `No market data found for ${symbol}` };
      return {
        ok: true,
        data: [
          `${s.symbol} (${s.name})`,
          `Price: ${s.price.toLocaleString()} VND (${s.changePercent > 0 ? "+" : ""}${s.changePercent}%)`,
          `PE: ${s.pe || "N/A"} | PB: ${s.pb || "N/A"} | ROE: ${s.roe}% | Rev growth: ${s.revenueGrowth}%`,
          `RSI: ${s.rsi} | Div yield: ${s.dividendYield}% | Analyst target: ${s.analystTarget.toLocaleString()} VND`,
          `Rating: ${s.analystRating} | Sector: ${s.sector} | Exchange: ${s.exchange}`,
        ].join("\n"),
      };
    },
  },

  get_market: {
    description: "VNINDEX, market sentiment and session stats. Args: {}",
    async run() {
      const m = await getMarketSnapshot();
      const vni = m.indices.find((i) => i.symbol === "VNINDEX");
      const vn30 = m.indices.find((i) => i.symbol === "VN30");
      return {
        ok: true,
        data: [
          `Session: ${m.session} | Updated: ${m.lastUpdated}`,
          `VNINDEX: ${vni?.value ?? "N/A"} (${vni?.changePercent ?? 0}%)${vn30 ? ` | VN30: ${vn30.value} (${vn30.changePercent}%)` : ""}`,
          `Sentiment: ${m.sentiment} (${m.sentimentScore}%)`,
          `Advancing: ${m.stats.advancing} | Declining: ${m.stats.declining} | Volume: ${(m.stats.totalVolume / 1e6).toFixed(0)}M shares`,
          `Foreign net: ${m.stats.foreignNetBuy} tỷ VND`,
        ].join("\n"),
      };
    },
  },

  search_news: {
    description: 'Recent VN stock news. Args: {"query":"FPT earnings"} or {"symbol":"VCB"}',
    async run({ query, symbol }) {
      const sym = symbol?.toUpperCase();
      const news = await getNewsLive(sym);
      const q = query?.toLowerCase();
      const hits = q
        ? news.filter(
            (n) =>
              n.title.toLowerCase().includes(q) ||
              (n.summary ?? "").toLowerCase().includes(q),
          )
        : news;
      const top = hits.slice(0, 6);
      if (!top.length) return { ok: false, data: `No recent news found for "${query ?? symbol}"` };
      return {
        ok: true,
        data: top.map((n) => `- [${n.source}] ${n.title}`).join("\n"),
      };
    },
  },

  screen_stocks: {
    description: "Top-scored investment picks in the current market. Args: {}",
    async run() {
      const { picks, marketSentiment, criteria } = await getStockPicks(6);
      if (!picks.length) return { ok: false, data: "No picks matched the current screen" };
      return {
        ok: true,
        data: [
          `Market: ${marketSentiment} | Filter: ${criteria}`,
          ...picks.map(
            (p) =>
              `${p.stock.symbol}: score=${p.score} horizon=${p.horizon} — ${p.reasons[0]}`,
          ),
        ].join("\n"),
      };
    },
  },

  analyze_stock: {
    description: 'Technical + fundamental analysis signals for a ticker. Args: {"symbol":"VCB"}',
    async run({ symbol }) {
      if (!symbol) return { ok: false, data: "symbol is required" };
      const s = await getStock(symbol.toUpperCase());
      if (!s) return { ok: false, data: `No stock data for ${symbol}` };
      const a = await analyzeStock(s);
      return {
        ok: true,
        data: [
          `${symbol} — Signal: ${a.recommendation} | Combined score: ${a.combinedScore}/100`,
          `Technical: ${a.technicalScore} (${a.technicalRating}) | Fundamental: ${a.fundamentalScore} (${a.fundamentalRating})`,
          `Trend: ${a.maTrend}`,
          `Momentum: ${a.momentum}`,
          `Key levels: ${a.supportResistance}`,
        ].join("\n"),
      };
    },
  },
};

export type ToolName = keyof typeof TOOLS;

export function buildToolSchema(): string {
  return Object.entries(TOOLS)
    .map(([name, t]) => `- ${name}: ${t.description}`)
    .join("\n");
}
