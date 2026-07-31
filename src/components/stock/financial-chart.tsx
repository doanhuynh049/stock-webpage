"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function FinancialChart({
  data,
}: {
  data: { year: string; revenue: number; profit: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey="year" stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis stroke="#52525b" fontSize={11} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{
            background: "rgba(10,10,15,0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
          }}
        />
        <Bar dataKey="revenue" fill="#b8792a" name="Revenue (B)" radius={[6, 6, 0, 0]} />
        <Bar dataKey="profit" fill="#22d3ee" name="Net Profit (B)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
