"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ChangeBadge } from "@/components/stock/change-badge";
import { StockAvatar } from "@/components/ui/stock-avatar";
import { RemoveWatchlistButton } from "@/components/watchlist/remove-watchlist-button";
import type { Stock } from "@/types/stock";

type WatchlistItem = {
  symbol: string;
  stock?: Stock | null;
};

export function WatchlistGrid({ items }: { items: WatchlistItem[] }) {
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    setHidden((prev) => prev.filter((sym) => items.some((i) => i.symbol === sym)));
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
            {stock && (
              <div className="mt-3 text-[10px] text-subtle">
                {stock.sector} · {stock.exchange}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
