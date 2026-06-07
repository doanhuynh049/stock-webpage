"use client";

import { useEffect, useState } from "react";
import type { MarketSnapshot } from "@/types/stock";
import { changeColor } from "@/lib/utils";

export function MarketTicker() {
  const [market, setMarket] = useState<MarketSnapshot | null>(null);

  useEffect(() => {
    fetch("/api/market")
      .then((r) => r.json())
      .then((d) => setMarket(d.market))
      .catch(() => null);
  }, []);

  if (!market) {
    return (
      <div className="border-b border-[var(--border)] bg-[var(--ticker-bg)] px-4 py-2 backdrop-blur-md">
        <span className="text-xs text-[var(--fg-subtle)]">Loading market data…</span>
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
    <div className="relative overflow-hidden border-b border-[var(--border)] bg-[var(--ticker-bg)] backdrop-blur-md">
      <div className="flex items-center gap-6 py-2">
        <div className="flex shrink-0 items-center gap-2 px-4">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)]">
            {market.session} · live
          </span>
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="ticker-animate flex w-max gap-8">
            {doubled.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
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
