import type { PricePoint } from "@/types/stock";

const BASE = "https://services.entrade.com.vn/chart-api/v2/ohlcs";
const HEADERS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (compatible; VNStocks/1.0; +https://github.com/vn-stocks)",
  Referer: "https://www.dnse.com.vn/",
};

type OhlcResponse = {
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
};

export type EntradeQuote = {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  open: number;
  high: number;
  low: number;
  date: string;
};

async function fetchOhlc(
  type: "stock" | "index",
  symbol: string,
  days: number,
): Promise<OhlcResponse | null> {
  const now = Math.floor(Date.now() / 1000);
  const from = now - days * 86400;
  const url = `${BASE}/${type}?symbol=${encodeURIComponent(symbol)}&resolution=1D&from=${from}&to=${now}`;

  try {
    const res = await fetch(url, {
      headers: HEADERS,
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as OhlcResponse;
    if (!data.c?.length) return null;
    return data;
  } catch {
    return null;
  }
}

function toVnd(price: number, isIndex: boolean): number {
  return isIndex ? price : Math.round(price * 1000);
}

export async function fetchStockQuote(symbol: string): Promise<EntradeQuote | null> {
  const data = await fetchOhlc("stock", symbol, 10);
  if (!data || data.c.length < 1) return null;

  const i = data.c.length - 1;
  const close = toVnd(data.c[i], false);
  const prev = i > 0 ? toVnd(data.c[i - 1], false) : close;
  const change = close - prev;
  const changePercent = prev > 0 ? (change / prev) * 100 : 0;

  return {
    symbol: symbol.toUpperCase(),
    price: close,
    change,
    changePercent: Math.round(changePercent * 100) / 100,
    volume: data.v[i] ?? 0,
    open: toVnd(data.o[i], false),
    high: toVnd(data.h[i], false),
    low: toVnd(data.l[i], false),
    date: new Date(data.t[i] * 1000).toISOString().split("T")[0],
  };
}

export async function fetchIndexQuote(
  symbol: string,
): Promise<EntradeQuote | null> {
  const data = await fetchOhlc("index", symbol, 10);
  if (!data || data.c.length < 1) return null;

  const i = data.c.length - 1;
  const close = data.c[i];
  const prev = i > 0 ? data.c[i - 1] : close;
  const change = Math.round((close - prev) * 100) / 100;
  const changePercent =
    prev > 0 ? Math.round(((change / prev) * 100) * 100) / 100 : 0;

  return {
    symbol: symbol.toUpperCase(),
    price: close,
    change,
    changePercent,
    volume: data.v[i] ?? 0,
    open: data.o[i],
    high: data.h[i],
    low: data.l[i],
    date: new Date(data.t[i] * 1000).toISOString().split("T")[0],
  };
}

export async function fetchStockHistory(
  symbol: string,
  days = 90,
): Promise<PricePoint[]> {
  const data = await fetchOhlc("stock", symbol, days + 10);
  if (!data) return [];

  return data.t.map((ts, i) => ({
    date: new Date(ts * 1000).toISOString().split("T")[0],
    open: toVnd(data.o[i], false),
    high: toVnd(data.h[i], false),
    low: toVnd(data.l[i], false),
    close: toVnd(data.c[i], false),
    volume: data.v[i] ?? 0,
  }));
}

export const ENTRADE_INDEX_MAP: Record<string, string> = {
  VNINDEX: "VNINDEX",
  HNXINDEX: "HNX",
  UPCOM: "UPCOM",
};
