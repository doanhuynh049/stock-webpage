/**
 * TCBS public API — company overview and profile data.
 *
 * Used to resolve real company names and ICB sectors for stocks not found in
 * curated JSON files (VN30/VN100 metadata). This avoids LLM hallucination
 * about company identity (e.g. mistaking HHV for a real estate company).
 *
 * API: https://apipubaws.tcbs.com.vn/tcanalysis/v1/ticker/{symbol}/overview
 */

const TCBS_BASE = "https://apipubaws.tcbs.com.vn/tcanalysis/v1";
const HEADERS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

export interface TcbsCompanyOverview {
  ticker: string;
  /** Vietnamese company name */
  organName: string;
  /** English company name */
  organNameEn: string;
  /** ICB level-3 sector label  (e.g. "Industrial Transportation") */
  icbName3: string;
  /** ICB level-4 sector label, more specific (e.g. "Transportation Infrastructure") */
  icbName4: string;
  /** ICB numeric code (e.g. "2020") */
  icbCode: string;
  /** Exchange as reported by TCBS (typically "HOSE", "HNX", "UPCOM") */
  exchange: string;
}

// Raw shape returned by TCBS (fields we care about)
interface TcbsRaw {
  ticker?: string;
  organName?: string;
  organNameEn?: string;
  icbName3?: string;
  icbName4?: string;
  icbCode?: string;
  exchange?: string;
  listingDate?: string;
}

/**
 * Maps TCBS ICB sector names to the simplified sector vocabulary used in this app.
 */
function normalizeSector(icbName3: string, icbName4: string): string {
  const text = `${icbName3} ${icbName4}`.toLowerCase();

  if (text.includes("bank") || text.includes("banking")) return "Banking";
  if (text.includes("securities") || text.includes("brokerage")) return "Securities";
  if (text.includes("insurance")) return "Insurance";
  if (
    text.includes("financial") ||
    text.includes("investment") ||
    text.includes("asset management")
  )
    return "Financial Services";
  if (
    text.includes("software") ||
    text.includes("technology") ||
    text.includes("telecom") ||
    text.includes("it service")
  )
    return "Technology";
  if (
    text.includes("real estate") ||
    text.includes("property") ||
    text.includes("housing")
  )
    return "Real Estate";
  if (
    text.includes("construction") ||
    text.includes("building material") ||
    text.includes("cement")
  )
    return "Construction";
  if (
    text.includes("transport") ||
    text.includes("infrastructure") ||
    text.includes("highway") ||
    text.includes("port") ||
    text.includes("airport") ||
    text.includes("logistics")
  )
    return "Infrastructure";
  if (text.includes("oil") || text.includes("gas") || text.includes("petroleum"))
    return "Energy";
  if (text.includes("electric") || text.includes("power") || text.includes("utilities"))
    return "Utilities";
  if (text.includes("pharma") || text.includes("health") || text.includes("hospital"))
    return "Healthcare";
  if (
    text.includes("food") ||
    text.includes("beverage") ||
    text.includes("consumer") ||
    text.includes("retail")
  )
    return "Consumer Goods";
  if (text.includes("agri") || text.includes("fish") || text.includes("seafood"))
    return "Agriculture";
  if (text.includes("steel") || text.includes("metal") || text.includes("mining"))
    return "Materials";
  if (text.includes("industrial") || text.includes("manufacturing"))
    return "Industrial";

  // Return the raw ICB name if we can't map it
  return icbName3 || icbName4 || "Industrial";
}

/**
 * Fetches real company overview data from TCBS.
 * Returns null on network error or unknown ticker.
 */
export async function fetchTcbsCompanyOverview(
  symbol: string,
): Promise<TcbsCompanyOverview | null> {
  const sym = symbol.toUpperCase();
  try {
    const res = await fetch(`${TCBS_BASE}/ticker/${sym}/overview`, {
      headers: HEADERS,
      next: { revalidate: 3600 }, // 1-hour CDN cache — overview data rarely changes
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as TcbsRaw;

    // TCBS returns an error object (not 4xx) for unknown tickers
    if (!raw.ticker && !raw.organName) return null;

    return {
      ticker: raw.ticker ?? sym,
      organName: raw.organName ?? "",
      organNameEn: raw.organNameEn ?? "",
      icbName3: raw.icbName3 ?? "",
      icbName4: raw.icbName4 ?? "",
      icbCode: raw.icbCode ?? "",
      exchange: (raw.exchange ?? "HOSE").toUpperCase(),
    };
  } catch {
    return null;
  }
}

/**
 * Returns a simplified StockMeta-compatible object built from TCBS data.
 * Returns null if TCBS doesn't know the ticker.
 */
export async function getTcbsStockMeta(symbol: string): Promise<{
  name: string;
  nameVi: string;
  sector: string;
  exchange: "HOSE" | "HNX" | "UPCOM";
  profile: string;
} | null> {
  const overview = await fetchTcbsCompanyOverview(symbol);
  if (!overview || (!overview.organName && !overview.organNameEn)) return null;

  const name =
    overview.organNameEn.trim() ||
    overview.organName.trim() ||
    symbol;

  const sector = normalizeSector(overview.icbName3, overview.icbName4);

  const validExchanges = new Set(["HOSE", "HNX", "UPCOM"]);
  const exchange = validExchanges.has(overview.exchange)
    ? (overview.exchange as "HOSE" | "HNX" | "UPCOM")
    : "HOSE";

  const profile =
    `${name} (${symbol}) is a Vietnamese company operating in the ${sector} sector ` +
    `(${overview.icbName4 || overview.icbName3}), listed on ${exchange}.` +
    (overview.organName ? ` Vietnamese name: ${overview.organName}.` : "");

  return { name, nameVi: overview.organName, sector, exchange, profile };
}
