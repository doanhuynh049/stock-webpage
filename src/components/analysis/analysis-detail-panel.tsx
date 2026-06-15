"use client";

import Link from "next/link";
import { ExternalLink, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import type { FundamentalAnalysisRow } from "@/lib/analysis/fundamental-analysis";
import type {
  CombinedAnalysisRow,
  TechnicalAnalysisRow,
} from "@/lib/analysis/combined-analysis";

type Selection =
  | { kind: "fundamental"; row: FundamentalAnalysisRow }
  | { kind: "technical"; row: TechnicalAnalysisRow }
  | { kind: "combined"; row: CombinedAnalysisRow };

function scoreVariant(score: number) {
  if (score >= 70) return "success" as const;
  if (score >= 55) return "info" as const;
  if (score >= 40) return "warning" as const;
  return "danger" as const;
}

function recVariant(rec: string | undefined) {
  const u = (rec ?? "").toUpperCase();
  if (u.includes("ACCUMULATE") || u.includes("BUY")) return "success" as const;
  if (u.includes("SELL") || u.includes("AVOID")) return "danger" as const;
  if (u.includes("TRIM")) return "warning" as const;
  if (u.includes("WATCH")) return "info" as const;
  return "default" as const;
}

export function AnalysisDetailPanel({
  selection,
  onClose,
}: {
  selection: Selection;
  onClose: () => void;
}) {
  const sym = selection.row.symbol;
  const name =
    "name" in selection.row ? selection.row.name : sym;
  const sector =
    "sector" in selection.row ? selection.row.sector : "—";

  return (
    <Card className="!p-4 ring-2 ring-[var(--accent)]/30">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="!mb-0 !text-base">
            <Link
              href={`/stocks/${sym}`}
              className="text-accent hover:underline"
            >
              {sym}
            </Link>
            <span className="ml-2 font-normal text-muted">{name}</span>
          </CardTitle>
          <p className="mt-0.5 text-xs text-subtle">{sector}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted hover:bg-[var(--bg-secondary)]"
          aria-label="Close detail"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {selection.kind === "fundamental" && (
        selection.row.isEtf ? (
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-3 text-xs text-blue-900 dark:text-blue-200">
            <p className="font-semibold">ETF — No fundamental data available</p>
            <p className="mt-1 text-[11px] opacity-80">
              This is an Exchange-Traded Fund that tracks an index. P/E, P/B, ROE,
              and revenue growth are not applicable. Use the Technical tab to assess
              trend, momentum, and entry/exit timing.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Fundamental score" value={String(selection.row.breakdown.finalScore)} badge={scoreVariant(selection.row.breakdown.finalScore)} />
            <Metric label="Quality" value={String(selection.row.breakdown.qualityScore)} />
            <Metric label="Growth" value={String(selection.row.breakdown.growthScore)} />
            <Metric label="Valuation" value={String(selection.row.breakdown.valuationScore)} />
            <Metric label="Stability" value={String(selection.row.breakdown.stabilityScore)} />
            <Metric label="ROE" value={selection.row.roe != null ? `${selection.row.roe.toFixed(1)}%` : "—"} />
            <Metric label="P/E" value={selection.row.pe != null ? selection.row.pe.toFixed(1) : "—"} />
            <Metric label="P/B" value={selection.row.pb != null ? selection.row.pb.toFixed(2) : "—"} />
          </div>
        )
      )}

      {selection.kind === "technical" && (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant={scoreVariant(selection.row.technicalScore)} className="font-mono">
              Tech {selection.row.technicalScore}
            </Badge>
            <Badge variant="default">{selection.row.technicalRating}</Badge>
          </div>
          <p className="text-xs text-muted"><span className="font-medium text-[var(--fg)]">Trend:</span> {selection.row.maTrend}</p>
          <p className="text-xs text-muted"><span className="font-medium text-[var(--fg)]">Momentum:</span> {selection.row.momentum}</p>
          <p className="text-xs text-muted"><span className="font-medium text-[var(--fg)]">S/R:</span> {selection.row.supportResistance}</p>
        </div>
      )}

      {selection.kind === "combined" && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={scoreVariant(selection.row.technicalScore)} className="font-mono">Tech {selection.row.technicalScore}</Badge>
            {selection.row.isEtf ? (
              <Badge variant="default" className="font-mono text-subtle">Fund N/A</Badge>
            ) : (
              <Badge variant={scoreVariant(selection.row.fundamentalScore)} className="font-mono">Fund {selection.row.fundamentalScore}</Badge>
            )}
            <Badge variant={scoreVariant(selection.row.combinedScore)} className="font-mono font-semibold">
              {selection.row.isEtf ? "Tech-only" : "Combined"} {selection.row.combinedScore}
            </Badge>
            <Badge variant={recVariant(selection.row.recommendation)}>{selection.row.recommendation}</Badge>
          </div>
          {selection.row.isEtf && (
            <p className="mt-2 text-[11px] text-subtle italic">
              ETF — score is technical-only; fundamental analysis does not apply.
            </p>
          )}
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
        <Link
          href={`/stocks/${sym}`}
          className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg"
        >
          Full stock page <ExternalLink className="h-3 w-3" />
        </Link>
        <Link
          href={`/ai-analyst?symbol=${sym}`}
          className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ring-[var(--border)] hover:bg-[var(--bg-secondary)]"
        >
          <Sparkles className="h-3 w-3 text-accent" /> Ask AI Analyst
        </Link>
      </div>
      <p className="mt-2 text-[10px] text-subtle">
        Click a row for this panel · Click symbol for full stock detail (chart, fundamentals, news)
      </p>
    </Card>
  );
}

function Metric({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: "success" | "info" | "warning" | "danger";
}) {
  return (
    <div className="rounded-lg bg-[var(--bg-secondary)] px-3 py-2 ring-1 ring-[var(--border)]">
      <p className="text-[10px] uppercase text-subtle">{label}</p>
      {badge ? (
        <Badge variant={badge} className="mt-1 font-mono">{value}</Badge>
      ) : (
        <p className="mt-1 font-mono text-sm font-semibold">{value}</p>
      )}
    </div>
  );
}

export type { Selection };
