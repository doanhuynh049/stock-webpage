"use client";

import { useMemo } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
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

function computeMA(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    const slice = closes.slice(i - period + 1, i + 1);
    return slice.reduce((s, v) => s + v, 0) / period;
  });
}

// Custom tooltip
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const close = payload.find((p) => p.name === "close");
  const ma20 = payload.find((p) => p.name === "ma20");
  const vol = payload.find((p) => p.name === "volume");

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border-strong)",
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 12,
        color: "var(--fg)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
        minWidth: 140,
      }}
    >
      <p style={{ color: "var(--fg-muted)", marginBottom: 6, fontWeight: 500 }}>{label}</p>
      {close && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 2 }}>
          <span style={{ color: "var(--fg-muted)" }}>Close</span>
          <span style={{ fontWeight: 700, fontFamily: "monospace" }}>
            {Number(close.value).toLocaleString("vi-VN")} ₫
          </span>
        </div>
      )}
      {ma20 && ma20.value != null && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 2 }}>
          <span style={{ color: "#f59e0b" }}>MA20</span>
          <span style={{ fontFamily: "monospace", color: "#f59e0b" }}>
            {Number(ma20.value).toLocaleString("vi-VN")} ₫
          </span>
        </div>
      )}
      {vol && vol.value != null && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginTop: 4, borderTop: "1px solid var(--border)", paddingTop: 4 }}>
          <span style={{ color: "var(--fg-muted)" }}>Volume</span>
          <span style={{ fontFamily: "monospace", color: "var(--fg-muted)", fontSize: 11 }}>
            {Number(vol.value).toLocaleString("vi-VN")}
          </span>
        </div>
      )}
    </div>
  );
}

export function PriceChart({
  data,
  days = 90,
}: {
  data: PricePoint[];
  days?: number;
}) {
  const chartData = useMemo(() => {
    const closes = data.map((d) => d.close);
    const ma20Vals = computeMA(closes, 20);
    return data.map((d, i) => ({
      date: d.date,
      label: formatAxisDate(d.date, days),
      close: d.close,
      volume: d.volume ?? 0,
      ma20: ma20Vals[i],
    }));
  }, [data, days]);

  const closes = chartData.map((d) => d.close);
  const min = Math.min(...closes) * 0.985;
  const max = Math.max(...closes) * 1.015;

  const first = chartData[0]?.close ?? 0;
  const last = chartData[chartData.length - 1]?.close ?? 0;
  const isUp = last >= first;
  const changePercent = first > 0 ? ((last - first) / first) * 100 : 0;

  const stroke = isUp ? "var(--gain)" : "var(--loss)";
  const strokeHex = isUp ? "#d93b3b" : "#2e9e6d";
  const gradientId = `price-grad-${isUp ? "up" : "dn"}-${days}`;
  const volGradId = `vol-grad-${days}`;

  const maxVol = Math.max(...chartData.map((d) => d.volume), 1);

  return (
    <div className="space-y-0">
      {/* Change pill */}
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-data text-[11px] font-bold ring-1 ${
            isUp
              ? "bg-[var(--gain-bg)] text-gain ring-[color-mix(in_srgb,var(--gain)_30%,transparent)]"
              : "bg-[var(--loss-bg)] text-loss ring-[color-mix(in_srgb,var(--loss)_30%,transparent)]"
          }`}
        >
          {changePercent >= 0 ? "+" : ""}{changePercent.toFixed(2)}% over period
        </span>
        <span className="text-[10px] text-subtle">
          {chartData[0]?.date ?? ""} → {chartData[chartData.length - 1]?.date ?? ""}
        </span>
      </div>

      {/* Main price chart */}
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={chartData} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeHex} stopOpacity={0.2} />
              <stop offset="80%" stopColor={strokeHex} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} opacity={0.5} />
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
            width={62}
            tickFormatter={(v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toLocaleString()
            }
          />
          <Tooltip
            content={<ChartTooltip />}
            labelFormatter={(_, payload) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const row = (payload as any)?.[0]?.payload as { date?: string } | undefined;
              return row?.date ?? "";
            }}
            cursor={{ stroke: "var(--border-strong)", strokeWidth: 1, strokeDasharray: "3 3" }}
          />
          <Area
            type="monotone"
            dataKey="close"
            stroke={stroke}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4, fill: strokeHex, stroke: "var(--bg)", strokeWidth: 2 }}
          />
          <Line
            type="monotone"
            dataKey="ma20"
            stroke="#f59e0b"
            strokeWidth={1.5}
            dot={false}
            connectNulls
            strokeDasharray="4 2"
            activeDot={{ r: 3, fill: "#f59e0b" }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Volume bars */}
      {chartData.some((d) => d.volume > 0) && (
        <div className="-mt-1">
          <ResponsiveContainer width="100%" height={56}>
            <BarChart data={chartData} margin={{ top: 0, right: 4, left: 0, bottom: 0 }} barCategoryGap="2%">
              <defs>
                <linearGradient id={volGradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={strokeHex} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={strokeHex} stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" hide />
              <YAxis hide domain={[0, maxVol * 1.15]} />
              <Bar dataKey="volume" fill={`url(#${volGradId})`} radius={[2, 2, 0, 0]} maxBarSize={12} />
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-0.5 text-center text-[9px] text-subtle">Volume</p>
        </div>
      )}

      {/* MA legend */}
      <div className="mt-1 flex flex-wrap items-center gap-4 text-[10px] text-subtle">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: stroke }} />
          Price
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: "#f59e0b", borderTop: "2px dashed #f59e0b" }} />
          MA20
        </span>
      </div>
    </div>
  );
}
