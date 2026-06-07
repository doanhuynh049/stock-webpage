import { auth } from "@/lib/auth";
import { getStock } from "@/lib/market-service";
import { isPersistenceEnabled } from "@/lib/persistence";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/prisma-query";

export async function getWatchlistWithStocks() {
  const session = await auth();
  if (!session?.user?.id) return { items: [], isAuthenticated: false };
  if (!isPersistenceEnabled()) {
    return { isAuthenticated: true, items: [], dbUnavailable: true };
  }

  try {
    const items = await withDbRetry(
      () =>
        prisma.watchlistItem.findMany({
          where: { userId: session.user!.id },
          orderBy: { createdAt: "desc" },
        }),
      "watchlist",
      0,
    );

    const enriched = await Promise.all(
      items.map(async (item) => ({
        ...item,
        stock: await getStock(item.symbol),
      })),
    );

    return { isAuthenticated: true, items: enriched };
  } catch (error) {
    console.warn("[getWatchlistWithStocks] DB unavailable:", (error as Error).message);
    return { isAuthenticated: true, items: [], dbUnavailable: true };
  }
}

export async function isInWatchlist(symbol: string): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;
  if (!isPersistenceEnabled()) return false;

  try {
    const item = await withDbRetry(
      () =>
        prisma.watchlistItem.findUnique({
          where: {
            userId_symbol: {
              userId: session.user!.id,
              symbol: symbol.toUpperCase(),
            },
          },
        }),
      "watchlist-check",
      1,
    );
    return !!item;
  } catch {
    return false;
  }
}

export async function getAiChatSessions() {
  const session = await auth();
  if (!session?.user?.id) return [];
  if (!isPersistenceEnabled()) return [];

  try {
    return await withDbRetry(
      () =>
        prisma.aiChatSession.findMany({
          where: { userId: session.user!.id },
          include: {
            messages: { orderBy: { createdAt: "asc" }, take: 20 },
          },
          orderBy: { updatedAt: "desc" },
          take: 10,
        }),
      "ai-sessions",
    );
  } catch (error) {
    console.error("[getAiChatSessions]", error);
    return [];
  }
}
