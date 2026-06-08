import fs from "fs/promises";
import path from "path";
import seedNews from "@/data/news.json";
import {
  fetchRss,
  googleMarketNewsRssUrl,
  googleSymbolNewsRssUrl,
  yahooHeadlineRssUrl,
  type RssItem,
} from "@/lib/providers/rss-news";
import type { NewsItem } from "@/types/stock";

const CACHE_DIR = path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "news.json");
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type NewsCachePayload = {
  syncedAt: string;
  market: NewsItem[];
  bySymbol: Record<string, NewsItem[]>;
};

const seedNewsList = seedNews as NewsItem[];

let memoryCache: NewsCachePayload | null = null;

function categorize(title: string, summary: string): NewsItem["category"] {
  const text = `${title} ${summary}`.toLowerCase();
  if (/earnings|profit|revenue|quarter|báo cáo|lợi nhuận/.test(text)) return "earnings";
  if (/sbv|fed|macro|lãi suất|interest|gdp|inflation|lạm phát/.test(text)) return "macro";
  if (/analysis|outlook|forecast|triển vọng|phân tích/.test(text)) return "analysis";
  if (/surge|drop|rally|crash|tăng|giảm|vượt đỉnh/.test(text)) return "breaking";
  return "analysis";
}

function rssToNewsItem(
  item: RssItem,
  symbols: string[],
  source: string,
): NewsItem {
  const displaySource = item.publisher
    ? `${source} · ${item.publisher}`
    : source;

  return {
    id: item.guid.slice(0, 64),
    title: item.title,
    summary:
      item.summary && item.summary !== item.title
        ? item.summary.slice(0, 400)
        : item.title,
    source: displaySource,
    publishedAt: item.publishedAt,
    symbols,
    category: categorize(item.title, item.summary),
    link: item.link || undefined,
  };
}

function dedupeNews(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const item of items) {
    const key = item.link || item.title;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

async function readCache(): Promise<NewsCachePayload | null> {
  if (memoryCache) return memoryCache;
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    memoryCache = JSON.parse(raw) as NewsCachePayload;
    return memoryCache;
  } catch {
    return null;
  }
}

async function writeCache(payload: NewsCachePayload) {
  memoryCache = payload;
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(payload, null, 2));
}

function isFresh(cache: NewsCachePayload | null): boolean {
  if (!cache?.syncedAt) return false;
  return Date.now() - new Date(cache.syncedAt).getTime() < CACHE_TTL_MS;
}

async function fetchSymbolNews(symbol: string): Promise<NewsItem[]> {
  const sym = symbol.toUpperCase();
  const [yahoo, google] = await Promise.all([
    fetchRss(yahooHeadlineRssUrl(sym)),
    fetchRss(googleSymbolNewsRssUrl(sym)),
  ]);

  const items = [
    ...yahoo.map((r) => rssToNewsItem(r, [sym], "Yahoo Finance")),
    ...google.map((r) => rssToNewsItem(r, [sym], "Google News")),
  ];
  return dedupeNews(items).slice(0, 15);
}

async function fetchMarketNews(): Promise<NewsItem[]> {
  const google = await fetchRss(googleMarketNewsRssUrl());
  const items = google.map((r) =>
    rssToNewsItem(r, [], "Google News"),
  );
  return dedupeNews(items).slice(0, 25);
}

async function refreshNewsCache(symbol?: string): Promise<NewsCachePayload> {
  const existing = (await readCache()) ?? {
    syncedAt: new Date(0).toISOString(),
    market: [],
    bySymbol: {},
  };

  const syncedAt = new Date().toISOString();

  if (symbol) {
    const sym = symbol.toUpperCase();
    const live = await fetchSymbolNews(sym);
    const merged = dedupeNews([
      ...live,
      ...seedNewsList.filter((n) => n.symbols.includes(sym)),
    ]);
    const payload: NewsCachePayload = {
      syncedAt,
      market: existing.market,
      bySymbol: { ...existing.bySymbol, [sym]: merged },
    };
    await writeCache(payload);
    return payload;
  }

  const [marketLive, ...symbolSamples] = await Promise.all([
    fetchMarketNews(),
    ...["FPT", "VCB", "HPG"].map((s) => fetchSymbolNews(s)),
  ]);

  const market = dedupeNews([...marketLive, ...seedNewsList]).slice(0, 30);
  const bySymbol: Record<string, NewsItem[]> = { ...existing.bySymbol };
  for (const batch of symbolSamples) {
    for (const item of batch) {
      for (const sym of item.symbols) {
        bySymbol[sym] = dedupeNews([...(bySymbol[sym] ?? []), item]);
      }
    }
  }

  const payload: NewsCachePayload = { syncedAt, market, bySymbol };
  await writeCache(payload);
  return payload;
}

/**
 * Live news with file cache fallback.
 * - Market: Google News RSS (VN) + seed data
 * - Symbol: Yahoo + Google RSS + seed filter
 */
export async function getNewsLive(symbol?: string): Promise<NewsItem[]> {
  const sym = symbol?.toUpperCase();
  let cache = await readCache();

  if (sym) {
    const cached = cache?.bySymbol[sym];
    if (isFresh(cache) && cached?.length) return cached;

    cache = await refreshNewsCache(sym);
    const live = cache.bySymbol[sym];
    if (live?.length) return live;

    return seedNewsList.filter((n) => n.symbols.includes(sym));
  }

  if (isFresh(cache) && cache?.market.length) return cache.market;

  cache = await refreshNewsCache();
  if (cache.market.length) return cache.market;

  return seedNewsList;
}

/** Force refresh (cron or ?refresh=true). */
export async function syncNews(symbol?: string): Promise<{
  syncedAt: string;
  count: number;
}> {
  const cache = await refreshNewsCache(symbol);
  const count = symbol
    ? (cache.bySymbol[symbol.toUpperCase()]?.length ?? 0)
    : cache.market.length;
  return { syncedAt: cache.syncedAt, count };
}
