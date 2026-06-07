import type { PortfolioHolding } from "@/lib/db/advisory-portfolio";
import { getQuotesForSymbols } from "@/lib/market-service";

/** Market quotes are full VND; portfolio prices are thousands (K). */
export type EnrichedHolding = PortfolioHolding & {
  currentPriceK: number | null;
  currentValueK: number | null;
  gainLossK: number | null;
  gainPct: number | null;
  toTargetPct: number | null;
};

export async function enrichHoldings(
  holdings: PortfolioHolding[],
): Promise<EnrichedHolding[]> {
  if (!holdings.length) return [];

  const priceMap = await getQuotesForSymbols(holdings.map((h) => h.symbol));

  return holdings.map((h) => {
    const sym = h.symbol.toUpperCase();
    const priceVnd = priceMap[sym];
    const currentPriceK =
      priceVnd != null && priceVnd > 0 ? priceVnd / 1000 : null;

    let currentValueK: number | null = null;
    let gainLossK: number | null = null;
    let gainPct: number | null = null;
    let toTargetPct: number | null = null;

    if (currentPriceK != null) {
      currentValueK = currentPriceK * h.shares;
      gainLossK = (currentPriceK - h.avgBuyPrice) * h.shares;
      if (h.avgBuyPrice > 0) {
        gainPct = ((currentPriceK - h.avgBuyPrice) / h.avgBuyPrice) * 100;
      }
      if (
        h.target3Month != null &&
        h.target3Month > h.avgBuyPrice &&
        h.avgBuyPrice > 0
      ) {
        const raw =
          ((currentPriceK - h.avgBuyPrice) /
            (h.target3Month - h.avgBuyPrice)) *
          100;
        toTargetPct = Math.max(0, Math.min(100, raw));
      }
    }

    return {
      ...h,
      currentPriceK,
      currentValueK,
      gainLossK,
      gainPct,
      toTargetPct,
    };
  });
}
