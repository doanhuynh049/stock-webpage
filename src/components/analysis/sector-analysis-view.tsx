"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import type {
  SectorAnalysisResult,
  SectorRollup,
  SectorStockRow,
} from "@/lib/analysis/sector-analysis";
import { formatPortfolioAmount } from "@/lib/utils";

function recVariant(rec: string) {
  const u = rec.toUpperCase();
  if (u.includes("ACCUMULATE") || u.includes("BUY")) return "success" as const;
  if (u.includes("SELL") || u.includes("AVOID")) return "danger" as const;
  if (u.includes("TRIM")) return "warning" as const;
  if (u.includes("WATCH")) return "info" as const;
  return "default" as const;
}

function statusVariant(status: SectorRollup["status"]) {
  if (status === "ON TARGET") return "success" as const;
  if (status === "OVERWEIGHT") return "warning" as const;
  if (status === "UNDERWEIGHT") return "info" as const;
  return "default" as const;
}

function LeaderTable({ sector }: { sector: SectorRollup }) {
  return (
    <Card className="!p-4">
      <CardTitle className="!mb-1 !text-base">{sector.name}</CardTitle>
      <p className="mb-3 text-xs text-muted">
        Target {sector.targetPct.toFixed(1)}% · Current {sector.currentPct.toFixed(2)}% ·{" "}
        {sector.leaderCount} leaders
      </p>
      <div className="overflow-x-auto rounded-lg ring-1 ring-[var(--border)]">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-left text-[10px] uppercase text-subtle">
              <th className="px-2 py-1.5">#</th>
              <th className="px-2 py-1.5">Symbol</th>
              <th className="px-2 py-1.5 text-right">Price (k)</th>
              <th className="px-2 py-1.5 text-center">Fund.</th>
              <th className="px-2 py-1.5 text-center">Tech.</th>
              <th className="px-2 py-1.5 text-center">Combined</th>
              <th className="px-2 py-1.5 text-center">Rec.</th>
              <th className="px-2 py-1.5 text-center">RSI</th>
              <th className="px-2 py-1.5 text-center">P/E</th>
            </tr>
          </thead>
          <tbody>
            {sector.stocks.map((r) => (
              <LeaderRow key={r.symbol} row={r} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function LeaderRow({ row }: { row: SectorStockRow }) {
  return (
    <tr className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--card-hover)]">
      <td className="px-2 py-1.5 text-subtle">{row.rank}</td>
      <td className="px-2 py-1.5">
        <Link href={`/stocks/${row.symbol}`} className="font-semibold text-accent hover:underline">
          {row.symbol}
        </Link>
        {row.owned && (
          <Badge variant="info" className="ml-1 text-[9px]">
            Owned
          </Badge>
        )}
      </td>
      <td className="px-2 py-1.5 text-right font-mono">
        {row.currentPriceK != null ? formatPortfolioAmount(row.currentPriceK) : "—"}
      </td>
      <td className="px-2 py-1.5 text-center font-mono">{row.fundScore}</td>
      <td className="px-2 py-1.5 text-center font-mono">{row.techScore}</td>
      <td className="px-2 py-1.5 text-center font-mono font-semibold">{row.combinedScore}</td>
      <td className="px-2 py-1.5 text-center">
        <Badge variant={recVariant(row.recommendation)} className="text-[9px]">
          {row.recommendation}
        </Badge>
      </td>
      <td className="px-2 py-1.5 text-center font-mono text-xs">
        {row.rsi != null ? row.rsi.toFixed(1) : "—"}
      </td>
      <td className="px-2 py-1.5 text-center font-mono text-xs">
        {row.peRatio != null ? row.peRatio.toFixed(1) : "—"}
      </td>
    </tr>
  );
}

export function SectorAnalysisView({ data }: { data: SectorAnalysisResult }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
        <span>
          Generated {new Date(data.generatedAt).toLocaleString()}
        </span>
        <span>·</span>
        <span>Analyzed {data.totalTickersAnalyzed} tickers</span>
        <span>·</span>
        <span className="font-mono font-semibold text-[var(--fg)]">
          Portfolio {formatPortfolioAmount(data.totalPortfolioValueK, 0)} k VND
        </span>
      </div>

      {data.trendLeaders.length > 0 && (
        <Card className="!p-4">
          <CardTitle className="!mb-1 !text-base">Trend leaders (next period)</CardTitle>
          <p className="mb-3 text-xs text-muted">
            Highest combined scores across 9 sectors — ACCUMULATE / WATCH names often lead the next
            leg. Cross-check with Strategy Review for sell/trim on owned names.
          </p>
          <div className="flex flex-wrap gap-2">
            {data.trendLeaders.slice(0, 10).map((r) => (
              <Link
                key={r.symbol}
                href={`/stocks/${r.symbol}`}
                className="rounded-lg bg-[var(--bg-secondary)] px-2.5 py-1.5 text-xs ring-1 ring-[var(--border)] hover:ring-[var(--accent)]/30"
              >
                <span className="font-semibold text-accent">{r.symbol}</span>
                <span className="ml-1.5 font-mono">{r.combinedScore}</span>
                <Badge variant={recVariant(r.recommendation)} className="ml-1.5 text-[8px]">
                  {r.recommendation}
                </Badge>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <Card className="!p-4">
        <CardTitle className="!mb-3 !text-base">Sector allocation — target vs current</CardTitle>
        <p className="mb-3 text-xs text-muted">
          Edit targets in Strategy → Edit strategy. Current % uses market value matched via sector
          leader lists.
        </p>
        <div className="overflow-x-auto rounded-lg ring-1 ring-[var(--border)]">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-left text-[10px] uppercase text-subtle">
                <th className="px-2 py-1.5">Sector</th>
                <th className="px-2 py-1.5 text-right">Target %</th>
                <th className="px-2 py-1.5 text-right">Current %</th>
                <th className="px-2 py-1.5 text-right">Δ</th>
                <th className="px-2 py-1.5 text-center">Status</th>
                <th className="px-2 py-1.5 text-center">Leaders</th>
              </tr>
            </thead>
            <tbody>
              {data.sectors.map((s) => (
                <tr key={s.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-2 py-1.5 font-medium">{s.name}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{s.targetPct.toFixed(1)}%</td>
                  <td className="px-2 py-1.5 text-right font-mono">{s.currentPct.toFixed(2)}%</td>
                  <td className="px-2 py-1.5 text-right font-mono">
                    {s.deltaPct >= 0 ? "+" : ""}
                    {s.deltaPct.toFixed(2)}%
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <Badge variant={statusVariant(s.status)} className="text-[9px]">
                      {s.status}
                    </Badge>
                  </td>
                  <td className="px-2 py-1.5 text-center font-mono">{s.leaderCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {data.sectors.map((sec) => (
        <LeaderTable key={sec.id} sector={sec} />
      ))}
    </div>
  );
}
