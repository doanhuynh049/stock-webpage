"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import { getSectorColor } from "@/lib/sector-colors";
import { formatPortfolioAmount } from "@/lib/utils";

type Slice = { name: string; value: number };

function renderLabel(props: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
  name?: string;
}) {
  const {
    cx = 0,
    cy = 0,
    midAngle = 0,
    innerRadius = 0,
    outerRadius = 0,
    percent = 0,
    name = "",
  } = props;
  if (percent < 0.06) return null;
  const RAD = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RAD);
  const y = cy + radius * Math.sin(-midAngle * RAD);
  return (
    <text
      x={x}
      y={y}
      fill="var(--fg)"
      textAnchor="middle"
      dominantBaseline="central"
      className="text-[9px] font-medium"
    >
      {name.split(" ")[0]} {(percent * 100).toFixed(0)}%
    </text>
  );
}

export function PortfolioCharts({
  allocationData,
  totalValue,
  valueLabel = "Value",
  useMarketValue = false,
}: {
  allocationData: Slice[];
  totalValue: number;
  valueLabel?: string;
  /** When true, values are market value; otherwise cost basis */
  useMarketValue?: boolean;
}) {
  const sorted = [...allocationData].sort((a, b) => b.value - a.value);
  const topSector = sorted[0];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="!p-4">
        <div className="mb-2 flex items-center justify-between">
          <CardTitle className="!mb-0">Sector Allocation</CardTitle>
          <span className="text-[10px] text-subtle">
            {useMarketValue ? "By market value" : "By cost basis"}
          </span>
        </div>
        <div className="relative">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={sorted}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={72}
                outerRadius={108}
                paddingAngle={2}
                strokeWidth={2}
                stroke="var(--bg)"
                labelLine={false}
                label={renderLabel}
              >
                {sorted.map((item) => (
                  <Cell key={item.name} fill={getSectorColor(item.name)} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "12px",
                  color: "var(--fg)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                }}
                formatter={(value, name) => [
                  formatPortfolioAmount(Number(value), 0),
                  String(name),
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-[10px] uppercase tracking-wider text-subtle">Total</p>
            <p className="font-mono text-lg font-bold text-[var(--fg)]">
              {formatPortfolioAmount(totalValue, 0)}
            </p>
            {topSector && (
              <p className="mt-0.5 text-[10px] text-muted">
                Top: {topSector.name} ({((topSector.value / totalValue) * 100).toFixed(0)}%)
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card className="!p-4">
        <CardTitle>Sector Breakdown</CardTitle>
        <div className="mt-2 space-y-1">
          {sorted.map((item) => {
            const pct = totalValue > 0 ? (item.value / totalValue) * 100 : 0;
            const color = getSectorColor(item.name);
            return (
              <div
                key={item.name}
                className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[var(--bg-secondary)]"
              >
                <div
                  className="h-3 w-3 shrink-0 rounded-sm"
                  style={{ background: color }}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--fg)]">
                  {item.name}
                </span>
                <span className="hidden font-mono text-xs text-muted sm:inline">
                  {formatPortfolioAmount(item.value, 0)}
                </span>
                <div className="h-2 w-20 overflow-hidden rounded-full bg-[var(--bg-secondary)] ring-1 ring-[var(--border)]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
                <span className="w-11 text-right font-mono text-xs font-semibold text-[var(--fg)]">
                  {pct.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-transparent p-4 ring-1 ring-[var(--border)]">
          <p className="text-[10px] uppercase tracking-wider text-subtle">
            {valueLabel}
          </p>
          <p className="font-mono text-2xl font-bold text-[var(--fg)]">
            {formatPortfolioAmount(totalValue, 0)}
          </p>
          <p className="mt-1 text-[10px] text-muted">
            {sorted.length} sectors · {sorted.filter((s) => s.value > 0).length} with exposure
          </p>
        </div>
      </Card>
    </div>
  );
}
