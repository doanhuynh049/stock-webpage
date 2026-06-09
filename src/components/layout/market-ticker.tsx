"use client";

import { useCallback } from "react";
import type { MarketSnapshot } from "@/types/stock";
import { changeColor } from "@/lib/utils";
import {
  LOCAL_CACHE_KEYS,
  LOCAL_CACHE_TTL,
} from "@/lib/client/local-storage-cache";
import { useCachedFetch } from "@/hooks/use-cached-fetch";

function parseMarketResponse(json: unknown): MarketSnapshot | null {
  const market = (json as { market?: MarketSnapshot })?.market;
  return market?.indices?.length ? market : null;
}

export function MarketTicker() {
  const select = useCallback(
    (json: unknown) => parseMarketResponse(json),
    [],
  );

  const { data: market, loading } = useCachedFetch<MarketSnapshot>(
    LOCAL_CACHE_KEYS.market,
    "/api/market",
    LOCAL_CACHE_TTL.market,
    select,
  );

  const shellClass =
    "relative overflow-hidden border-b border-[var(--border)] bg-[var(--ticker-bg)] backdrop-blur-md";

  if (!market) {
    return (
      <div className={shellClass}>
        <div className="flex items-center gap-3 px-4 py-1.5 sm:gap-6 sm:py-2">
          <span className="live-dot h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]/40" />
          <span className="text-xs text-[var(--fg-subtle)]">
            {loading ? "Loading market data…" : "Market data unavailable"}
          </span>
        </div>
      </div>
    );
  }

  const items = [
    ...market.indices.map((i) => ({
      label: i.symbol,
      value: i.value.toLocaleString(),
      change: i.changePercent,
      showChange: true,
    })),
    {
      label: "Vol",
      value: `${(market.stats.totalVolume / 1e6).toFixed(0)}M`,
      change: 0,
      showChange: false,
    },
  ];

  const doubled = [...items, ...items];

  return (
    <div className={shellClass}>
      <div className="flex items-center gap-3 py-1.5 sm:gap-6 sm:py-2">
        <div className="flex shrink-0 items-center gap-1.5 px-2 sm:gap-2 sm:px-4">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          <span className="hidden text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)] sm:inline">
            {market.session} · live
          </span>
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="ticker-animate flex w-max gap-4 sm:gap-8">
            {doubled.map((item, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[11px] sm:gap-2 sm:text-xs">
                <span className="font-medium text-[var(--fg-muted)]">{item.label}</span>
                <span className="font-mono text-[var(--fg)]">{item.value}</span>
                {item.showChange && (
                  <span className={`font-mono font-medium ${changeColor(item.change)}`}>
                    {item.change >= 0 ? "+" : ""}
                    {item.change.toFixed(2)}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
