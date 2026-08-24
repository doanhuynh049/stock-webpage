"use client";

import { useMemo, useState } from "react";
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

const STATUS_ORDER: Record<SectorRollup["status"], number> = {
  OVERWEIGHT: 0,
  "ON TARGET": 1,
  UNDERWEIGHT: 2,
  "NO TARGET": 3,
};

function LeaderTable({ sector, tableRef }: { sector: SectorRollup; tableRef: React.RefObject<HTMLDivElement | null> }) {
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
    <div ref={tableRef}>
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
    </div>
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

export function SectorAnalysisView({
  data,
  initialSectorTargets,
}: {
  data: SectorAnalysisResult;
  initialSectorTargets?: Record<string, number>;
}) {
  // Local editable target overrides — keyed by sector id
  const [editTargets, setEditTargets] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Refs for each sector's LeaderTable so we can scroll to them. Built with
  // useMemo (not mutated during render) so React never reads/writes ref
  // values while rendering — only on the memo recompute triggered by a
  // `data.sectors` change.
  const sectorRefs = useMemo(() => {
    const map: Record<string, React.RefObject<HTMLDivElement | null>> = {};
    for (const s of data.sectors) {
      map[s.id] = { current: null };
    }
    return map;
  }, [data.sectors]);

  function scrollToSector(id: string) {
    sectorRefs[id]?.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveSectorTarget(sectorId: string, rawValue: string) {
    const parsed = parseFloat(rawValue);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) return;
    setSaving(true);
    setSaveMsg(null);
    // Build updated sectorTargets from initial + any edits + this new one
    const base = initialSectorTargets ?? {};
    const updated: Record<string, number> = { ...base };
    for (const [k, v] of Object.entries(editTargets)) {
      const n = parseFloat(v);
      if (!isNaN(n)) updated[k] = n;
    }
    updated[sectorId] = parsed;
    try {
      const res = await fetch("/api/strategy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectorTargets: updated }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(null), 2000);
    } catch {
      setSaveMsg("Save failed");
    } finally {
      setSaving(false);
    }
  }

  type SectorSortKey = "sector" | "target" | "current" | "delta" | "status" | "leaders";
  const { sortKey, sortDir, toggleSort } = useTableSort<SectorSortKey>("status", "asc");
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
        case "status":
          cmp = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
          break;
        case "leaders":
          cmp = compareNumbers(a.leaderCount, b.leaderCount);
          break;
      }
      return applySortDir(cmp, sortDir);
    });
  }, [data.sectors, sortKey, sortDir]);

  // For LeaderTables we always render in original data order
  const sectorById = useMemo(() => Object.fromEntries(data.sectors.map((s) => [s.id, s])), [data.sectors]);

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
        {saveMsg && (
          <span className={`font-medium ${saveMsg === "Saved" ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
            {saveMsg}
          </span>
        )}
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
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <CardTitle className="!mb-0 !text-base">Sector allocation — target vs current</CardTitle>
          <p className="text-[10px] text-subtle">Click target % to edit · Click sector name to jump to detail table</p>
        </div>
        <div className="table-scroll overflow-x-auto rounded-lg ring-1 ring-[var(--border)]">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-left text-[10px] uppercase text-subtle">
                <SortableTableHeader label="Sector" column="sector" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-2 py-1.5" />
                <SortableTableHeader label="Target %" column="target" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" className="px-2 py-1.5" />
                <SortableTableHeader label="Current %" column="current" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" className="px-2 py-1.5" />
                <SortableTableHeader label="Δ" column="delta" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" className="px-2 py-1.5" />
                <SortableTableHeader label="Status" column="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
                <SortableTableHeader label="Leaders" column="leaders" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {sortedSectors.map((s) => {
                const editKey = s.id;
                const rawEdit = editTargets[editKey];
                const displayTarget = rawEdit !== undefined ? rawEdit : s.targetPct.toFixed(1);
                return (
                  <tr key={s.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--card-hover)]">
                    <td className="px-2 py-1.5 font-medium">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="text-left text-accent hover:underline"
                          onClick={() => scrollToSector(s.id)}
                        >
                          {s.name}
                        </button>
                        <Link
                          href={`/analysis/sector/${s.id}`}
                          className="rounded px-1 py-0.5 text-[9px] font-medium text-muted ring-1 ring-[var(--border)] hover:text-accent hover:ring-accent/40 transition-colors"
                          title="Open sector detail page"
                        >
                          Detail →
                        </Link>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="text"
                        inputMode="decimal"
                        disabled={saving}
                        className="w-14 rounded bg-transparent px-1 py-0.5 text-right font-mono text-xs ring-1 ring-transparent hover:ring-[var(--border)] focus:ring-[var(--accent)] focus:outline-none"
                        value={displayTarget}
                        onChange={(e) => setEditTargets((prev) => ({ ...prev, [editKey]: e.target.value }))}
                        onBlur={() => {
                          if (rawEdit !== undefined) {
                            void saveSectorTarget(editKey, rawEdit);
                            setEditTargets((prev) => {
                              const next = { ...prev };
                              delete next[editKey];
                              return next;
                            });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                          } else if (e.key === "Escape") {
                            setEditTargets((prev) => {
                              const next = { ...prev };
                              delete next[editKey];
                              return next;
                            });
                          }
                        }}
                        title="Click to edit target %"
                      />
                      <span className="ml-0.5 text-xs text-muted">%</span>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">{s.currentPct.toFixed(2)}%</td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      <span className={
                        Math.abs(s.deltaPct) <= 2
                          ? "text-muted"
                          : s.deltaPct > 0
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-blue-600 dark:text-blue-400"
                      }>
                        {s.deltaPct >= 0 ? "+" : ""}
                        {s.deltaPct.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Badge variant={statusVariant(s.status)} className="text-[9px]">
                        {s.status}
                      </Badge>
                    </td>
                    <td className="px-2 py-1.5 text-center font-mono">{s.leaderCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {data.sectors.map((sec) => (
        <LeaderTable
          key={sec.id}
          sector={sectorById[sec.id] ?? sec}
          tableRef={sectorRefs[sec.id]!}
        />
      ))}
    </div>
  );
}
