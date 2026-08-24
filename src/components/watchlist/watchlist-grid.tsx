"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ChangeBadge } from "@/components/stock/change-badge";
import { StockAvatar } from "@/components/ui/stock-avatar";
import { RemoveWatchlistButton } from "@/components/watchlist/remove-watchlist-button";
import { readLocalCache, LOCAL_CACHE_KEYS } from "@/lib/client/local-storage-cache";
import type { Stock } from "@/types/stock";

type AddPriceEntry = { price: number; addedAt: string };

type WatchlistItem = {
  symbol: string;
  stock?: Stock | null;
};

export function WatchlistGrid({ items }: { items: WatchlistItem[] }) {
  const [hidden, setHidden] = useState<string[]>([]);

  // Drop any optimistically-hidden symbol once it's actually gone from `items`
  // (adjusted during render — React's recommended pattern for "prune state
  // when a prop changes" — instead of a post-commit effect).
  const [prevItems, setPrevItems] = useState(items);
  if (items !== prevItems) {
    setPrevItems(items);
    setHidden((prev) => prev.filter((sym) => items.some((i) => i.symbol === sym)));
  }

  // Defer localStorage reads to client-side to avoid hydration mismatch —
  // SSR has no localStorage, so this must stay an effect (post-commit, after
  // the first hydration-matching render) rather than a useMemo/lazy-init,
  // which would run during the hydration render itself and diverge from SSR.
  const [addPrices, setAddPrices] = useState<Record<string, number | null>>({});
  useEffect(() => {
    const map: Record<string, number | null> = {};
    for (const item of items) {
      const entry = readLocalCache<AddPriceEntry>(
        LOCAL_CACHE_KEYS.watchlistAddPrice(item.symbol),
        Infinity,
      );
      map[item.symbol] = entry?.price ?? null;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional post-hydration client-only read, see comment above
    setAddPrices(map);
  }, [items]);

  const shown = items.filter((item) => !hidden.includes(item.symbol));

  if (shown.length === 0) {
    return (
      <Card>
        <div className="py-16 text-center">
          <Star className="mx-auto h-10 w-10 text-subtle" />
          <p className="mt-4 text-sm text-muted">Your watchlist is empty</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {shown.map((item) => {
        const stock = item.stock;
        const sector = stock?.sector;
        const name = stock?.name ?? item.symbol;
        const hasPrice = stock != null && stock.price > 0;
        const addPrice = addPrices[item.symbol] ?? null;
        const priceDiff =
          hasPrice && addPrice && addPrice > 0
            ? ((stock!.price - addPrice) / addPrice) * 100
            : null;

        return (
          <Card
            key={item.symbol}
            className="glass-card-hover group relative overflow-hidden transition-all"
          >
            <div className="flex items-start justify-between">
              <Link href={`/stocks/${item.symbol}`} className="flex items-center gap-3">
                <StockAvatar symbol={item.symbol} sector={sector} size="sm" />
                <div>
                  <div className="font-bold text-[var(--fg)] group-hover:text-accent">
                    {item.symbol}
                  </div>
                  <div className="text-xs text-muted">{name}</div>
                </div>
              </Link>
              <RemoveWatchlistButton
                symbol={item.symbol}
                onRemoved={() => setHidden((prev) => [...prev, item.symbol])}
                onRestore={() =>
                  setHidden((prev) => prev.filter((s) => s !== item.symbol))
                }
              />
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div>
                {hasPrice ? (
                  <>
                    <p className="font-mono text-2xl font-bold text-[var(--fg)]">
                      {stock!.price.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-subtle">₫</p>
                  </>
                ) : (
                  <p className="text-sm text-muted">Loading price…</p>
                )}
              </div>
              {hasPrice && <ChangeBadge value={stock!.changePercent} />}
            </div>
            {addPrice != null && addPrice > 0 && (
              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-subtle">
                <span>Added at:</span>
                <span className="font-mono">{addPrice.toLocaleString("vi-VN")} ₫</span>
                {priceDiff != null && (
                  <span
                    className={`font-data font-semibold ${
                      priceDiff >= 0 ? "text-gain" : "text-loss"
                    }`}
                  >
                    {priceDiff >= 0 ? "+" : ""}
                    {priceDiff.toFixed(2)}%
                  </span>
                )}
              </div>
            )}
            {stock && (
              <div className="mt-2 text-[10px] text-subtle">
                {stock.sector} · {stock.exchange}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
