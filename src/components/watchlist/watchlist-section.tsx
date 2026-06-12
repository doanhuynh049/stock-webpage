"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { WatchlistGrid } from "@/components/watchlist/watchlist-grid";
import { WatchlistAddPanel } from "@/components/watchlist/watchlist-add-panel";
import type { WatchlistSuggestion } from "@/components/watchlist/watchlist-add-panel";
import type { WatchlistItemView } from "@/lib/user-data";

export type { WatchlistSuggestion };

function mergeItems(
  local: WatchlistItemView[],
  server: WatchlistItemView[],
): WatchlistItemView[] {
  const map = new Map<string, WatchlistItemView>();

  for (const row of server) {
    map.set(row.symbol, row);
  }

  for (const row of local) {
    const existing = map.get(row.symbol);
    if (!existing) {
      map.set(row.symbol, row);
      continue;
    }
    const preferLocalStock =
      (row.stock?.price ?? 0) > 0 && !(existing.stock?.price ?? 0);
    const preferExistingStock =
      (existing.stock?.price ?? 0) > 0 && !(row.stock?.price ?? 0);
    if (preferLocalStock) {
      map.set(row.symbol, { ...existing, stock: row.stock });
    } else if (!preferExistingStock && row.stock && !existing.stock) {
      map.set(row.symbol, { ...existing, stock: row.stock });
    }
  }

  return Array.from(map.values());
}

export function WatchlistSection({
  initialItems,
  suggestions,
}: {
  initialItems: WatchlistItemView[];
  suggestions: WatchlistSuggestion[];
}) {
  const optimisticRef = useRef<Map<string, WatchlistItemView>>(new Map());
  const [items, setItems] = useState(() => initialItems);

  const syncFromServer = useCallback((server: WatchlistItemView[]) => {
    setItems((prev) => {
      const optimistic = Array.from(optimisticRef.current.values());
      const merged = mergeItems(mergeItems(prev, optimistic), server);
      for (const row of merged) {
        if (server.some((s) => s.symbol === row.symbol)) {
          optimisticRef.current.delete(row.symbol);
        }
      }
      return merged;
    });
  }, []);

  useEffect(() => {
    syncFromServer(initialItems);
  }, [initialItems, syncFromServer]);

  function handleAdded(symbol: string) {
    const sym = symbol.toUpperCase();
    const optimistic: WatchlistItemView = { symbol: sym, stock: null };
    optimisticRef.current.set(sym, optimistic);
    setItems((prev) => {
      if (prev.some((i) => i.symbol === sym)) return prev;
      return [optimistic, ...prev];
    });
  }

  function handleFailed(symbol: string) {
    const sym = symbol.toUpperCase();
    optimisticRef.current.delete(sym);
    setItems((prev) => prev.filter((i) => i.symbol !== sym));
  }

  const symbolsKey = items.map((i) => i.symbol).join(",");

  useEffect(() => {
    const pending = items.filter((i) => !i.stock || i.stock.price <= 0);
    if (!pending.length) return;

    let cancelled = false;
    void (async () => {
      for (const item of pending) {
        if (cancelled) return;
        try {
          const res = await fetch(`/api/stocks/${item.symbol}`);
          if (!res.ok) continue;
          const data = (await res.json()) as { stock?: WatchlistItemView["stock"] };
          if (!data.stock) continue;
          setItems((prev) =>
            prev.map((row) =>
              row.symbol === item.symbol ? { ...row, stock: data.stock! } : row,
            ),
          );
        } catch {
          /* ignore */
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [symbolsKey]);

  return (
    <>
      <Card glow>
        <CardTitle>Quick add</CardTitle>
        <p className="mb-3 text-xs text-muted">
          Enter a ticker or pick a suggestion. You can also use the star button on any stock detail page.
        </p>
        <WatchlistAddPanel
          suggestions={suggestions}
          onAdded={handleAdded}
          onFailed={handleFailed}
        />
      </Card>

      <WatchlistGrid items={items} />
    </>
  );
}
