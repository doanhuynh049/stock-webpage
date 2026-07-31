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

function TickerChange({ value }: { value: number }) {
  const cls = changeColor(value);
  return (
    <span
      className={`font-data text-[11px] font-semibold sm:text-xs ${cls === "text-gain" ? "text-[var(--gain)]" : cls === "text-loss" ? "text-[var(--loss)]" : "text-[var(--ticker-dim)]"}`}
    >
      {value >= 0 ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
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

  if (!market) {
    return (
      <div className="ticker-led">
        <div className="relative z-[1] flex items-center gap-3 px-4 py-2 sm:gap-6 sm:py-2.5">
          <span className="live-dot h-2 w-2 shrink-0 rounded-full bg-[var(--ticker-fg)]" />
          <span className="ticker-led-dim text-xs">
            {loading ? "SYNCING BOARD…" : "MARKET DATA UNAVAILABLE"}
          </span>
        </div>
      </div>
    );
  }

  const items = [
    ...market.indices.map((i) => ({
      label: i.symbol,
      value: i.value.toLocaleString("vi-VN"),
      change: i.changePercent,
      showChange: true,
    })),
    {
      label: "VOL",
      value: `${(market.stats.totalVolume / 1e6).toFixed(0)}M`,
      change: 0,
      showChange: false,
    },
  ];

  const doubled = [...items, ...items];

  return (
    <div className="ticker-led shrink-0">
      <div className="relative z-[1] flex items-stretch">
        <div className="flex shrink-0 items-center gap-2 border-r border-[var(--ticker-border)] px-3 py-2 sm:gap-2.5 sm:px-4 sm:py-2.5">
          <span className="live-dot h-2 w-2 shrink-0 rounded-full bg-[var(--ticker-fg)] shadow-[0_0_6px_var(--ticker-fg)]" />
          <span className="ticker-led-label hidden text-[10px] font-bold uppercase sm:inline">
            {market.session}
          </span>
          <span className="ticker-led-label text-[10px] font-bold uppercase sm:hidden">
            LIVE
          </span>
        </div>
        <div className="min-w-0 flex-1 overflow-hidden py-2 sm:py-2.5">
          <div className="ticker-animate flex w-max items-center gap-6 sm:gap-10">
            {doubled.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-[11px] sm:gap-2.5 sm:text-xs"
              >
                <span className="ticker-led-label text-[10px] font-bold uppercase tracking-wider">
                  {item.label}
                </span>
                <span className="ticker-led-value font-semibold">{item.value}</span>
                {item.showChange && <TickerChange value={item.change} />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
