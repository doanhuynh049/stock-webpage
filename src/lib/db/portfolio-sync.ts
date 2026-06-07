import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/prisma-query";

export type PortfolioHoldingInput = {
  symbol: string;
  name?: string | null;
  exchange?: string | null;
  sector?: string | null;
  industry?: string | null;
  shares: number;
  avgBuyPrice?: number | null;
  target3Month?: number | null;
  targetLongTerm?: number | null;
  targetSetDate?: string | null;
  platform?: string | null;
};

export async function listPortfolioHoldings(userId: string) {
  return withDbRetry(
    () =>
      prisma.portfolioHolding.findMany({
        where: { userId, shares: { gt: 0 } },
        orderBy: { symbol: "asc" },
      }),
    "portfolio-list",
    0,
  );
}

/** Full replace sync — mirrors stock-service replacePortfolioHoldings. */
export async function syncPortfolioHoldings(
  userId: string,
  incoming: PortfolioHoldingInput[],
) {
  const rows = (incoming ?? []).filter(
    (h) => h.symbol?.trim() && Number(h.shares) > 0,
  );
  const symbols = rows.map((h) => h.symbol.toUpperCase());

  await withDbRetry(
    async () => {
      await prisma.$transaction(async (tx) => {
        if (symbols.length === 0) {
          await tx.portfolioHolding.deleteMany({ where: { userId } });
          return;
        }

        for (const h of rows) {
          const sym = h.symbol.toUpperCase();
          await tx.portfolioHolding.upsert({
            where: { userId_symbol: { userId, symbol: sym } },
            create: {
              userId,
              symbol: sym,
              name: h.name ?? null,
              exchange: h.exchange ?? null,
              sector: h.sector ?? null,
              industry: h.industry ?? null,
              shares: h.shares,
              avgBuyPrice: h.avgBuyPrice ?? null,
              target3Month: h.target3Month ?? null,
              targetLongTerm: h.targetLongTerm ?? null,
              targetSetDate: h.targetSetDate ?? null,
              platform: h.platform ?? null,
            },
            update: {
              name: h.name ?? null,
              exchange: h.exchange ?? null,
              sector: h.sector ?? null,
              industry: h.industry ?? null,
              shares: h.shares,
              avgBuyPrice: h.avgBuyPrice ?? null,
              target3Month: h.target3Month ?? null,
              targetLongTerm: h.targetLongTerm ?? null,
              targetSetDate: h.targetSetDate ?? null,
              platform: h.platform ?? null,
            },
          });
        }

        await tx.portfolioHolding.deleteMany({
          where: {
            userId,
            symbol: { notIn: symbols },
          },
        });
      });
    },
    "portfolio-sync",
    0,
  );

  return symbols.length;
}
