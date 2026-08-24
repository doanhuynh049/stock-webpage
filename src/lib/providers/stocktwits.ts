const UA = "Mozilla/5.0 (compatible; VNStocks/1.0)";
const BASE = "https://api.stocktwits.com/api/2";

/**
 * Stocktwits public symbol stream — free, no API key, no auth. Chosen over
 * Reddit/X because: Reddit's public JSON endpoints are unreliable from
 * server IPs (aggressive datacenter blocking) and X's search API has no
 * free tier anymore. Stocktwits is finance-specific and returns an
 * explicit bullish/bearish tag per message, which is exactly the signal
 * this module needs — no sentiment inference required on our side.
 *
 * CONFIRMED VIA LIVE CHECK (Aug 2026), not a theoretical concern: Stocktwits
 * has no Vietnamese-exchange listings, so a VN ticker string frequently
 * collides with an unrelated US-listed security of the same symbol —
 * `FPT` resolved to "Federated Premier Intermediate Municipal Income Fund"
 * (NYSE), `MWG` to "Multi Ways Holdings Ltd", `VNM` to the VanEck Vietnam
 * ETF — none of these are the Vietnamese company. Genuinely-unlisted
 * tickers (e.g. `HPG`, `VCB`) correctly 404. This module refuses to return
 * messages for any symbol Stocktwits resolves outside `region: "VN"` (which
 * it will realistically never have) — in practice this means real VN
 * equities will almost always come back empty here. That's the honest
 * result of Stocktwits not covering this market, not a bug to "fix" by
 * loosening the check — loosening it would misattribute a different
 * company's chatter to the ticker being analyzed.
 */

export type StocktwitsMessage = {
  id: number;
  body: string;
  createdAt: string; // ISO
  sentiment: "Bullish" | "Bearish" | null; // null = poster didn't tag one
  userId: number;
  userJoinedAt: string | null; // ISO, null if missing from payload
};

type StocktwitsRawMessage = {
  id: number;
  body: string;
  created_at: string;
  entities?: { sentiment?: { basic?: "Bullish" | "Bearish" } | null };
  user?: { id: number; join_date?: string };
};

type StocktwitsStreamResponse = {
  response?: { status: number };
  symbol?: { region?: string; exchange?: string; title?: string } | null;
  messages?: StocktwitsRawMessage[];
};

/**
 * Fetches the most recent public messages for a symbol. Returns `null` on
 * any failure (network, non-200, symbol has no stream, rate-limited) —
 * callers must treat `null` as "no social data available," never as zero
 * posts / 0% sentiment.
 */
export async function fetchStocktwitsMessages(symbol: string): Promise<StocktwitsMessage[] | null> {
  try {
    const res = await fetch(`${BASE}/streams/symbol/${encodeURIComponent(symbol.toUpperCase())}.json`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as StocktwitsStreamResponse;

    // Ticker collision guard — see module doc comment. If Stocktwits
    // resolved the symbol to a market outside Vietnam, it's a different
    // company; report "no data" rather than someone else's chatter.
    if (data.symbol && data.symbol.region && data.symbol.region !== "VN") return [];

    if (!data.messages?.length) return [];
    return data.messages.map((m) => ({
      id: m.id,
      body: m.body ?? "",
      createdAt: m.created_at,
      sentiment: m.entities?.sentiment?.basic ?? null,
      userId: m.user?.id ?? 0,
      userJoinedAt: m.user?.join_date ?? null,
    }));
  } catch {
    return null;
  }
}
