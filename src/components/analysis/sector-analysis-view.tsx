"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { StockAvatar } from "@/components/ui/stock-avatar";
import { SortableTableHeader } from "@/components/ui/sortable-table-header";
import { useTableSort } from "@/hooks/use-table-sort";
import { applySortDir, compareNumbers, compareStrings } from "@/lib/table-sort";
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
  type SortKey =
    | "symbol"
    | "price"
    | "fund"
    | "tech"
    | "combined"
    | "rec"
    | "rsi"
    | "pe";

  const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>("combined", "desc");
  const sorted = useMemo(() => {
    if (!sortKey) return sector.stocks;
    return [...sector.stocks].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "symbol":
          cmp = compareStrings(a.symbol, b.symbol);
          break;
        case "price":
          cmp = compareNumbers(a.currentPriceK, b.currentPriceK);
          break;
        case "fund":
          cmp = compareNumbers(a.fundScore, b.fundScore);
          break;
        case "tech":
          cmp = compareNumbers(a.techScore, b.techScore);
          break;
        case "combined":
          cmp = compareNumbers(a.combinedScore, b.combinedScore);
          break;
        case "rec":
          cmp = compareStrings(a.recommendation, b.recommendation);
          break;
        case "rsi":
          cmp = compareNumbers(a.rsi, b.rsi);
          break;
        case "pe":
          cmp = compareNumbers(a.peRatio, b.peRatio);
          break;
      }
      return applySortDir(cmp, sortDir);
    });
  }, [sector.stocks, sortKey, sortDir]);

  return (
    <Card className="!p-4">
      <CardTitle className="!mb-1 !text-base">{sector.name}</CardTitle>
      <p className="mb-3 text-xs text-muted">
        Target {sector.targetPct.toFixed(1)}% · Current {sector.currentPct.toFixed(2)}% ·{" "}
        {sector.leaderCount} leaders
      </p>
      <div className="table-scroll overflow-x-auto rounded-lg ring-1 ring-[var(--border)]">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-left text-[10px] uppercase text-subtle">
              <th className="px-2 py-1.5">#</th>
              <SortableTableHeader label="Symbol" column="symbol" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-2 py-1.5" />
              <SortableTableHeader label="Price (k)" column="price" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" className="px-2 py-1.5" />
              <SortableTableHeader label="Fund." column="fund" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
              <SortableTableHeader label="Tech." column="tech" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
              <SortableTableHeader label="Combined" column="combined" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
              <SortableTableHeader label="Rec." column="rec" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
              <SortableTableHeader label="RSI" column="rsi" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
              <SortableTableHeader label="P/E" column="pe" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <LeaderRow key={r.symbol} row={r} rank={i + 1} sectorName={sector.name} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function LeaderRow({
  row,
  rank,
  sectorName,
}: {
  row: SectorStockRow;
  rank: number;
  sectorName: string;
}) {
  return (
    <tr className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--card-hover)]">
      <td className="px-2 py-1.5 text-subtle">{rank}</td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-2">
          <StockAvatar symbol={row.symbol} sector={sectorName} size="sm" />
          <div>
            <Link href={`/stocks/${row.symbol}`} className="font-semibold text-accent hover:underline">
              {row.symbol}
            </Link>
            {row.owned && (
              <Badge variant="info" className="ml-1 text-[9px]">
                Owned
              </Badge>
            )}
          </div>
        </div>
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
  type SectorSortKey = "sector" | "target" | "current" | "delta" | "leaders";
  const { sortKey, sortDir, toggleSort } = useTableSort<SectorSortKey>("sector", "asc");
  const sortedSectors = useMemo(() => {
    if (!sortKey) return data.sectors;
    return [...data.sectors].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "sector":
          cmp = compareStrings(a.name, b.name);
          break;
        case "target":
          cmp = compareNumbers(a.targetPct, b.targetPct);
          break;
        case "current":
          cmp = compareNumbers(a.currentPct, b.currentPct);
          break;
        case "delta":
          cmp = compareNumbers(a.deltaPct, b.deltaPct);
          break;
        case "leaders":
          cmp = compareNumbers(a.leaderCount, b.leaderCount);
          break;
      }
      return applySortDir(cmp, sortDir);
    });
  }, [data.sectors, sortKey, sortDir]);

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
        <div className="table-scroll overflow-x-auto rounded-lg ring-1 ring-[var(--border)]">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-left text-[10px] uppercase text-subtle">
                <SortableTableHeader label="Sector" column="sector" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-2 py-1.5" />
                <SortableTableHeader label="Target %" column="target" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" className="px-2 py-1.5" />
                <SortableTableHeader label="Current %" column="current" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" className="px-2 py-1.5" />
                <SortableTableHeader label="Δ" column="delta" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" className="px-2 py-1.5" />
                <th className="px-2 py-1.5 text-center">Status</th>
                <SortableTableHeader label="Leaders" column="leaders" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {sortedSectors.map((s) => (
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

      {sortedSectors.map((sec) => (
        <LeaderTable key={sec.id} sector={sec} />
      ))}
    </div>
  );
}
