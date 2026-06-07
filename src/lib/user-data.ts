import { auth } from "@/lib/auth";
import { shouldSkipDbReads } from "@/lib/db/cache-first";
import { readCachedWatchlist } from "@/lib/db/neon-cache";
import { getStock } from "@/lib/market-service";
import { isPersistenceEnabled } from "@/lib/persistence";
import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/prisma-query";

async function enrichWatchlist(
  items: Array<{ id?: string; symbol: string; userId?: string; createdAt?: Date }>,
) {
  return Promise.all(
    items.map(async (item) => ({
      ...item,
      stock: await getStock(item.symbol),
    })),
  );
}

async function fromWatchlistCache(userId: string) {
  const cached = readCachedWatchlist(userId);
  const items = (cached ?? []).map((r) => ({
    id: `${userId}-${r.symbol}`,
    userId: r.user_id,
    symbol: r.symbol,
    createdAt: r.created_at ? new Date(r.created_at) : new Date(),
  }));
  const enriched = await enrichWatchlist(items);
  return {
    isAuthenticated: true as const,
    items: enriched,
    fromCache: true as const,
  };
}

export async function getWatchlistWithStocks() {
  const session = await auth();
  if (!session?.user?.id) return { items: [], isAuthenticated: false };

  if (shouldSkipDbReads()) {
    return fromWatchlistCache(session.user.id);
  }

  if (!isPersistenceEnabled()) {
    return fromWatchlistCache(session.user.id);
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

    return {
      isAuthenticated: true,
      items: await enrichWatchlist(items),
    };
  } catch {
    return fromWatchlistCache(session.user.id);
  }
}

export async function isInWatchlist(symbol: string): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;

  const cached = readCachedWatchlist(session.user.id);
  if (cached?.some((r) => r.symbol.toUpperCase() === symbol.toUpperCase())) {
    return true;
  }

  if (shouldSkipDbReads() || !isPersistenceEnabled()) return false;

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
      0,
    );
    return !!item;
  } catch {
    return false;
  }
}

export async function getAiChatSessions() {
  const session = await auth();
  if (!session?.user?.id) return [];
  if (!isPersistenceEnabled() || shouldSkipDbReads()) return [];

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
      0,
    );
  } catch {
    return [];
  }
}
