"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { SortableTableHeader } from "@/components/ui/sortable-table-header";
import { useTableSort } from "@/hooks/use-table-sort";
import { applySortDir, compareNumbers, compareStrings } from "@/lib/table-sort";
import type { EtfAnalysisRow } from "@/lib/analysis/etf-universe";
import { BENCHMARK_ORDER } from "@/lib/analysis/etf-universe";

type BenchmarkFilter = (typeof BENCHMARK_ORDER)[number] | "All";

const BENCHMARK_FILTERS: BenchmarkFilter[] = ["All", ...BENCHMARK_ORDER];

function scoreVariant(score: number) {
  if (score >= 70) return "success" as const;
  if (score >= 55) return "info" as const;
  if (score >= 40) return "warning" as const;
  return "danger" as const;
}

function recVariant(rec: string) {
  const u = rec.toUpperCase();
  if (u.includes("ACCUMULATE") || u.includes("BUY")) return "success" as const;
  if (u.includes("SELL") || u.includes("AVOID")) return "danger" as const;
  if (u.includes("TRIM")) return "warning" as const;
  if (u.includes("WATCH")) return "info" as const;
  return "default" as const;
}

function formatAum(aumBnVnd: number | null): string {
  if (aumBnVnd == null) return "—";
  if (aumBnVnd >= 1000) return `${(aumBnVnd / 1000).toFixed(1)}T`;
  return `${aumBnVnd}B`;
}

function BenchmarkBadge({ benchmark }: { benchmark: string }) {
  const colorMap: Record<string, string> = {
    "VN30": "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    "VN Diamond": "bg-purple-500/15 text-purple-700 dark:text-purple-300",
    "VNFIN Lead": "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    "VNFIN Select": "bg-teal-500/15 text-teal-700 dark:text-teal-300",
    "VN100": "bg-orange-500/15 text-orange-700 dark:text-orange-300",
    "VNX50": "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    "VN Midcap": "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  };
  const cls = colorMap[benchmark] ?? "bg-[var(--bg-secondary)] text-muted";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${cls}`}>
      {benchmark}
    </span>
  );
}

function SummaryCards({ rows }: { rows: EtfAnalysisRow[] }) {
  const withData = rows.filter((r) => r.hasData);
  const bullish = withData.filter((r) => r.technicalScore >= 60).length;
  const bearish = withData.filter((r) => r.technicalScore < 45).length;
  const avgScore = withData.length
    ? Math.round(withData.reduce((s, r) => s + r.technicalScore, 0) / withData.length)
    : 0;
  const top = withData.length ? withData[0] : null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-lg bg-[var(--bg-secondary)] px-3 py-2.5 ring-1 ring-[var(--border)]">
        <p className="text-[10px] uppercase text-subtle">ETFs tracked</p>
        <p className="mt-1 text-xl font-bold">{rows.length}</p>
        <p className="text-[10px] text-subtle">{withData.length} with snapshot data</p>
      </div>
      <div className="rounded-lg bg-[var(--bg-secondary)] px-3 py-2.5 ring-1 ring-[var(--border)]">
        <p className="text-[10px] uppercase text-subtle">Avg tech score</p>
        <p className={`mt-1 text-xl font-bold ${avgScore >= 60 ? "text-[var(--success)]" : avgScore < 45 ? "text-[var(--danger)]" : "text-[var(--warning)]"}`}>
          {avgScore}
        </p>
      </div>
      <div className="rounded-lg bg-[var(--bg-secondary)] px-3 py-2.5 ring-1 ring-[var(--border)]">
        <p className="text-[10px] uppercase text-subtle">Bullish (≥60)</p>
        <p className="mt-1 text-xl font-bold text-[var(--success)]">{bullish}</p>
      </div>
      <div className="rounded-lg bg-[var(--bg-secondary)] px-3 py-2.5 ring-1 ring-[var(--border)]">
        <p className="text-[10px] uppercase text-subtle">Bearish (&lt;45)</p>
        <p className="mt-1 text-xl font-bold text-[var(--danger)]">{bearish}</p>
      </div>
      {top && (
        <div className="col-span-2 sm:col-span-4 rounded-lg bg-[var(--bg-secondary)] px-3 py-2 ring-1 ring-[var(--border)]">
          <p className="text-[10px] uppercase text-subtle">Strongest signal</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Link href={`/stocks/${top.symbol}`} className="font-semibold text-accent hover:underline">
              {top.symbol}
            </Link>
            <span className="text-xs text-muted">{top.name}</span>
            <BenchmarkBadge benchmark={top.benchmark} />
            <Badge variant={scoreVariant(top.technicalScore)} className="font-mono text-xs">
              {top.technicalScore}
            </Badge>
            <span className="text-xs text-subtle">{top.manager} · AUM {formatAum(top.aumBnVnd)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function EtfAnalysisView({ rows }: { rows: EtfAnalysisRow[] }) {
  const [benchmarkFilter, setBenchmarkFilter] = useState<BenchmarkFilter>("All");

  type SortKey = "symbol" | "benchmark" | "manager" | "aum" | "price" | "tech" | "rating" | "trend" | "momentum";

  const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>("tech", "desc");

  const filtered = useMemo(
    () =>
      benchmarkFilter === "All"
        ? rows
        : rows.filter((r) => r.benchmark === benchmarkFilter),
    [rows, benchmarkFilter],
  );

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      // Always float rows without snapshot data to the bottom
      if (a.hasData !== b.hasData) return a.hasData ? -1 : 1;
      let cmp = 0;
      switch (sortKey) {
        case "symbol":
          cmp = compareStrings(a.symbol, b.symbol);
          break;
        case "benchmark":
          cmp = compareStrings(a.benchmark, b.benchmark);
          break;
        case "manager":
          cmp = compareStrings(a.manager, b.manager);
          break;
        case "aum":
          cmp = compareNumbers(a.aumBnVnd ?? -1, b.aumBnVnd ?? -1);
          break;
        case "price":
          cmp = compareNumbers(a.currentPrice, b.currentPrice);
          break;
        case "tech":
          cmp = compareNumbers(a.technicalScore, b.technicalScore);
          break;
        case "rating":
          cmp = compareStrings(a.technicalRating, b.technicalRating);
          break;
        case "trend":
          cmp = compareStrings(a.maTrend, b.maTrend);
          break;
        case "momentum":
          cmp = compareStrings(a.momentum, b.momentum);
          break;
      }
      return applySortDir(cmp, sortDir);
    });
  }, [filtered, sortKey, sortDir]);

  const benchmarkGroups = useMemo(() => {
    if (benchmarkFilter !== "All") return null;
    const groups: Record<string, EtfAnalysisRow[]> = {};
    for (const r of rows) {
      if (!groups[r.benchmark]) groups[r.benchmark] = [];
      groups[r.benchmark].push(r);
    }
    // Sort within each group by tech score
    for (const g of Object.values(groups)) g.sort((a, b) => b.technicalScore - a.technicalScore);
    return groups;
  }, [rows, benchmarkFilter]);

  const groupAvgScore = (group: EtfAnalysisRow[]) => {
    const withData = group.filter((r) => r.hasData);
    return withData.length
      ? Math.round(withData.reduce((s, r) => s + r.technicalScore, 0) / withData.length)
      : 0;
  };

  return (
    <div className="space-y-4">
      <SummaryCards rows={rows} />

      {/* Benchmark group heatmap */}
      {benchmarkGroups && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {BENCHMARK_ORDER.filter((b) => benchmarkGroups[b]?.length).map((b) => {
            const group = benchmarkGroups[b]!;
            const avg = groupAvgScore(group);
            const best = group.find((r) => r.hasData) ?? group[0];
            return (
              <button
                key={b}
                type="button"
                onClick={() => setBenchmarkFilter(b)}
                className="rounded-lg bg-[var(--bg-secondary)] px-3 py-2.5 text-left ring-1 ring-[var(--border)] hover:ring-[var(--accent)]/40 transition-colors"
              >
                <BenchmarkBadge benchmark={b} />
                <div className="mt-2 flex items-end justify-between">
                  <div>
                    <p className="text-[10px] text-subtle">{group.length} ETF{group.length > 1 ? "s" : ""}</p>
                    <p className="text-[10px] text-subtle">Best: {best?.symbol}</p>
                  </div>
                  <Badge variant={scoreVariant(avg)} className="font-mono text-xs">{avg}</Badge>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-subtle uppercase">Filter:</span>
        {BENCHMARK_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setBenchmarkFilter(f)}
            className={`rounded px-2 py-1 text-[10px] font-medium ring-1 ring-[var(--border)] transition-colors ${
              benchmarkFilter === f
                ? "bg-accent text-white ring-accent"
                : "text-muted hover:text-[var(--fg)]"
            }`}
          >
            {f}
            {f !== "All" && benchmarkGroups?.[f] ? ` (${benchmarkGroups[f]!.length})` : ""}
          </button>
        ))}
      </div>

      {/* ETF Table */}
      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <CardTitle className="!mb-0 !text-sm">
            {benchmarkFilter === "All" ? "All Vietnamese ETFs" : `${benchmarkFilter} ETFs`}
            <span className="ml-2 font-normal text-xs text-muted">· Technical analysis only · No fundamental scoring for ETFs</span>
          </CardTitle>
        </div>
        <div className="table-scroll overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-left text-[10px] uppercase text-subtle">
                <th className="px-2 py-1.5">#</th>
                <SortableTableHeader label="Symbol" column="symbol" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-2 py-1.5" />
                <SortableTableHeader label="Name / Benchmark" column="benchmark" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-2 py-1.5" />
                <SortableTableHeader label="Manager" column="manager" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-2 py-1.5" />
                <SortableTableHeader label="AUM" column="aum" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" className="px-2 py-1.5" />
                <SortableTableHeader label="Price" column="price" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" className="px-2 py-1.5" />
                <SortableTableHeader label="Tech" column="tech" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
                <SortableTableHeader label="Rating" column="rating" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-2 py-1.5" />
                <SortableTableHeader label="Trend" column="trend" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-2 py-1.5" />
                <SortableTableHeader label="Momentum" column="momentum" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <EtfRow key={r.symbol} row={r} rank={i + 1} />
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-sm text-muted">
                    No ETF data available for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-[10px] text-subtle">
        AUM figures are approximate snapshots (mid-2025) in billion (B) / trillion (T) VND.
        Technical analysis uses RSI, MA20/50, MACD, volume, and support/resistance from snapshot DB.
        ETFs track indices — no fundamental scoring applies.
      </p>
    </div>
  );
}

function EtfRow({ row, rank }: { row: EtfAnalysisRow; rank: number }) {
  const priceDisplay =
    row.currentPrice > 0
      ? row.currentPrice >= 10000
        ? `${(row.currentPrice / 1000).toFixed(1)}k`
        : row.currentPrice.toFixed(1)
      : "—";

  if (!row.hasData) {
    return (
      <tr className="border-b border-[var(--border)] last:border-0 opacity-50">
        <td className="px-2 py-1.5 text-subtle">{rank}</td>
        <td className="px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            <Link href={`/stocks/${row.symbol}`} className="font-semibold text-muted hover:underline">
              {row.symbol}
            </Link>
            <Badge variant="info" className="text-[8px] px-1 py-0">ETF</Badge>
          </div>
        </td>
        <td className="px-2 py-1.5">
          <div className="text-xs text-muted">{row.name}</div>
          <BenchmarkBadge benchmark={row.benchmark} />
        </td>
        <td className="px-2 py-1.5 text-xs text-muted">{row.manager}</td>
        <td className="px-2 py-1.5 text-right font-mono text-xs text-muted">{formatAum(row.aumBnVnd)}</td>
        <td className="px-2 py-1.5 text-right font-mono text-xs text-muted">{priceDisplay}</td>
        <td colSpan={4} className="px-2 py-1.5 text-center text-xs text-subtle italic">
          No snapshot data in DB — technical indicators unavailable
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--card-hover)]">
      <td className="px-2 py-1.5 text-subtle">{rank}</td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <Link
            href={`/stocks/${row.symbol}`}
            className="font-semibold text-accent hover:underline"
          >
            {row.symbol}
          </Link>
          <Badge variant="info" className="text-[8px] px-1 py-0">ETF</Badge>
        </div>
      </td>
      <td className="px-2 py-1.5">
        <div className="text-xs">{row.name}</div>
        <BenchmarkBadge benchmark={row.benchmark} />
      </td>
      <td className="px-2 py-1.5 text-xs text-muted">{row.manager}</td>
      <td className="px-2 py-1.5 text-right font-mono text-xs">{formatAum(row.aumBnVnd)}</td>
      <td className="px-2 py-1.5 text-right font-mono text-xs">{priceDisplay}</td>
      <td className="px-2 py-1.5 text-center">
        <Badge variant={scoreVariant(row.technicalScore)} className="font-mono text-xs font-semibold">
          {row.technicalScore}
        </Badge>
      </td>
      <td className="px-2 py-1.5 text-xs text-muted">{row.technicalRating}</td>
      <td className="max-w-[160px] truncate px-2 py-1.5 text-xs text-muted" title={row.maTrend}>
        {row.maTrend}
      </td>
      <td className="max-w-[130px] truncate px-2 py-1.5 text-xs text-muted" title={row.momentum}>
        {row.momentum}
      </td>
    </tr>
  );
}
