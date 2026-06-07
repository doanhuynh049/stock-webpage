"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PricePoint } from "@/types/stock";

function formatAxisDate(date: string, days: number): string {
  if (days <= 30) return date.slice(5);
  if (days <= 90) return date.slice(5);
  const [y, m] = date.split("-");
  return `${m}/${y.slice(2)}`;
}

function tickInterval(count: number, days: number): number {
  if (count <= 8) return 0;
  if (days <= 7) return 0;
  if (days <= 30) return Math.max(0, Math.floor(count / 5) - 1);
  if (days <= 90) return Math.max(0, Math.floor(count / 6) - 1);
  return Math.max(0, Math.floor(count / 8) - 1);
}

export function PriceChart({
  data,
  days = 90,
}: {
  data: PricePoint[];
  days?: number;
}) {
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        date: d.date,
        label: formatAxisDate(d.date, days),
        close: d.close,
      })),
    [data, days],
  );

  const min = Math.min(...chartData.map((d) => d.close)) * 0.98;
  const max = Math.max(...chartData.map((d) => d.close)) * 1.02;
  const isUp =
    chartData.length > 1 &&
    chartData[chartData.length - 1].close >= chartData[0].close;
  const stroke = isUp ? "var(--success)" : "var(--danger)";
  const gradientId = `price-${isUp ? "up" : "down"}-${days}`;

  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isUp ? "#059669" : "#dc2626"} stopOpacity={0.22} />
            <stop offset="100%" stopColor={isUp ? "#059669" : "#dc2626"} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--border)"
          vertical={false}
        />
        <XAxis
          dataKey="label"
          stroke="var(--fg-subtle)"
          fontSize={10}
          tickLine={false}
          axisLine={false}
          interval={tickInterval(chartData.length, days)}
          minTickGap={28}
        />
        <YAxis
          domain={[min, max]}
          stroke="var(--fg-subtle)"
          fontSize={10}
          tickLine={false}
          axisLine={false}
          width={58}
          tickFormatter={(v) =>
            v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toLocaleString()
          }
        />
        <Tooltip
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border-strong)",
            borderRadius: "12px",
            fontSize: "12px",
            color: "var(--fg)",
          }}
          labelStyle={{ color: "var(--fg-muted)", marginBottom: 4 }}
          labelFormatter={(_, payload) => {
            const row = payload?.[0]?.payload as { date?: string } | undefined;
            return row?.date ?? "";
          }}
          formatter={(value) => [`${Number(value).toLocaleString()} ₫`, "Close"]}
        />
        <Area
          type="monotone"
          dataKey="close"
          stroke={stroke}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{
            r: 4,
            fill: isUp ? "#059669" : "#dc2626",
            stroke: "var(--bg)",
            strokeWidth: 2,
          }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
