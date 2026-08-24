"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  GitCompare,
  Loader2,
  RefreshCw,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SortableColumn } from "@/components/ui/sortable-column";
import { useTableSort } from "@/hooks/use-table-sort";
import { applySortDir, compareNumbers, compareStrings } from "@/lib/table-sort";
import { cn } from "@/lib/utils";
import {
  readLocalCache,
  writeLocalCache,
  LOCAL_CACHE_KEYS,
  LOCAL_CACHE_TTL,
} from "@/lib/client/local-storage-cache";
import type { HoldingAction, HoldingAnalysis, PortfolioAnalystResult } from "@/lib/analyst/portfolio";
import type { AgentReport, Verdict } from "@/lib/analyst/types";
import type { CombinedAnalysisRow } from "@/lib/analysis/combined-analysis";

const VERDICT_RANK: Record<Verdict, number> = {
  "STRONG BUY": 5,
  BUY: 4,
  ACCUMULATE: 3,
  HOLD: 2,
  TRIM: 1,
  AVOID: 0,
};

const ACTION_RANK: Record<HoldingAction, number> = {
  ACCUMULATE: 3,
  WAIT: 2,
  REVIEW: 1,
  HOLD: 0,
  TRIM: -1,
};

type Stance = "bullish" | "bearish" | "neutral";

function verdictStance(v: Verdict): Stance {
  if (v === "STRONG BUY" || v === "BUY" || v === "ACCUMULATE") return "bullish";
  if (v === "AVOID" || v === "TRIM") return "bearish";
  return "neutral";
}

function combinedStance(recommendation: string): Stance {
  const u = recommendation.toUpperCase();
  if (u === "ACCUMULATE") return "bullish";
  if (u === "AVOID" || u === "SELL" || u === "TRIM") return "bearish";
  return "neutral";
}

/**
 * AI Analyst (6-agent, conviction-weighted: financial .26/valuation .24/
 * technical .18/risk .14/news .10/macro .08) and Portfolio → Combined
 * (0.60×Technical + 0.40×Fundamental) are two independent scoring systems
 * over the same holding — by design, not a bug (different time horizons).
 * This only flags when they land on OPPOSITE sides (bullish vs bearish),
 * not every numeric disagreement, so it doesn't fire on routine noise.
 */
function divergesFromCombined(verdict: Verdict, combinedRow: CombinedAnalysisRow | undefined): boolean {
  if (!combinedRow) return false;
  const a = verdictStance(verdict);
  const b = combinedStance(combinedRow.recommendation);
  return (a === "bullish" && b === "bearish") || (a === "bearish" && b === "bullish");
}

function verdictVariant(verdict: Verdict): "success" | "danger" | "warning" | "info" | "default" {
  if (verdict === "STRONG BUY" || verdict === "BUY" || verdict === "ACCUMULATE") return "success";
  if (verdict === "HOLD") return "info";
  if (verdict === "TRIM") return "warning";
  return "danger";
}

function actionVariant(action: HoldingAnalysis["action"]): "success" | "danger" | "warning" | "info" {
  if (action === "ACCUMULATE") return "success";
  if (action === "TRIM" || action === "WAIT") return "warning";
  if (action === "REVIEW") return "danger";
  return "info";
}

function actionLabel(action: HoldingAnalysis["action"]): string {
  return action === "WAIT" ? "WAIT" : action;
}

function scoreColor(score: number): string {
  if (score >= 60) return "bg-emerald-500";
  if (score >= 45) return "bg-amber-500";
  return "bg-red-500";
}

function healthColor(score: number): string {
  if (score >= 60) return "text-emerald-500";
  if (score >= 45) return "text-amber-500";
  return "text-red-500";
}

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn("h-3.5 w-3.5", i <= n ? "fill-amber-400 text-amber-400" : "text-[var(--border-strong)]")} />
      ))}
    </span>
  );
}

function AgentChips({ agents }: { agents: AgentReport[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {agents.map((a) => (
        <div key={a.id} className="rounded-lg bg-[var(--bg-secondary)] p-2.5 ring-1 ring-[var(--border)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">{a.title}</span>
            <span className="font-mono text-xs font-bold">{a.score}</span>
          </div>
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--card)]">
            <div className={cn("h-full rounded-full", scoreColor(a.score))} style={{ width: `${a.score}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-muted">{a.headline}</p>
        </div>
      ))}
    </div>
  );
}

function HoldingRow({ h, combinedRow }: { h: HoldingAnalysis; combinedRow?: CombinedAnalysisRow }) {
  const [open, setOpen] = useState(false);
  const diverges = divergesFromCombined(h.verdict, combinedRow);
  return (
    <div className="rounded-xl ring-1 ring-[var(--border)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-secondary)]"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-subtle" /> : <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />}
        <div className="w-14 shrink-0 font-semibold text-accent">{h.symbol}</div>
        <div className="hidden w-12 shrink-0 text-right text-xs text-muted sm:block">
          {h.weightPct != null ? `${h.weightPct.toFixed(0)}%` : "—"}
        </div>
        <div className="hidden w-16 shrink-0 text-right font-mono text-xs sm:block">
          <span className={h.gainPct == null ? "text-muted" : h.gainPct >= 0 ? "text-emerald-500" : "text-red-500"}>
            {h.gainPct != null ? `${h.gainPct >= 0 ? "+" : ""}${h.gainPct.toFixed(1)}%` : "—"}
          </span>
        </div>
        <div className="flex flex-1 items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
            <div className={cn("h-full rounded-full", scoreColor(h.overallScore))} style={{ width: `${h.overallScore}%` }} />
          </div>
          <span className="font-mono text-xs font-bold">{h.overallScore}</span>
          <span className="hidden md:inline"><Stars n={h.stars} /></span>
        </div>
        <div className="w-24 shrink-0" title="Analytical rating from the 6-agent score">
          <Badge variant={verdictVariant(h.verdict)}>{h.verdict}</Badge>
        </div>
        <div
          className="hidden w-24 shrink-0 sm:block"
          title={
            h.action === "WAIT"
              ? "Fundamentals/valuation are attractive per the verdict, but the technical setup hasn't confirmed a turn yet — wait for confirmation before adding new capital."
              : "Suggested action given this rating + your P/L"
          }
        >
          <Badge variant={actionVariant(h.action)}>{actionLabel(h.action)}</Badge>
        </div>
        {diverges && (
          <span
            className="shrink-0 text-amber-500"
            title={`Diverges from Portfolio → Combined tab: ${combinedRow?.recommendation} (technical-weighted 60/40)`}
          >
            <GitCompare className="h-3.5 w-3.5" />
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-3 border-t border-[var(--border)] px-3 py-3">
          {!h.timingConfirmed && (
            <p className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>
                Timing not confirmed — technical score {h.technicalScore}/100. The verdict above reflects long-term
                conviction (fundamentals + valuation); consider waiting for the chart to turn before adding.
              </span>
            </p>
          )}
          {diverges && (
            <p className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">
              <GitCompare className="h-3.5 w-3.5 shrink-0" />
              <span>
                Diverges from Portfolio → Combined tab, which says <strong>{combinedRow?.recommendation}</strong> (0.60×Technical
                + 0.40×Fundamental — near-term timing weighted). This verdict weights financials/valuation more heavily for a
                longer horizon. Treat these as two different lenses, not a contradiction — Combined leans tactical, AI Analyst leans conviction.
              </span>
            </p>
          )}
          <div className="grid gap-2 md:grid-cols-2">
            <p className="flex gap-1.5 text-xs text-[var(--fg)]">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              <span>{h.topReason}</span>
            </p>
            <p className="flex gap-1.5 text-xs text-[var(--fg)]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span>{h.topRisk}</span>
            </p>
          </div>
          <AgentChips agents={h.agents} />
        </div>
      )}
    </div>
  );
}

export function AiHoldingsPanel({ combinedRows }: { combinedRows?: CombinedAnalysisRow[] }) {
  const [result, setResult] = useState<PortfolioAnalystResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ranRef = useRef(false);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyst/portfolio");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as PortfolioAnalystResult;
      setResult(data);
      writeLocalCache(LOCAL_CACHE_KEYS.aiHoldings, data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  // Auto-run once on mount; show cached result immediately if fresh.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    const cached = readLocalCache<PortfolioAnalystResult>(LOCAL_CACHE_KEYS.aiHoldings, LOCAL_CACHE_TTL.aiHoldings);
    if (cached) setResult(cached);
    else void run();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const verdictOrder: Verdict[] = ["STRONG BUY", "BUY", "ACCUMULATE", "HOLD", "TRIM", "AVOID"];
  const combinedBySymbol = new Map((combinedRows ?? []).map((r) => [r.symbol.toUpperCase(), r]));

  type SortKey = "symbol" | "weight" | "pl" | "conviction" | "verdict" | "action";
  const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>(null, "desc");
  const sortedHoldings = useMemo(() => {
    if (!result || !sortKey) return result?.holdings ?? [];
    return [...result.holdings].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "symbol":
          cmp = compareStrings(a.symbol, b.symbol);
          break;
        case "weight":
          cmp = compareNumbers(a.weightPct, b.weightPct);
          break;
        case "pl":
          cmp = compareNumbers(a.gainPct, b.gainPct);
          break;
        case "conviction":
          cmp = compareNumbers(a.overallScore, b.overallScore);
          break;
        case "verdict":
          cmp = compareNumbers(VERDICT_RANK[a.verdict], VERDICT_RANK[b.verdict]);
          break;
        case "action":
          cmp = compareNumbers(ACTION_RANK[a.action], ACTION_RANK[b.action]);
          break;
      }
      return applySortDir(cmp, sortDir);
    });
  }, [result, sortKey, sortDir]);

  return (
    <div className="space-y-4">
      <Card className="!p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="!mb-1 !text-base">AI Portfolio Analyst</CardTitle>
            <p className="text-xs text-muted">
              Runs the 6-agent analyst automatically on every holding, then synthesizes a portfolio-level review.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void run()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {loading ? "Analyzing…" : "Re-run"}
          </Button>
        </div>
      </Card>

      {error && (
        <Card className="border border-red-500/30 bg-red-500/5">
          <p className="flex items-center gap-2 text-sm text-red-500">
            <AlertTriangle className="h-4 w-4" /> {error}
          </p>
        </Card>
      )}

      {loading && !result && (
        <Card className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          Running multi-agent analysis across your holdings…
        </Card>
      )}

      {result && result.holdingsCount === 0 && !loading && (
        <Card className="py-10 text-center text-sm text-muted">
          No holdings found. Add positions on the Trading or Portfolio page, then re-run.
        </Card>
      )}

      {result && result.holdingsCount > 0 && (
        <>
          {/* Portfolio overview */}
          <Card glow className="!p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className={cn("font-mono text-4xl font-bold", healthColor(result.healthScore))}>{result.healthScore}</p>
                  <p className="text-[10px] uppercase tracking-wider text-subtle">Health / 100</p>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-accent" />
                    <span className="text-sm font-semibold">Portfolio Review</span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--fg)]">{result.summary}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {verdictOrder
                .filter((v) => result.verdictCounts[v])
                .map((v) => (
                  <Badge key={v} variant={verdictVariant(v)}>
                    {v}: {result.verdictCounts[v]}
                  </Badge>
                ))}
            </div>
          </Card>

          {/* Actions + Risks */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardTitle action={<TrendingUp className="h-4 w-4 text-emerald-500" />}>Suggested Actions</CardTitle>
              <ul className="space-y-2">
                {result.actions.map((a, i) => (
                  <li key={i} className="flex gap-2 text-sm text-[var(--fg)]">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardTitle action={<AlertTriangle className="h-4 w-4 text-amber-500" />}>Portfolio Risks</CardTitle>
              <ul className="space-y-2">
                {result.risks.map((r, i) => (
                  <li key={i} className="flex gap-2 text-sm text-[var(--fg)]">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* Per-holding breakdown */}
          <Card className="!p-4">
            <CardTitle className="!mb-1 !text-base">Per-Holding Verdicts</CardTitle>
            <p className="mb-3 text-[11px] text-muted">
              <span className="font-semibold">Verdict</span> = analytical rating from the 6-agent score ·
              <span className="font-semibold"> Action</span> = what to do given that rating + your current P/L ·
              <span className="font-semibold"> WAIT</span> = verdict is bullish but the technical chart hasn&apos;t
              confirmed the turn yet — reconciles conviction with entry timing instead of ignoring it.
              Click a row for the full agent breakdown.
            </p>
            <div className="mb-2 hidden items-center gap-3 px-3 text-[10px] uppercase tracking-wider text-subtle sm:flex">
              <span className="h-4 w-4" />
              <SortableColumn label="Ticker" column="symbol" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="w-14" />
              <SortableColumn label="Weight" column="weight" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="w-12 justify-end" />
              <SortableColumn label="P/L" column="pl" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="w-16 justify-end" />
              <SortableColumn label="Conviction" column="conviction" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="flex-1" />
              <SortableColumn label="Verdict" column="verdict" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="w-24" />
              <SortableColumn label="Action" column="action" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="w-24" />
            </div>
            <div className="space-y-1.5">
              {sortedHoldings.map((h) => (
                <HoldingRow key={h.symbol} h={h} combinedRow={combinedBySymbol.get(h.symbol.toUpperCase())} />
              ))}
            </div>
          </Card>

          <p className="text-center text-[11px] text-subtle">
            Generated {new Date(result.generatedAt).toLocaleString()} · review via {result.provider} ·
            Educational use only — not financial advice.
          </p>
        </>
      )}
    </div>
  );
}
