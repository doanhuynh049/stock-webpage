/**
 * Short-swing screener — client-only fetch + scoring, shared between
 * `ShortSwingPanel` (Swing sub-tab, on-demand/custom tickers) and
 * `AnalysisView`'s background prefetch (warms the same result into
 * localStorage before the user opens the tab). See
 * `.cursor/rules/analysis-page-prefetch.mdc`.
 */

export type TechSignal = { indicator: string; value: number; signal: string };

export type MarketCtx = {
  vnIndexChange: number;
  topSectors: string[];
  sentiment: string;
};

export type SwingResult = {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  changePercent: number;
  rsi: number;
  high52w: number;
  // criteria (8 scored)
  aboveMA20: boolean; // C1 — price above MA20
  aboveMA50: boolean; // C2 — price above MA50
  rsiStrong: boolean; // C3 — RSI > 60
  volumeSpike: boolean; // C4 — volume ≥ 2× 20d avg
  near52wHigh: boolean; // C5 — within 15% of 52-week high
  outperformsMarket: boolean; // C6 — change% > VN-Index change%
  leadingSector: boolean; // C7 — sector in top 3 performers
  positiveMomentum: boolean; // C8 — positive daily change
  score: number;
  signal: "ENTRY" | "WATCH" | "SKIP";
  error?: string;
};

export type SwingScreenResult = {
  results: SwingResult[];
  marketCtx: MarketCtx | null;
};

export function buildSwingResult(
  stock: {
    symbol: string;
    name: string;
    sector: string;
    price: number;
    changePercent: number;
    rsi: number;
    high52w: number;
    analystRating?: string;
  },
  technicals: TechSignal[],
  ctx: MarketCtx | null,
): SwingResult {
  const sig = (ind: string) => technicals.find((t) => t.indicator === ind);
  const aboveMA20 = sig("MA 20")?.signal === "Bullish";
  const aboveMA50 = sig("MA 50")?.signal === "Bullish";
  const rsiStrong = stock.rsi > 60;
  const volumeSpike = sig("Volume Ratio")?.signal === "Bullish";
  const near52wHigh = stock.high52w > 0 && stock.price / stock.high52w > 0.85;
  const outperformsMarket = ctx != null && stock.changePercent > ctx.vnIndexChange;
  const leadingSector = ctx != null && ctx.topSectors.some(
    (s) => s.toLowerCase() === stock.sector.toLowerCase(),
  );
  const positiveMomentum = stock.changePercent > 0;

  const criteria = [aboveMA20, aboveMA50, rsiStrong, volumeSpike, near52wHigh, outperformsMarket, leadingSector, positiveMomentum];
  const score = criteria.filter(Boolean).length;
  const signal: SwingResult["signal"] = score >= 6 ? "ENTRY" : score >= 3 ? "WATCH" : "SKIP";

  return { symbol: stock.symbol, name: stock.name, sector: stock.sector, price: stock.price, changePercent: stock.changePercent, rsi: stock.rsi, high52w: stock.high52w, aboveMA20, aboveMA50, rsiStrong, volumeSpike, near52wHigh, outperformsMarket, leadingSector, positiveMomentum, score, signal };
}

/** Fetches market context once + per-symbol technicals in parallel, scores all 8 criteria, sorts desc by score. Client-only (relative fetch URLs). */
export async function runSwingScreen(symbols: string[]): Promise<SwingScreenResult> {
  if (!symbols.length) return { results: [], marketCtx: null };

  const [marketRes, ...stockSettled] = await Promise.allSettled([
    fetch("/api/market").then((r) => r.json()) as Promise<{
      market: { indices: { symbol: string; changePercent: number }[]; sectors: { sector: string; changePercent: number }[]; sentiment: string };
    }>,
    ...symbols.map(async (sym): Promise<SwingResult> => {
      const res = await fetch(`/api/stocks/${sym}?lite=true`);
      if (!res.ok) {
        return {
          symbol: sym, name: sym, sector: "—", price: 0, changePercent: 0, rsi: 0, high52w: 0,
          aboveMA20: false, aboveMA50: false, rsiStrong: false, volumeSpike: false,
          near52wHigh: false, outperformsMarket: false, leadingSector: false, positiveMomentum: false,
          score: 0, signal: "SKIP",
          error: res.status === 404 ? "Symbol not found" : "Fetch failed",
        };
      }
      const data = await res.json() as {
        stock: { symbol: string; name: string; sector: string; price: number; changePercent: number; rsi: number; high52w: number; analystRating?: string };
        technicals: TechSignal[];
      };
      return buildSwingResult(data.stock, data.technicals ?? [], null);
    }),
  ]);

  let ctx: MarketCtx | null = null;
  if (marketRes.status === "fulfilled") {
    const m = marketRes.value.market;
    const vnIdx = m.indices?.find((i) => i.symbol === "VNINDEX" || i.symbol === "VN-Index");
    const topSectors = [...(m.sectors ?? [])].sort((a, b) => b.changePercent - a.changePercent).slice(0, 3).map((s) => s.sector);
    ctx = { vnIndexChange: vnIdx?.changePercent ?? 0, topSectors, sentiment: m.sentiment ?? "Neutral" };
  }

  const rows: SwingResult[] = stockSettled.map((r) => {
    if (r.status === "rejected") {
      return {
        symbol: "ERR", name: "—", sector: "—", price: 0, changePercent: 0, rsi: 0, high52w: 0,
        aboveMA20: false, aboveMA50: false, rsiStrong: false, volumeSpike: false,
        near52wHigh: false, outperformsMarket: false, leadingSector: false, positiveMomentum: false,
        score: 0, signal: "SKIP" as const, error: "Unknown error",
      };
    }
    if (r.value.error) return r.value;
    // Re-build with market context now available
    return { ...r.value, outperformsMarket: ctx != null && r.value.changePercent > ctx.vnIndexChange, leadingSector: ctx != null && ctx.topSectors.some((s) => s.toLowerCase() === r.value.sector.toLowerCase()) };
  }).map((r) => {
    if (r.error) return r;
    const score = [r.aboveMA20, r.aboveMA50, r.rsiStrong, r.volumeSpike, r.near52wHigh, r.outperformsMarket, r.leadingSector, r.positiveMomentum].filter(Boolean).length;
    return { ...r, score, signal: (score >= 6 ? "ENTRY" : score >= 3 ? "WATCH" : "SKIP") as SwingResult["signal"] };
  });

  rows.sort((a, b) => b.score - a.score);
  return { results: rows, marketCtx: ctx };
}
