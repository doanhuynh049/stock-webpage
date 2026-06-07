#!/usr/bin/env npx tsx
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const uid = process.env.CACHE_USER_ID ?? "148e4bc6-7f91-440e-b407-9f5e4a22706f";
  const prefix = `${uid}__`;
  const [prefixed, total, sample] = await Promise.all([
    prisma.tradingTransaction.count({ where: { id: { startsWith: prefix } } }),
    prisma.tradingTransaction.count(),
    prisma.tradingTransaction.findMany({
      take: 8,
      orderBy: { transactionDate: "desc" },
    }),
  ]);
  console.log("userId", uid);
  console.log("prefixed count", prefixed);
  console.log("total count", total);
  for (const r of sample) {
    console.log(
      r.id,
      r.transactionDate.toISOString().slice(0, 10),
      r.transactionType,
      r.itemName,
      r.quantity,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
