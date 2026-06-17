import type { PricePoint } from "@/types/stock";

type YahooMeta = {
  regularMarketPrice?: number;
  previousClose?: number;
  regularMarketVolume?: number;
};

export type YahooQuote = {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
};

async function fetchChart(symbol: string, range: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; VNStocks/1.0)" },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.chart?.result?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function fetchYahooQuote(ticker: string): Promise<YahooQuote | null> {
  const result = await fetchChart(`${ticker}.VN`, "5d");
  if (!result) return null;

  const meta = result.meta as YahooMeta;
  const price = meta.regularMarketPrice;
  const prev = meta.previousClose ?? price;
  if (!price) return null;

  const change = price - (prev ?? price);
  const changePercent = prev ? (change / prev) * 100 : 0;

  return {
    symbol: ticker.toUpperCase(),
    price,
    change: Math.round(change),
    changePercent: Math.round(changePercent * 100) / 100,
    volume: meta.regularMarketVolume ?? 0,
  };
}

export async function fetchYahooHistory(
  ticker: string,
  days = 90,
): Promise<PricePoint[]> {
  const range =
    days <= 30 ? "1mo" :
    days <= 90 ? "3mo" :
    days <= 180 ? "6mo" :
    days <= 365 ? "1y" : "2y";
  const result = await fetchChart(`${ticker}.VN`, range);
  if (!result?.timestamp?.length) return [];

  const { timestamp, indicators } = result;
  const q = indicators?.quote?.[0];
  if (!q) return [];

  const points: PricePoint[] = [];
  for (let i = 0; i < timestamp.length; i++) {
    if (q.close[i] == null) continue;
    points.push({
      date: new Date(timestamp[i] * 1000).toISOString().split("T")[0],
      open: q.open[i] ?? q.close[i],
      high: q.high[i] ?? q.close[i],
      low: q.low[i] ?? q.close[i],
      close: q.close[i],
      volume: q.volume[i] ?? 0,
    });
  }
  return points;
}
