import fs from "fs/promises";
import path from "path";
import seedMarket from "@/data/market.json";
import seedStocks from "@/data/stocks.json";
import seedNews from "@/data/news.json";
import {
  ENTRADE_INDEX_MAP,
  fetchIndexQuote,
  fetchStockHistory,
  fetchStockQuote,
} from "@/lib/providers/entrade";
import { fetchYahooHistory, fetchYahooQuote } from "@/lib/providers/yahoo";
import type {
  MarketSnapshot,
  NewsItem,
  PricePoint,
  Stock,
  TechnicalSignal,
} from "@/types/stock";

const CACHE_DIR = path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "market-data.json");
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — morning & afternoon sessions

type QuoteCache = Record<
  string,
  { price: number; change: number; changePercent: number; volume: number }
>;

type CachePayload = {
  syncedAt: string;
  source: string;
  market: MarketSnapshot;
  quotes: QuoteCache;
};

let memoryCache: CachePayload | null = null;

const seedStockList = seedStocks as Stock[];
const seedNewsList = seedNews as NewsItem[];

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readCache(): Promise<CachePayload | null> {
  if (memoryCache) return memoryCache;
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    memoryCache = JSON.parse(raw) as CachePayload;
    return memoryCache;
  } catch {
    return null;
  }
}

async function writeCache(payload: CachePayload) {
  memoryCache = payload;
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(payload, null, 2));
}

function isCacheFresh(cache: CachePayload | null): boolean {
  if (!cache?.syncedAt) return false;
  return Date.now() - new Date(cache.syncedAt).getTime() < CACHE_TTL_MS;
}

function mergeStockWithQuote(stock: Stock, quote?: QuoteCache[string]): Stock {
  if (!quote) return stock;
  return {
    ...stock,
    price: quote.price,
    change: quote.change,
    changePercent: quote.changePercent,
    volume: quote.volume,
  };
}

function computeRsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round(100 - 100 / (1 + rs));
}

export async function syncMarketData(force = false): Promise<{
  success: boolean;
  source: string;
  syncedAt: string;
  stocksUpdated: number;
  errors: string[];
}> {
  const existing = await readCache();
  if (!force && isCacheFresh(existing)) {
    return {
      success: true,
      source: existing!.source,
      syncedAt: existing!.syncedAt,
      stocksUpdated: Object.keys(existing!.quotes).length,
      errors: [],
    };
  }

  const errors: string[] = [];
  const quotes: QuoteCache = {};
  const indexNames: Record<string, string> = {
    VNINDEX: "VN-Index",
    HNXINDEX: "HNX-Index",
    UPCOM: "UPCoM-Index",
  };

  const indices = [];
  for (const [display, entradeSymbol] of Object.entries(ENTRADE_INDEX_MAP)) {
    const q = await fetchIndexQuote(entradeSymbol);
    if (q) {
      indices.push({
        symbol: display,
        name: indexNames[display] ?? display,
        value: q.price,
        change: q.change,
        changePercent: q.changePercent,
      });
      quotes[`INDEX:${display}`] = {
        price: q.price,
        change: q.change,
        changePercent: q.changePercent,
        volume: q.volume,
      };
    } else {
      errors.push(`Index ${display} fetch failed`);
    }
    await delay(200);
  }

  for (const stock of seedStockList) {
    let q = await fetchStockQuote(stock.symbol);
    if (!q) {
      const yq = await fetchYahooQuote(stock.symbol);
      if (yq) {
        q = {
          symbol: yq.symbol,
          price: yq.price,
          change: yq.change,
          changePercent: yq.changePercent,
          volume: yq.volume,
          open: yq.price,
          high: yq.price,
          low: yq.price,
          date: new Date().toISOString().split("T")[0],
        };
      }
    }
    if (q) {
      quotes[stock.symbol] = {
        price: q.price,
        change: q.change,
        changePercent: q.changePercent,
        volume: q.volume,
      };
    } else {
      errors.push(`Stock ${stock.symbol} fetch failed`);
    }
    await delay(250);
  }

  const seed = seedMarket as MarketSnapshot;
  const vnindex = indices.find((i) => i.symbol === "VNINDEX");
  const advancing = seedStockList.filter(
    (s) => (quotes[s.symbol]?.changePercent ?? s.changePercent) > 0,
  ).length;
  const declining = seedStockList.filter(
    (s) => (quotes[s.symbol]?.changePercent ?? s.changePercent) < 0,
  ).length;

  const market: MarketSnapshot = {
    ...seed,
    lastUpdated: new Date().toISOString(),
    indices: indices.length ? indices : seed.indices,
    stats: {
      ...seed.stats,
      totalVolume: Object.values(quotes).reduce((s, q) => s + q.volume, 0),
      advancing,
      declining,
      unchanged: seedStockList.length - advancing - declining,
    },
    sentiment:
      vnindex && vnindex.changePercent > 0.5
        ? "Bullish"
        : vnindex && vnindex.changePercent < -0.5
          ? "Bearish"
          : "Neutral",
    sentimentScore:
      vnindex && vnindex.changePercent > 0
        ? Math.min(85, 55 + Math.round(vnindex.changePercent * 10))
        : 45,
  };

  const payload: CachePayload = {
    syncedAt: new Date().toISOString(),
    source: errors.length < seedStockList.length / 2 ? "entrade+yahoo" : "seed-fallback",
    market,
    quotes,
  };

  await writeCache(payload);

  return {
    success: errors.length < seedStockList.length,
    source: payload.source,
    syncedAt: payload.syncedAt,
    stocksUpdated: Object.keys(quotes).filter((k) => !k.startsWith("INDEX:")).length,
    errors,
  };
}

async function ensureFreshData() {
  const cache = await readCache();
  if (!isCacheFresh(cache)) {
    await syncMarketData().catch(() => null);
  }
}

async function getQuotes(): Promise<QuoteCache> {
  await ensureFreshData();
  const cache = await readCache();
  return cache?.quotes ?? {};
}

export async function getMarketSnapshot(): Promise<MarketSnapshot> {
  await ensureFreshData();
  const cache = await readCache();
  return cache?.market ?? (seedMarket as MarketSnapshot);
}

export async function getAllStocks(): Promise<Stock[]> {
  const quotes = await getQuotes();
  return seedStockList.map((s) => mergeStockWithQuote(s, quotes[s.symbol]));
}

export async function getStock(symbol: string): Promise<Stock | undefined> {
  const stocks = await getAllStocks();
  return stocks.find((s) => s.symbol.toUpperCase() === symbol.toUpperCase());
}

export async function getTopMovers(limit = 5) {
  const stocks = await getAllStocks();
  const sorted = [...stocks].sort((a, b) => b.changePercent - a.changePercent);
  return {
    gainers: sorted.slice(0, limit),
    losers: sorted.slice(-limit).reverse(),
  };
}

export async function getStocksBySector(sector?: string): Promise<Stock[]> {
  const stocks = await getAllStocks();
  if (!sector || sector === "All") return stocks;
  return stocks.filter((s) => s.sector === sector);
}

export async function getSectors(): Promise<string[]> {
  return [...new Set(seedStockList.map((s) => s.sector))].sort();
}

export async function screenStocks(filters: {
  maxPe?: number;
  minRevenueGrowth?: number;
  minRoe?: number;
  maxRsi?: number;
  sector?: string;
}): Promise<Stock[]> {
  const stocks = await getAllStocks();
  return stocks.filter((s) => {
    if (filters.maxPe !== undefined && s.pe > 0 && s.pe > filters.maxPe)
      return false;
    if (
      filters.minRevenueGrowth !== undefined &&
      s.revenueGrowth < filters.minRevenueGrowth
    )
      return false;
    if (filters.minRoe !== undefined && s.roe < filters.minRoe) return false;
    if (filters.maxRsi !== undefined && s.rsi > filters.maxRsi) return false;
    if (filters.sector && filters.sector !== "All" && s.sector !== filters.sector)
      return false;
    return true;
  });
}

export function getNews(symbol?: string): NewsItem[] {
  if (!symbol) return seedNewsList;
  return seedNewsList.filter((n) =>
    n.symbols.includes(symbol.toUpperCase()),
  );
}

export async function getPriceHistory(
  symbol: string,
  days = 90,
): Promise<PricePoint[]> {
  const { getDbPriceHistory } = await import("@/lib/db/price-history");
  const dbHistory = await getDbPriceHistory(symbol, days);
  if (dbHistory.length >= 5) return dbHistory;

  let history = await fetchStockHistory(symbol, days);
  if (history.length < 5) {
    history = await fetchYahooHistory(symbol, days);
  }
  return history;
}

export async function getTechnicalSignals(stock: Stock): Promise<TechnicalSignal[]> {
  const history = await getPriceHistory(stock.symbol, 30);
  const closes = history.map((p) => p.close);
  const rsi =
    closes.length >= 15 ? computeRsi(closes) : stock.rsi;

  const rsiSignal =
    rsi < 30 ? "Oversold" : rsi > 70 ? "Overbought" : "Neutral";
  const macdSignal =
    rsi > 60 ? "Bullish" : rsi < 40 ? "Bearish" : "Neutral";

  const ma50 = closes.length
    ? closes.slice(-Math.min(50, closes.length)).reduce((a, b) => a + b, 0) /
      Math.min(50, closes.length)
    : stock.price * 0.97;

  return [
    { indicator: "RSI (14)", value: rsi, signal: rsiSignal },
    { indicator: "MACD", value: stock.changePercent, signal: macdSignal },
    {
      indicator: "MA 50",
      value: Math.round(ma50),
      signal: stock.price > ma50 ? "Bullish" : "Bearish",
    },
    {
      indicator: "MA 20",
      value: Math.round(
        closes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, closes.length || 1),
      ),
      signal: stock.price > ma50 ? "Bullish" : "Bearish",
    },
  ];
}

export function generateAiSummary(stock: Stock): string {
  const outlook =
    stock.analystRating === "Buy" || stock.analystRating === "Strong Buy"
      ? "moderately bullish"
      : stock.analystRating === "Sell" || stock.analystRating === "Strong Sell"
        ? "cautious"
        : "neutral";

  return `${stock.name} (${stock.symbol}) shows ${outlook} fundamentals. Revenue grew ${stock.revenueGrowth}% with ROE at ${stock.roe}%. Trading at PE ${stock.pe > 0 ? stock.pe : "N/A"} with RSI ${stock.rsi}. Analyst consensus: ${stock.analystRating} with target ${stock.analystTarget.toLocaleString()} ₫. Current price: ${stock.price.toLocaleString()} ₫ (${stock.changePercent > 0 ? "+" : ""}${stock.changePercent}%).`;
}

export async function buildAiContext(question: string): Promise<string> {
  const market = await getMarketSnapshot();
  const stocks = await getAllStocks();
  const mentioned = stocks.filter(
    (s) =>
      question.toUpperCase().includes(s.symbol) ||
      question.toUpperCase().includes(s.name.toUpperCase()),
  );

  const vnindex = market.indices.find((i) => i.symbol === "VNINDEX");
  let ctx = `Market session: ${market.session}\nLast updated: ${market.lastUpdated}\n`;
  if (vnindex) {
    ctx += `VNINDEX: ${vnindex.value} (${vnindex.changePercent > 0 ? "+" : ""}${vnindex.changePercent}%)\n`;
  }
  ctx += `Sentiment: ${market.sentiment} (${market.sentimentScore}%)\n`;
  ctx += `Foreign net buy: ${market.stats.foreignNetBuy} tỷ VND\n\n`;

  if (mentioned.length) {
    for (const s of mentioned) {
      ctx += `--- ${s.symbol} (${s.name}) ---\n`;
      ctx += `Price: ${s.price.toLocaleString()} VND (${s.changePercent}%)\n`;
      ctx += `Sector: ${s.sector} | Exchange: ${s.exchange}\n`;
      ctx += `PE: ${s.pe || "N/A"} | PB: ${s.pb} | ROE: ${s.roe}% | RSI: ${s.rsi}\n`;
      ctx += `Revenue Growth: ${s.revenueGrowth}% | Div Yield: ${s.dividendYield}%\n`;
      ctx += `Analyst: ${s.analystRating} | Target: ${s.analystTarget.toLocaleString()} VND\n`;
      ctx += `Profile: ${s.profile}\n\n`;
    }
  } else {
    const top = [...stocks]
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 8);
    ctx += "Top movers today:\n";
    for (const s of top) {
      ctx += `- ${s.symbol}: ${s.price.toLocaleString()} VND (${s.changePercent}%)\n`;
    }
  }

  return ctx;
}

// Sync exports for pages that import from @/lib/stocks
export { syncMarketData as refreshMarketData };
