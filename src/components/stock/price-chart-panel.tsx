"use client";

import { useCallback, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { PriceChart } from "@/components/stock/price-chart";
import { cn } from "@/lib/utils";
import type { PricePoint } from "@/types/stock";

const PERIODS = [
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
] as const;

export function PriceChartPanel({
  symbol,
  initialData,
  initialDays = 90,
}: {
  symbol: string;
  initialData: PricePoint[];
  initialDays?: number;
}) {
  const [days, setDays] = useState(initialDays);
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);

  const periodLabel = useMemo(
    () => PERIODS.find((p) => p.days === days)?.label ?? `${days}D`,
    [days],
  );

  const loadPeriod = useCallback(
    async (nextDays: number) => {
      if (nextDays === days) return;
      setDays(nextDays);
      setLoading(true);
      try {
        const res = await fetch(
          `/api/stocks/${symbol}/history?days=${nextDays}`,
        );
        if (res.ok) {
          const json = await res.json();
          setData(json.history ?? []);
        }
      } finally {
        setLoading(false);
      }
    },
    [symbol, days],
  );

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <CardTitle className="mb-0">
          Price Chart · {periodLabel}
        </CardTitle>
        <div className="flex flex-wrap gap-1 rounded-xl bg-[var(--bg-secondary)] p-1 ring-1 ring-[var(--border)]">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => loadPeriod(p.days)}
              disabled={loading}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                days === p.days
                  ? "bg-[var(--accent)] text-white shadow-sm"
                  : "text-muted hover:bg-[var(--card)] hover:text-[var(--fg)]",
                loading && days !== p.days && "opacity-50",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative min-h-[320px]">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-[var(--card)]/80 backdrop-blur-sm">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        )}
        {data.length > 0 ? (
          <PriceChart data={data} days={days} />
        ) : (
          <p className="py-16 text-center text-sm text-muted">
            No price history for this period.
          </p>
        )}
      </div>
    </Card>
  );
}
