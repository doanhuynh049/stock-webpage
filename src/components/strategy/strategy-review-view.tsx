"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { StockAvatar } from "@/components/ui/stock-avatar";
import { SortableTableHeader } from "@/components/ui/sortable-table-header";
import { useTableSort } from "@/hooks/use-table-sort";
import { applySortDir, compareNumbers, compareStrings } from "@/lib/table-sort";
import type { StrategyReview } from "@/lib/strategy/strategy-review";
import { formatPortfolioAmount, formatPortfolioPercent } from "@/lib/utils";
import { SECTOR_NAME_TO_ROUTE_ID } from "@/lib/sector-colors";

function actionVariant(action: string) {
  if (action === "STOP_LOSS" || action === "SECTOR_CAP") return "danger" as const;
  if (action === "TAKE_PROFIT" || action === "TARGET_REACHED") return "success" as const;
  if (action === "TRIM" || action === "MONITOR_POSITION") return "warning" as const;
  if (action === "BUY_MORE") return "info" as const;
  return "default" as const;
}

function statusVariant(status: string) {
  if (status === "OVER" || status === "OVER_TARGET") return "danger" as const;
  if (status === "NEAR_LIMIT") return "warning" as const;
  if (status === "IN_BAND" || status === "OK") return "success" as const;
  return "default" as const;
}

export function StrategyReviewView({ review }: { review: StrategyReview }) {
  type SortKey = "symbol" | "bucket" | "alloc" | "pl" | "status" | "action" | "reason";
  const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>("alloc", "desc");
  const sortedHoldings = useMemo(() => {
    if (!sortKey) return review.holdingMappings;
    return [...review.holdingMappings].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "symbol":
          cmp = compareStrings(a.symbol, b.symbol);
          break;
        case "bucket":
          cmp = compareStrings(a.strategyBucket, b.strategyBucket);
          break;
        case "alloc":
          cmp = compareNumbers(a.allocPct, b.allocPct);
          break;
        case "pl":
          cmp = compareNumbers(a.plPct, b.plPct);
          break;
        case "status":
          cmp = compareStrings(a.allocStatus, b.allocStatus);
          break;
        case "action":
          cmp = compareStrings(a.primaryAction, b.primaryAction);
          break;
        case "reason":
          cmp = compareStrings(a.actionReason, b.actionReason);
          break;
      }
      return applySortDir(cmp, sortDir);
    });
  }, [review.holdingMappings, sortKey, sortDir]);

  const alerts: { tone: "danger" | "warning" | "success"; text: string }[] = [];

  if (review.stopLossCandidates.length) {
    alerts.push({
      tone: "danger",
      text: `${review.stopLossCandidates.length} holding(s) hit stop-loss threshold`,
    });
  }
  if (review.takeProfitCandidates.length) {
    alerts.push({
      tone: "warning",
      text: `${review.takeProfitCandidates.length} holding(s) at take-profit / target`,
    });
  }
  if (review.trimCandidates.length) {
    alerts.push({
      tone: "warning",
      text: `${review.trimCandidates.length} position(s) over max allocation (${review.maxPerStock}%)`,
    });
  }
  if (review.sectorViolations.length) {
    alerts.push({
      tone: "danger",
      text: `${review.sectorViolations.length} sector(s) exceed ${review.maxPerSector}% cap`,
    });
  }
  if (!alerts.length) {
    alerts.push({ tone: "success", text: "All clear — portfolio within strategy limits" });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Strategy Review"
        description="Core–Satellite compliance vs your investment framework"
        badge={
          <Badge variant={review.overallCompliant ? "success" : "warning"}>
            {review.overallCompliant ? "Compliant" : `${review.urgentActionCount} action(s)`}
          </Badge>
        }
      />

      <div className="flex flex-wrap gap-2">
        {alerts.map((a) => (
          <div
            key={a.text}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ring-1 ${
              a.tone === "danger"
                ? "bg-red-500/10 text-red-700 ring-red-500/30 dark:text-red-200"
                : a.tone === "warning"
                  ? "bg-amber-500/10 text-amber-800 ring-amber-500/30 dark:text-amber-100"
                  : "bg-emerald-500/10 text-emerald-800 ring-emerald-500/30 dark:text-emerald-100"
            }`}
          >
            {a.tone === "success" ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" />
            )}
            {a.text}
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total cost"
          value={formatPortfolioAmount(review.totalCost, 0)}
          subValue="Cost basis"
          icon={Target}
          accent="emerald"
        />
        <StatCard
          label="Market value"
          value={formatPortfolioAmount(review.totalValue, 0)}
          subValue="Live quotes"
          icon={Target}
          accent="cyan"
        />
        <StatCard
          label="P/L"
          value={formatPortfolioAmount(review.totalPL, 0)}
          subValue={formatPortfolioPercent(review.totalPLPct)}
          icon={Target}
          accent={review.totalPL >= 0 ? "violet" : "amber"}
        />
        <StatCard
          label="Target return"
          value={review.targetReturn}
          subValue={`TP +${review.takeProfitThreshold}% · SL ${review.stopLossThreshold}%`}
          icon={Target}
          accent="amber"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="!p-4">
          <CardTitle className="!mb-3 !text-base">Core vs Satellite</CardTitle>
          <AlignmentBar
            label="Core"
            actual={review.coreVsSatellite.coreActual}
            target={review.coreVsSatellite.coreTarget}
            drift={review.coreVsSatellite.coreDrift}
          />
          <AlignmentBar
            label="Satellite"
            actual={review.coreVsSatellite.satelliteActual}
            target={review.coreVsSatellite.satelliteTarget}
            drift={review.coreVsSatellite.satelliteDrift}
          />
        </Card>

        <Card className="!p-4">
          <CardTitle className="!mb-3 !text-base">Sector allocation</CardTitle>
          <div className="max-h-56 space-y-2 overflow-y-auto">
            {review.sectorRows.map((s) => (
              <div key={s.sector} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    {SECTOR_NAME_TO_ROUTE_ID[s.sector] ? (
                      <Link
                        href={`/analysis/sector/${SECTOR_NAME_TO_ROUTE_ID[s.sector]}`}
                        className="font-medium text-accent hover:underline"
                      >
                        {s.sector}
                      </Link>
                    ) : (
                      <span className="font-medium text-[var(--fg)]">{s.sector}</span>
                    )}
                  </div>
                  <span className="text-muted">
                    {s.pct.toFixed(1)}%
                    {s.target != null ? ` / ${s.target}%` : ""}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{ width: `${Math.min(100, s.pct)}%` }}
                  />
                </div>
                <div className="flex gap-2">
                  <Badge variant={statusVariant(s.status)} className="text-[9px]">
                    {s.status}
                  </Badge>
                  {s.targetStatus !== "NO_TARGET" && (
                    <Badge variant={statusVariant(s.targetStatus)} className="text-[9px]">
                      {s.targetStatus.replace("_", " ")}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <CardTitle className="!mb-0 !text-base">Holdings vs strategy</CardTitle>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-left text-[10px] uppercase text-subtle">
                <SortableTableHeader label="Symbol" column="symbol" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
                <SortableTableHeader label="Bucket" column="bucket" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
                <SortableTableHeader label="Alloc %" column="alloc" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" className="px-3 py-2" />
                <SortableTableHeader label="P/L %" column="pl" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" className="px-3 py-2" />
                <SortableTableHeader label="Status" column="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-3 py-2" />
                <SortableTableHeader label="Action" column="action" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="center" className="px-3 py-2" />
                <SortableTableHeader label="Reason" column="reason" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sortedHoldings.map((h) => (
                  <tr
                    key={h.symbol}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--card-hover)]"
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <StockAvatar symbol={h.symbol} sector={h.sector ?? undefined} size="sm" />
                        <div>
                          <Link
                            href={`/stocks/${h.symbol}`}
                            className="font-semibold text-accent hover:underline"
                          >
                            {h.symbol}
                          </Link>
                          {h.name && (
                            <div className="text-[10px] text-subtle">{h.name}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {h.strategyBucket}
                      <div className="text-[10px] text-subtle">{h.bucketCategory}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{h.allocPct.toFixed(1)}%</td>
                    <td
                      className={`px-3 py-2 text-right font-mono ${
                        h.plPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {formatPortfolioPercent(h.plPct)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant={statusVariant(h.allocStatus)} className="text-[9px]">
                        {h.allocStatus}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant={actionVariant(h.primaryAction)} className="text-[9px]">
                        {h.primaryAction}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">{h.actionReason}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      {review.goldenRules.length > 0 && (
        <Card className="!p-4">
          <CardTitle className="!mb-2 !text-base">Golden rules</CardTitle>
          <ul className="space-y-1 text-sm text-muted">
            {review.goldenRules.map((rule) => (
              <li key={rule} className="flex gap-2">
                <span className="text-accent">•</span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function AlignmentBar({
  label,
  actual,
  target,
  drift,
}: {
  label: string;
  actual: number;
  target: number;
  drift: number;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted">
          {actual.toFixed(1)}% / {target}% ({drift >= 0 ? "+" : ""}
          {drift.toFixed(1)}pp)
        </span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]"
          style={{ width: `${Math.min(100, actual)}%` }}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-[var(--fg)]/40"
          style={{ left: `${target}%` }}
        />
      </div>
    </div>
  );
}
