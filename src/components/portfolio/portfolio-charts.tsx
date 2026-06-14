"use client";

import { useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card } from "@/components/ui/card";
import { getSectorColor, shortSectorName } from "@/lib/sector-colors";
import { formatPortfolioAmount } from "@/lib/utils";

type Slice = { name: string; value: number };

export function PortfolioCharts({
  allocationData,
  totalValue,
  valueLabel = "Value",
  useMarketValue = false,
}: {
  allocationData: Slice[];
  totalValue: number;
  valueLabel?: string;
  useMarketValue?: boolean;
}) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const sorted = [...allocationData].sort((a, b) => b.value - a.value);

  const activeSlice = activeIdx != null ? sorted[activeIdx] : sorted[0];
  const activePct = totalValue > 0 ? (activeSlice?.value / totalValue) * 100 : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
      {/* ─── Donut chart ─── */}
      <Card className="!p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--fg)]">Sector Allocation</p>
            <p className="text-[11px] text-subtle">
              {useMarketValue ? "By market value" : "By cost basis"}
            </p>
          </div>
          <span className="rounded-md bg-[var(--bg-secondary)] px-2 py-0.5 text-[10px] font-medium text-muted ring-1 ring-[var(--border)]">
            {sorted.length} sectors
          </span>
        </div>

        <div className="relative flex items-center justify-center">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={sorted}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={74}
                outerRadius={104}
                paddingAngle={2}
                strokeWidth={2}
                stroke="var(--bg)"
                onMouseEnter={(_data, idx) => setActiveIdx(idx)}
                onMouseLeave={() => setActiveIdx(null)}
              >
                {sorted.map((item, idx) => (
                  <Cell
                    key={item.name}
                    fill={getSectorColor(item.name)}
                    opacity={activeIdx == null || activeIdx === idx ? 1 : 0.35}
                    style={{
                      transform: activeIdx === idx ? "scale(1.04)" : "scale(1)",
                      transformOrigin: "50% 50%",
                      transition: "opacity 0.15s, transform 0.15s",
                    }}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "10px",
                  color: "var(--fg)",
                  fontSize: 12,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                  padding: "8px 12px",
                }}
                formatter={(value, name) => [
                  formatPortfolioAmount(Number(value), 0),
                  shortSectorName(String(name)),
                ]}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Centre overlay */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p
              className="text-[10px] font-medium uppercase tracking-wider"
              style={{ color: activeSlice ? getSectorColor(activeSlice.name) : "var(--subtle)" }}
            >
              {activeSlice ? shortSectorName(activeSlice.name) : "Total"}
            </p>
            <p className="font-mono text-xl font-bold text-[var(--fg)]">
              {activePct.toFixed(1)}%
            </p>
            <p className="mt-0.5 text-[10px] text-muted">
              {activeSlice ? formatPortfolioAmount(activeSlice.value, 0) : formatPortfolioAmount(totalValue, 0)}
            </p>
          </div>
        </div>

        {/* Compact legend row */}
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {sorted.map((item, idx) => (
            <button
              key={item.name}
              type="button"
              className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-[var(--bg-secondary)]"
              onMouseEnter={() => setActiveIdx(idx)}
              onMouseLeave={() => setActiveIdx(null)}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: getSectorColor(item.name) }}
              />
              <span className="text-[10px] text-muted">
                {shortSectorName(item.name)}
              </span>
              <span className="font-mono text-[10px] font-semibold" style={{ color: getSectorColor(item.name) }}>
                {((item.value / totalValue) * 100).toFixed(0)}%
              </span>
            </button>
          ))}
        </div>
      </Card>

      {/* ─── Breakdown list ─── */}
      <Card className="!p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-[var(--fg)]">Breakdown</p>
          <span className="font-mono text-xs text-subtle">
            {valueLabel}
          </span>
        </div>

        <div className="space-y-2">
          {sorted.map((item, idx) => {
            const pct = totalValue > 0 ? (item.value / totalValue) * 100 : 0;
            const color = getSectorColor(item.name);
            const isActive = activeIdx === idx;
            return (
              <div
                key={item.name}
                className="group cursor-default rounded-xl p-2.5 transition-all"
                style={{
                  background: isActive
                    ? `linear-gradient(135deg, ${color}14 0%, ${color}06 100%)`
                    : "transparent",
                  outline: isActive ? `1px solid ${color}28` : "none",
                }}
                onMouseEnter={() => setActiveIdx(idx)}
                onMouseLeave={() => setActiveIdx(null)}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm"
                      style={{ background: color }}
                    />
                    <span className="truncate text-[13px] font-medium text-[var(--fg)]">
                      {shortSectorName(item.name)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="hidden font-mono text-[11px] text-muted sm:inline">
                      {formatPortfolioAmount(item.value, 0)}
                    </span>
                    <span
                      className="font-mono text-xs font-bold w-10 text-right"
                      style={{ color }}
                    >
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, ${color}cc, ${color})`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Total summary */}
        <div
          className="mt-3 rounded-xl p-3 ring-1 ring-[var(--border)]"
          style={{
            background: "linear-gradient(135deg, var(--bg-secondary) 0%, transparent 100%)",
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-subtle">{valueLabel}</p>
              <p className="font-mono text-xl font-bold text-[var(--fg)]">
                {formatPortfolioAmount(totalValue, 0)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-subtle">Top sector</p>
              <p className="text-sm font-semibold" style={{ color: getSectorColor(sorted[0]?.name ?? "") }}>
                {shortSectorName(sorted[0]?.name ?? "—")}
              </p>
              <p className="font-mono text-[11px] text-muted">
                {sorted[0] ? ((sorted[0].value / totalValue) * 100).toFixed(1) + "%" : ""}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
