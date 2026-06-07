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

export function PortfolioCharts({
  allocationData,
  totalValue,
  valueLabel = "Value",
}: {
  allocationData: { name: string; value: number }[];
  totalValue: number;
  valueLabel?: string;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardTitle>Sector Allocation</CardTitle>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={allocationData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={95}
              paddingAngle={3}
              strokeWidth={0}
            >
              {allocationData.map((item) => (
                <Cell
                  key={item.name}
                  fill={getSectorColor(item.name)}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                color: "var(--fg)",
              }}
              formatter={(value) => [
                `${Number(value).toLocaleString()} K`,
                valueLabel,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <CardTitle>Breakdown</CardTitle>
        <div className="space-y-1">
          {allocationData.map((item) => {
            const pct = (item.value / totalValue) * 100;
            const color = getSectorColor(item.name);
            return (
              <div key={item.name} className="flex items-center gap-3 rounded-lg px-2 py-2">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: color }}
                />
                <span className="flex-1 text-sm text-muted">{item.name}</span>
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
                <span className="w-12 text-right font-mono text-xs text-subtle">
                  {pct.toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-transparent p-4 ring-1 ring-[var(--border)]">
          <p className="text-[10px] uppercase tracking-wider text-subtle">
            Total Value
          </p>
          <p className="font-mono text-2xl font-bold text-[var(--fg)]">
            {totalValue.toLocaleString()} K
          </p>
        </div>
      </Card>
    </div>
  );
}
