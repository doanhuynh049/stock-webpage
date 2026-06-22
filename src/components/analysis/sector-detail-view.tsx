"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { StockAvatar } from "@/components/ui/stock-avatar";
import { SortableTableHeader } from "@/components/ui/sortable-table-header";
import { useTableSort } from "@/hooks/use-table-sort";
import { applySortDir, compareNumbers, compareStrings } from "@/lib/table-sort";
import { formatPortfolioAmount, formatPortfolioPercent, changeColor } from "@/lib/utils";
import { getSectorColor, shortSectorName } from "@/lib/sector-colors";
import type { SectorDetailData, SectorDetailStockRow } from "@/lib/analysis/sector-detail";
import type { EnrichedHolding } from "@/lib/portfolio/holdings-enrichment";

function statusVariant(status: SectorDetailData["status"]) {
  if (status === "ON TARGET") return "success" as const;
  if (status === "OVERWEIGHT") return "warning" as const;
  if (status === "UNDERWEIGHT") return "info" as const;
  return "default" as const;
}

function recVariant(rec: string) {
  const u = rec.toUpperCase();
  if (u.includes("ACCUMULATE") || u.includes("BUY")) return "success" as const;
  if (u.includes("SELL") || u.includes("AVOID")) return "danger" as const;
  if (u.includes("TRIM")) return "warning" as const;
  if (u.includes("WATCH")) return "info" as const;
  return "default" as const;
}

function scoreColor(score: number): string {
  if (score >= 65) return "text-[var(--success)]";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-[var(--danger)]";
}

// ─── Holdings Section ────────────────────────────────────────────────────────

function HoldingsSection({ holdings }: { holdings: EnrichedHolding[] }) {
  if (!holdings.length) {
    return (
      <Card className="!p-4">
        <CardTitle className="!mb-1 !text-base">My Holdings</CardTitle>
        <p className="text-xs text-muted">You don&apos;t own any stocks in this sector.</p>
      </Card>
    );
  }

  const totalCostK = holdings.reduce((s, h) => s + h.costBasis, 0);
  const totalValueK = holdings.reduce((s, h) => s + (h.currentValueK ?? h.costBasis), 0);
  const totalGainK = holdings.reduce((s, h) => s + (h.gainLossK ?? 0), 0);

  return (
    <Card className="!p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="!mb-0 !text-base">My Holdings</CardTitle>
        <div className="flex flex-wrap gap-3 text-xs text-muted">
          <span>Cost <span className="font-mono font-semibold text-[var(--fg)]">{formatPortfolioAmount(totalCostK, 0)}</span></span>
          <span>Value <span className="font-mono font-semibold text-[var(--fg)]">{formatPortfolioAmount(totalValueK, 0)}</span></span>
          <span className={`font-mono font-semibold ${changeColor(totalGainK)}`}>
            {totalGainK >= 0 ? "+" : ""}{formatPortfolioAmount(totalGainK, 0)}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg ring-1 ring-[var(--border)]">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-left text-[10px] uppercase text-subtle">
              <th className="px-2 py-1.5">Symbol</th>
              <th className="px-2 py-1.5 text-right">Shares</th>
              <th className="px-2 py-1.5 text-right">Avg</th>
              <th className="px-2 py-1.5 text-right">Price</th>
              <th className="px-2 py-1.5 text-right">Gain %</th>
              <th className="px-2 py-1.5 text-right">3M Target</th>
              <th className="px-2 py-1.5 text-center">3M Progress</th>
              <th className="px-2 py-1.5 text-right">Upside to 3M</th>
              <th className="px-2 py-1.5 text-right">LT Target</th>
              <th className="px-2 py-1.5 text-right">LT Upside</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const upsideTo3M =
                h.target3Month && h.currentPriceK
                  ? ((h.target3Month - h.currentPriceK) / h.currentPriceK) * 100
                  : null;
              const upsideToLT =
                h.targetLongTerm && h.currentPriceK
                  ? ((h.targetLongTerm - h.currentPriceK) / h.currentPriceK) * 100
                  : null;
              return (
                <tr
                  key={h.symbol}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--card-hover)]"
                >
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <StockAvatar symbol={h.symbol} sector={h.sector ?? undefined} size="sm" />
                      <Link href={`/stocks/${h.symbol}`} className="font-semibold text-accent hover:underline">
                        {h.symbol}
                      </Link>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs">{h.shares.toLocaleString("vi-VN")}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs">{formatPortfolioAmount(h.avgBuyPrice)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs">
                    {h.currentPriceK != null ? formatPortfolioAmount(h.currentPriceK) : "—"}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-mono text-xs ${h.gainPct != null ? changeColor(h.gainPct) : "text-subtle"}`}>
                    {h.gainPct != null ? formatPortfolioPercent(h.gainPct) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs text-muted">
                    {h.target3Month ? formatPortfolioAmount(h.target3Month) : "—"}
                  </td>
                  <td className="px-2 py-1.5">
                    {h.toTargetPct != null ? (
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                          <div
                            className={`h-full rounded-full ${h.toTargetPct >= 100 ? "bg-[var(--success)]" : (h.gainPct ?? 0) < 0 ? "bg-[var(--danger)]" : "bg-accent"}`}
                            style={{ width: `${Math.min(100, h.toTargetPct)}%` }}
                          />
                        </div>
                        <span className="font-mono text-[10px] text-muted">{h.toTargetPct.toFixed(0)}%</span>
                      </div>
                    ) : "—"}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-mono text-xs font-semibold ${upsideTo3M != null ? changeColor(upsideTo3M) : "text-subtle"}`}>
                    {upsideTo3M != null ? `${upsideTo3M >= 0 ? "+" : ""}${upsideTo3M.toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs text-muted">
                    {h.targetLongTerm ? formatPortfolioAmount(h.targetLongTerm) : "—"}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-mono text-xs font-semibold ${upsideToLT != null ? changeColor(upsideToLT) : "text-subtle"}`}>
                    {upsideToLT != null ? `${upsideToLT >= 0 ? "+" : ""}${upsideToLT.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Stocks Table ─────────────────────────────────────────────────────────────

function StocksTable({ stocks, sectorName, title, subtitle }: {
  stocks: SectorDetailStockRow[];
  sectorName: string;
  title: string;
  subtitle: string;
}) {
  type SortKey = "symbol" | "price" | "fund" | "tech" | "combined" | "rec" | "rsi" | "pe";
  const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>("combined", "desc");

  const sorted = useMemo(() => {
    if (!sortKey) return stocks;
    return [...stocks].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "symbol": cmp = compareStrings(a.symbol, b.symbol); break;
        case "price":  cmp = compareNumbers(a.currentPriceK, b.currentPriceK); break;
        case "fund":   cmp = compareNumbers(a.fundScore, b.fundScore); break;
        case "tech":   cmp = compareNumbers(a.techScore, b.techScore); break;
        case "combined": cmp = compareNumbers(a.combinedScore, b.combinedScore); break;
        case "rec":    cmp = compareStrings(a.recommendation, b.recommendation); break;
        case "rsi":    cmp = compareNumbers(a.rsi, b.rsi); break;
        case "pe":     cmp = compareNumbers(a.peRatio, b.peRatio); break;
      }
      return applySortDir(cmp, sortDir);
    });
  }, [stocks, sortKey, sortDir]);

  if (!stocks.length) return null;

  return (
    <Card className="!p-4">
      <CardTitle className="!mb-1 !text-base">{title}</CardTitle>
      <p className="mb-3 text-xs text-muted">{subtitle}</p>
      <div className="overflow-x-auto rounded-lg ring-1 ring-[var(--border)]">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-left text-[10px] uppercase text-subtle">
              <th className="px-2 py-1.5">#</th>
              <SortableTableHeader label="Symbol" column="symbol" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-2 py-1.5" />
              <SortableTableHeader label="Price" column="price" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" className="px-2 py-1.5" />
              <SortableTableHeader label="Fund" column="fund" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
              <SortableTableHeader label="Tech" column="tech" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
              <SortableTableHeader label="Score" column="combined" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
              <SortableTableHeader label="Rec" column="rec" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
              <SortableTableHeader label="RSI" column="rsi" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
              <SortableTableHeader label="P/E" column="pe" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.symbol} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--card-hover)]">
                <td className="px-2 py-1.5 text-subtle text-xs">{i + 1}</td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <StockAvatar symbol={r.symbol} sector={sectorName} size="sm" />
                    <div>
                      <Link href={`/stocks/${r.symbol}`} className="font-semibold text-accent hover:underline">
                        {r.symbol}
                      </Link>
                      {r.owned && <Badge variant="info" className="ml-1 text-[9px]">Owned</Badge>}
                      <div className="max-w-[120px] truncate text-[10px] text-muted">{r.name}</div>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-xs">
                  {r.currentPriceK != null ? formatPortfolioAmount(r.currentPriceK) : "—"}
                </td>
                <td className={`px-2 py-1.5 text-center font-mono text-xs ${scoreColor(r.fundScore)}`}>{r.fundScore}</td>
                <td className={`px-2 py-1.5 text-center font-mono text-xs ${scoreColor(r.techScore)}`}>{r.techScore}</td>
                <td className={`px-2 py-1.5 text-center font-mono font-bold ${scoreColor(r.combinedScore)}`}>{r.combinedScore}</td>
                <td className="px-2 py-1.5 text-center">
                  <Badge variant={recVariant(r.recommendation)} className="text-[9px]">{r.recommendation}</Badge>
                </td>
                <td className="px-2 py-1.5 text-center font-mono text-xs">{r.rsi != null ? r.rsi.toFixed(1) : "—"}</td>
                <td className="px-2 py-1.5 text-center font-mono text-xs">{r.peRatio != null ? r.peRatio.toFixed(1) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function SectorDetailView({ data }: { data: SectorDetailData }) {
  const color = getSectorColor(data.sectorName);
  const shortName = shortSectorName(data.sectorName);

  const unownedStocks = data.stocks.filter((s) => !s.owned);
  const ownedStocks = data.stocks.filter((s) => s.owned);

  const [showAllStocks, setShowAllStocks] = useState(false);
  const visibleUnowned = showAllStocks ? unownedStocks : unownedStocks.slice(0, 5);

  const allocationBarMax = Math.max(data.targetPct, data.currentPct, 5);

  return (
    <div className="space-y-4">
      {/* ── Header card ─────────────────────────────────────────────────────── */}
      <Card className="!p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
              style={{ background: color }}
            >
              {shortName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--fg)]">{data.sectorName}</h1>
              <p className="text-xs text-muted">
                Generated {new Date(data.generatedAt).toLocaleString()} ·{" "}
                {data.stocks.length} stocks analyzed
              </p>
            </div>
          </div>
          <Badge variant={statusVariant(data.status)} className="text-xs px-2 py-1">
            {data.status}
          </Badge>
        </div>

        {/* Allocation bar */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Allocation</span>
            <div className="flex items-center gap-3">
              <span className="text-muted">
                Target <span className="font-mono font-semibold text-[var(--fg)]">{data.targetPct.toFixed(1)}%</span>
              </span>
              <span className="text-muted">
                Current <span className="font-mono font-semibold text-[var(--fg)]">{data.currentPct.toFixed(2)}%</span>
              </span>
              <span className={`font-mono font-semibold ${data.deltaPct > 2 ? "text-amber-600 dark:text-amber-400" : data.deltaPct < -2 ? "text-blue-600 dark:text-blue-400" : "text-muted"}`}>
                {data.deltaPct >= 0 ? "+" : ""}{data.deltaPct.toFixed(2)}%
              </span>
            </div>
          </div>
          <div className="relative h-3 rounded-full bg-[var(--bg-secondary)]">
            {/* Target marker */}
            <div
              className="absolute top-0 h-full w-0.5 bg-[var(--fg)]/30 rounded-full"
              style={{ left: `${(data.targetPct / allocationBarMax) * 100}%` }}
            />
            {/* Current bar */}
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${(data.currentPct / allocationBarMax) * 100}%`,
                background: `linear-gradient(90deg, ${color}99, ${color})`,
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-subtle">
            <span>0%</span>
            <span className="font-mono">{allocationBarMax.toFixed(0)}%</span>
          </div>
        </div>

        {/* Quick stats */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg bg-[var(--bg-secondary)] px-3 py-2 ring-1 ring-[var(--border)]">
            <p className="text-[10px] uppercase text-subtle">Sector value</p>
            <p className="mt-0.5 font-mono text-sm font-bold">{formatPortfolioAmount(data.sectorValueK, 0)}</p>
          </div>
          <div className="rounded-lg bg-[var(--bg-secondary)] px-3 py-2 ring-1 ring-[var(--border)]">
            <p className="text-[10px] uppercase text-subtle">Owned stocks</p>
            <p className="mt-0.5 font-mono text-sm font-bold">{data.ownedHoldings.length}</p>
          </div>
          <div className="rounded-lg bg-[var(--bg-secondary)] px-3 py-2 ring-1 ring-[var(--border)]">
            <p className="text-[10px] uppercase text-subtle">Top score</p>
            <p className={`mt-0.5 font-mono text-sm font-bold ${scoreColor(data.stocks[0]?.combinedScore ?? 0)}`}>
              {data.stocks[0]?.combinedScore ?? "—"} <span className="text-xs font-normal text-muted">{data.stocks[0]?.symbol}</span>
            </p>
          </div>
          <div className="rounded-lg bg-[var(--bg-secondary)] px-3 py-2 ring-1 ring-[var(--border)]">
            <p className="text-[10px] uppercase text-subtle">Accumulate</p>
            <p className="mt-0.5 font-mono text-sm font-bold text-[var(--success)]">
              {data.stocks.filter((s) => s.recommendation.toUpperCase().includes("ACCUMULATE") || s.recommendation.toUpperCase().includes("BUY")).length}
            </p>
          </div>
        </div>
      </Card>

      {/* ── My Holdings ──────────────────────────────────────────────────────── */}
      <HoldingsSection holdings={data.ownedHoldings} />

      {/* ── Top picks to invest ──────────────────────────────────────────────── */}
      {unownedStocks.length > 0 && (
        <Card className="!p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="!mb-0.5 !text-base">Stocks to Watch / Invest</CardTitle>
              <p className="text-xs text-muted">
                Unowned stocks ranked by combined score — candidates for new positions or additions
              </p>
            </div>
            {unownedStocks.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllStocks((v) => !v)}
                className="rounded px-2 py-1 text-[10px] font-medium text-accent ring-1 ring-accent/30 hover:bg-accent/10"
              >
                {showAllStocks ? "Show less" : `Show all ${unownedStocks.length}`}
              </button>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visibleUnowned.map((s, i) => (
              <Link
                key={s.symbol}
                href={`/stocks/${s.symbol}`}
                className="group rounded-xl bg-[var(--bg-secondary)] p-3 ring-1 ring-[var(--border)] hover:ring-[var(--accent)]/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] text-subtle shrink-0">#{i + 1}</span>
                    <StockAvatar symbol={s.symbol} sector={data.sectorName} size="sm" />
                    <div className="min-w-0">
                      <p className="font-semibold text-accent group-hover:underline">{s.symbol}</p>
                      <p className="truncate text-[10px] text-muted">{s.name}</p>
                    </div>
                  </div>
                  <span className={`font-mono text-lg font-bold shrink-0 ${scoreColor(s.combinedScore)}`}>
                    {s.combinedScore}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant={recVariant(s.recommendation)} className="text-[9px]">{s.recommendation}</Badge>
                  {s.currentPriceK != null && (
                    <span className="font-mono text-[10px] text-muted">{formatPortfolioAmount(s.currentPriceK)}</span>
                  )}
                  {s.rsi != null && (
                    <span className="text-[10px] text-subtle">RSI {s.rsi.toFixed(0)}</span>
                  )}
                  {s.peRatio != null && (
                    <span className="text-[10px] text-subtle">P/E {s.peRatio.toFixed(1)}</span>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1">
                  {[["F", s.fundScore], ["T", s.techScore], ["C", s.combinedScore]].map(([lbl, val]) => (
                    <div key={lbl} className="rounded bg-[var(--card)] px-1.5 py-0.5 text-center">
                      <p className="text-[8px] text-subtle">{lbl}</p>
                      <p className={`font-mono text-xs font-semibold ${scoreColor(Number(val))}`}>{val}</p>
                    </div>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* ── Full sector leader table ─────────────────────────────────────────── */}
      <StocksTable
        stocks={ownedStocks.length > 0 ? ownedStocks : []}
        sectorName={data.sectorName}
        title="Owned — detailed scores"
        subtitle="Your holdings ranked by combined fundamental + technical score"
      />
      <StocksTable
        stocks={data.stocks}
        sectorName={data.sectorName}
        title="All sector stocks — ranked"
        subtitle={`All ${data.stocks.length} tracked stocks in this sector sorted by combined score`}
      />
    </div>
  );
}
