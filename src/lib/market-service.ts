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
  type EntradeQuote,
} from "@/lib/providers/entrade";
import { fetchYahooHistory, fetchYahooQuote } from "@/lib/providers/yahoo";
import {
  readCachedFundamentalSnapshot,
  readCachedTechnicalSnapshot,
} from "@/lib/db/neon-cache";
import { lookupIndexStock } from "@/lib/stock-metadata";
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
  {
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    high?: number;
    low?: number;
  }
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

function priceKToVnd(k: number): number {
  return k > 0 && k < 500 ? Math.round(k * 1000) : k;
}

async function enrichStockDetails(stock: Stock): Promise<Stock> {
  const meta = lookupIndexStock(stock.symbol);
  let s = { ...stock };

  if (meta) {
    s.name = meta.name;
    s.sector = meta.sector;
    if (
      meta.exchange === "HOSE" ||
      meta.exchange === "HNX" ||
      meta.exchange === "UPCOM"
    ) {
      s.exchange = meta.exchange;
    }
    if (!s.profile) {
      s.profile = `${meta.name} (${meta.symbol}) operates in the ${meta.sector} sector on ${s.exchange}.`;
    }
  }

  const fund = readCachedFundamentalSnapshot(stock.symbol);
  const tech = readCachedTechnicalSnapshot(stock.symbol);

  if (fund) {
    if (fund.pe_ratio != null && fund.pe_ratio > 0) s.pe = fund.pe_ratio;
    if (fund.pb_ratio != null && fund.pb_ratio > 0) s.pb = fund.pb_ratio;
    if (fund.roe != null) s.roe = Math.round(fund.roe * 1000) / 10;
    if (fund.revenue_growth != null) {
      s.revenueGrowth = Math.round(fund.revenue_growth * 1000) / 10;
    }
  }

  if (tech) {
    if (tech.rsi != null) s.rsi = Math.round(tech.rsi * 10) / 10;
    if (tech.volume != null) s.volume = tech.volume;
    const px = tech.price ?? 0;
    if (tech.support_level != null) {
      s.low52w = priceKToVnd(
        Math.min(tech.support_level, px || tech.support_level),
      );
    }
    if (tech.resistance_level != null) {
      s.high52w = priceKToVnd(
        Math.max(tech.resistance_level, px || tech.resistance_level),
      );
      if (s.analystTarget === 0) {
        s.analystTarget = priceKToVnd(tech.resistance_level);
        s.analystRating = s.pe > 0 && s.pe < 20 ? "Buy" : "Hold";
      }
    }
  }

  if (!s.high52w || !s.low52w || s.high52w <= s.low52w) {
    const hist = await fetchStockHistory(stock.symbol, 252);
    if (hist.length >= 10) {
      const closes = hist.map((h) => h.close);
      s.high52w = Math.max(...closes);
      s.low52w = Math.min(...closes);
    }
  }

  return s;
}

function minimalStockFromQuote(sym: string, quote: EntradeQuote): Stock {
  return {
    symbol: sym,
    name: sym,
    sector: "Unknown",
    exchange: "HOSE",
    price: quote.price,
    change: quote.change,
    changePercent: quote.changePercent,
    volume: quote.volume,
    marketCap: 0,
    pe: 0,
    pb: 0,
    roe: 0,
    revenueGrowth: 0,
    rsi: 50,
    dividendYield: 0,
    high52w: quote.high,
    low52w: quote.low,
    analystRating: "Hold",
    analystTarget: 0,
    profile: "",
    financials: { years: [], revenue: [], netProfit: [], totalDebt: [] },
  };
}

/** Batch price lookup — seed cache first, then Entrade for missing symbols (ETFs, portfolio tickers). */
export async function getQuotesForSymbols(
  symbols: string[],
): Promise<Record<string, number>> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))];
  if (!unique.length) return {};

  const quotes = await getQuotes();
  const out: Record<string, number> = {};
  const missing: string[] = [];

  for (const sym of unique) {
    const q = quotes[sym];
    if (q?.price > 0) out[sym] = q.price;
    else missing.push(sym);
  }

  if (missing.length) {
    const fetched = await Promise.all(
      missing.map(async (sym) => {
        let quote = await fetchStockQuote(sym);
        if (!quote?.price) {
          const yq = await fetchYahooQuote(sym);
          if (yq?.price) {
            quote = {
              symbol: sym,
              price: yq.price,
              change: yq.change,
              changePercent: yq.changePercent,
              volume: yq.volume,
              open: yq.price,
              high: yq.price,
              low: yq.price,
              date: new Date().toISOString().slice(0, 10),
            };
          }
        }
        return quote && quote.price > 0 ? ([sym, quote.price] as const) : null;
      }),
    );
    for (const row of fetched) {
      if (row) out[row[0]] = row[1];
    }
  }

  return out;
}

export async function getStock(symbol: string): Promise<Stock | undefined> {
  const sym = symbol.toUpperCase();
  const seed = seedStockList.find((s) => s.symbol === sym);
  const quotes = await getQuotes();
  const cached = quotes[sym];
  if (seed) return enrichStockDetails(mergeStockWithQuote(seed, cached));

  if (cached?.price > 0) {
    return enrichStockDetails(
      minimalStockFromQuote(sym, {
        symbol: sym,
        price: cached.price,
        change: cached.change,
        changePercent: cached.changePercent,
        volume: cached.volume,
        open: cached.price,
        high: cached.high ?? cached.price,
        low: cached.low ?? cached.price,
        date: new Date().toISOString().slice(0, 10),
      }),
    );
  }

  const live = await fetchStockQuote(sym);
  if (live?.price) return enrichStockDetails(minimalStockFromQuote(sym, live));

  const yq = await fetchYahooQuote(sym);
  if (yq?.price) {
    return enrichStockDetails(
      minimalStockFromQuote(sym, {
        symbol: sym,
        price: yq.price,
        change: yq.change,
        changePercent: yq.changePercent,
        volume: yq.volume,
        open: yq.price,
        high: yq.price,
        low: yq.price,
        date: new Date().toISOString().slice(0, 10),
      }),
    );
  }

  return undefined;
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
    if (
      filters.maxPe != null &&
      filters.maxPe > 0 &&
      s.pe > 0 &&
      s.pe > filters.maxPe
    ) {
      return false;
    }
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
  const { shouldSkipDbReads } = await import("@/lib/db/cache-first");

  if (!shouldSkipDbReads()) {
    const dbHistory = await getDbPriceHistory(symbol, days);
    if (dbHistory.length >= 5) return dbHistory;
  } else {
    const cached = await getDbPriceHistory(symbol, days);
    if (cached.length >= 5) return cached;
  }

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
    const { analyzeStock } = await import("@/lib/analysis/stock-analysis");
    for (const s of mentioned) {
      ctx += `--- ${s.symbol} (${s.name}) ---\n`;
      ctx += `Price: ${s.price.toLocaleString()} VND (${s.changePercent}%)\n`;
      ctx += `Sector: ${s.sector} | Exchange: ${s.exchange}\n`;
      ctx += `PE: ${s.pe || "N/A"} | PB: ${s.pb} | ROE: ${s.roe}% | RSI: ${s.rsi}\n`;
      ctx += `Revenue Growth: ${s.revenueGrowth}% | Div Yield: ${s.dividendYield}%\n`;
      ctx += `Analyst: ${s.analystRating} | Target: ${s.analystTarget.toLocaleString()} VND\n`;
      ctx += `Profile: ${s.profile}\n`;
      try {
        const a = await analyzeStock(s);
        ctx += `Technical: ${a.technicalScore} (${a.technicalRating}) | Fundamental: ${a.fundamentalScore}\n`;
        ctx += `Combined: ${a.combinedScore} — ${a.recommendation}\n`;
        ctx += `Trend: ${a.maTrend} | Momentum: ${a.momentum}\n`;
        ctx += `Levels: ${a.supportResistance}\n`;
      } catch {
        /* analysis optional */
      }
      ctx += "\n";
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
