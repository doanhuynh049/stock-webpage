import type { PortfolioHolding } from "@/lib/db/advisory-portfolio";
import { getStock } from "@/lib/market-service";

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
  return Promise.all(
    holdings.map(async (h) => {
      const stock = await getStock(h.symbol);
      const currentPriceK =
        stock?.price != null && stock.price > 0 ? stock.price / 1000 : null;

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
    }),
  );
}
