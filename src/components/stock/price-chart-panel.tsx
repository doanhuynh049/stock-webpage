"use client";

import { useCallback, useMemo, useState } from "react";
import { BarChart2, Loader2 } from "lucide-react";
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
        const res = await fetch(`/api/stocks/${symbol}/history?days=${nextDays}`);
        if (res.ok) {
          const json = await res.json() as { history?: PricePoint[] };
          setData(json.history ?? []);
        }
      } finally {
        setLoading(false);
      }
    },
    [symbol, days],
  );

  // Compute summary stats
  const stats = useMemo(() => {
    if (!data.length) return null;
    const closes = data.map((d) => d.close);
    const hi = Math.max(...closes);
    const lo = Math.min(...closes);
    const first = closes[0];
    const last = closes[closes.length - 1];
    const chg = first > 0 ? ((last - first) / first) * 100 : 0;
    const avgVol =
      data.reduce((s, d) => s + (d.volume ?? 0), 0) / data.length;
    return { hi, lo, chg, avgVol };
  }, [data]);

  return (
    <Card>
      {/* Header row */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-accent" />
          <CardTitle className="mb-0">
            Price Chart
            <span className="ml-1.5 text-sm font-normal text-muted">· {periodLabel}</span>
          </CardTitle>
        </div>
        {/* Period selector */}
        <div className="flex flex-wrap gap-1 rounded-xl bg-[var(--bg-secondary)] p-1 ring-1 ring-[var(--border)]">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => void loadPeriod(p.days)}
              disabled={loading}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                days === p.days
                  ? "bg-accent text-accent-fg shadow-sm ring-1 ring-accent/20"
                  : "text-muted hover:bg-[var(--card)] hover:text-[var(--fg)]",
                loading && days !== p.days && "opacity-50",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stats bar */}
      {stats && (
        <div className="mb-4 flex flex-wrap gap-4 rounded-xl bg-[var(--bg-secondary)] px-4 py-2.5 text-xs ring-1 ring-[var(--border)]">
          <span className="flex items-center gap-1.5 text-muted">
            Period High
            <strong className="font-mono text-[var(--fg)]">{stats.hi.toLocaleString("vi-VN")}</strong>
          </span>
          <span className="text-[var(--border)]">·</span>
          <span className="flex items-center gap-1.5 text-muted">
            Period Low
            <strong className="font-mono text-[var(--fg)]">{stats.lo.toLocaleString("vi-VN")}</strong>
          </span>
          <span className="text-[var(--border)]">·</span>
          <span className="flex items-center gap-1.5 text-muted">
            Chg
            <strong
              className={cn(
                "font-mono",
                stats.chg >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
              )}
            >
              {stats.chg >= 0 ? "+" : ""}{stats.chg.toFixed(2)}%
            </strong>
          </span>
          {stats.avgVol > 0 && (
            <>
              <span className="text-[var(--border)]">·</span>
              <span className="flex items-center gap-1.5 text-muted">
                Avg Vol
                <strong className="font-mono text-[var(--fg)]">
                  {stats.avgVol >= 1_000_000
                    ? `${(stats.avgVol / 1_000_000).toFixed(1)}M`
                    : stats.avgVol >= 1_000
                    ? `${(stats.avgVol / 1_000).toFixed(0)}K`
                    : stats.avgVol.toFixed(0)}
                </strong>
              </span>
            </>
          )}
        </div>
      )}

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
