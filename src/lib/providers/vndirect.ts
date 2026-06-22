/**
 * VNDirect finfo API — fetches live fundamental ratios for Vietnamese listed stocks.
 * Endpoint: api-finfo.vndirect.com.vn/v4/ratios
 *
 * Available ratio codes (market data + valuations):
 *   PRICE_TO_EARNINGS, PRICE_TO_BOOK, DIVIDEND_YIELD, MARKETCAP,
 *   BVPS_CR, BETA, PRICE_HIGHEST_CR_52W, PRICE_LOWEST_CR_52W,
 *   PRICE_CHG_PCT_CR_1Y, FOREIGN_OWNERSHIP, OUTSTANDING_SHARES
 */

const BASE = "https://api-finfo.vndirect.com.vn/v4";
const HEADERS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

const RATIO_CODES = [
  "PRICE_TO_EARNINGS",
  "PRICE_TO_BOOK",
  "DIVIDEND_YIELD",
  "MARKETCAP",
  "BVPS_CR",
  "BETA",
  "PRICE_HIGHEST_CR_52W",
  "PRICE_LOWEST_CR_52W",
  "OUTSTANDING_SHARES",
].join(",");

export type VNDirectFundamentals = {
  pe: number;
  pb: number;
  dividendYield: number;
  marketCapVnd: number;
  bvps: number;
  beta: number;
  high52w: number;
  low52w: number;
  outstandingShares: number;
  /** Derived: ROE ≈ PB / PE (accounting identity: ROE = Book Value / Earnings = PB/PE) */
  roeApprox: number;
};

type RatioItem = {
  ratioCode: string;
  value: number;
};

type RatiosResponse = {
  data: RatioItem[];
  totalElements: number;
};

export async function fetchVNDirectFundamentals(
  symbol: string,
): Promise<VNDirectFundamentals | null> {
  const sym = symbol.toUpperCase();
  const url = `${BASE}/ratios?q=code:${sym}~ratioCode:${encodeURIComponent(RATIO_CODES)}&size=${RATIO_CODES.split(",").length + 5}&sort=reportDate:DESC`;

  try {
    const res = await fetch(url, {
      headers: HEADERS,
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as RatiosResponse;
    if (!json.data?.length) return null;

    const map: Record<string, number> = {};
    for (const item of json.data) {
      if (item.ratioCode && !(item.ratioCode in map)) {
        map[item.ratioCode] = item.value;
      }
    }

    const pe = map["PRICE_TO_EARNINGS"] ?? 0;
    const pb = map["PRICE_TO_BOOK"] ?? 0;

    if (pe <= 0 && pb <= 0) return null;

    const roeApprox = pe > 0 && pb > 0 ? Math.round((pb / pe) * 1000) / 10 : 0;

    return {
      pe: Math.round(pe * 10) / 10,
      pb: Math.round(pb * 100) / 100,
      dividendYield: Math.round((map["DIVIDEND_YIELD"] ?? 0) * 10000) / 100,
      marketCapVnd: map["MARKETCAP"] ?? 0,
      bvps: map["BVPS_CR"] ?? 0,
      beta: Math.round((map["BETA"] ?? 0) * 100) / 100,
      high52w: map["PRICE_HIGHEST_CR_52W"] ?? 0,
      low52w: map["PRICE_LOWEST_CR_52W"] ?? 0,
      outstandingShares: map["OUTSTANDING_SHARES"] ?? 0,
      roeApprox,
    };
  } catch {
    return null;
  }
}
