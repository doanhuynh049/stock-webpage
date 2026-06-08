#!/usr/bin/env npx tsx
/** Count trading_transaction + portfolio_holding rows in Neon. */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { isPersistenceEnabled } from "../src/lib/persistence";

async function main() {
  if (!isPersistenceEnabled()) {
    console.error("[probe-trades] PERSISTENCE_ENABLED=false or no DATABASE_URL");
    process.exit(1);
  }

  const [tradeCount, prefixedCount, legacyCount, portfolioCount, users] =
    await Promise.all([
      prisma.tradingTransaction.count(),
      prisma.tradingTransaction.count({
        where: { id: { contains: "__" } },
      }),
      prisma.tradingTransaction.count({
        where: { NOT: { id: { contains: "__" } } },
      }),
      prisma.portfolioHolding.count(),
      prisma.appUser.findMany({
        select: { id: true, email: true, username: true },
        take: 10,
      }),
    ]);

  console.log("[probe-trades] trading_transaction total:", tradeCount);
  console.log("[probe-trades]   with user prefix (__):", prefixedCount);
  console.log("[probe-trades]   legacy UUID (no __):", legacyCount);
  console.log("[probe-trades] portfolio_holding total:", portfolioCount);
  console.log("[probe-trades] app_user sample:", users);

  if (tradeCount > 0) {
    const sample = await prisma.tradingTransaction.findMany({
      take: 3,
      orderBy: { transactionDate: "desc" },
      select: {
        id: true,
        itemName: true,
        transactionType: true,
        transactionDate: true,
        quantity: true,
      },
    });
    console.log("[probe-trades] sample trades:", sample);
  }

  for (const u of users.slice(0, 3)) {
    const prefix = `${u.id}__`;
    const n = await prisma.tradingTransaction.count({
      where: { id: { startsWith: prefix } },
    });
    const ph = await prisma.portfolioHolding.count({ where: { userId: u.id } });
    console.log(`[probe-trades] user ${u.email ?? u.username}: trades=${n} holdings=${ph}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
