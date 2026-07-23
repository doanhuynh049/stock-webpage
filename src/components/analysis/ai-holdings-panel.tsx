"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { readLocalCache, writeLocalCache } from "@/lib/client/local-storage-cache";
import type { HoldingAnalysis, PortfolioAnalystResult } from "@/lib/analyst/portfolio";
import type { AgentReport, Verdict } from "@/lib/analyst/types";

const CACHE_KEY = "ai-holdings";
const TTL = 30 * 60 * 1000; // 30 min

function verdictVariant(verdict: Verdict): "success" | "danger" | "warning" | "info" | "default" {
  if (verdict === "STRONG BUY" || verdict === "BUY" || verdict === "ACCUMULATE") return "success";
  if (verdict === "HOLD") return "info";
  if (verdict === "TRIM") return "warning";
  return "danger";
}

function actionVariant(action: HoldingAnalysis["action"]): "success" | "danger" | "warning" | "info" {
  if (action === "ACCUMULATE") return "success";
  if (action === "TRIM") return "warning";
  if (action === "REVIEW") return "danger";
  return "info";
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

function HoldingRow({ h }: { h: HoldingAnalysis }) {
  const [open, setOpen] = useState(false);
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
        <div className="hidden w-24 shrink-0 sm:block" title="Suggested action given this rating + your P/L">
          <Badge variant={actionVariant(h.action)}>{h.action}</Badge>
        </div>
      </button>

      {open && (
        <div className="space-y-3 border-t border-[var(--border)] px-3 py-3">
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

export function AiHoldingsPanel() {
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
      writeLocalCache(CACHE_KEY, data);
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
    const cached = readLocalCache<PortfolioAnalystResult>(CACHE_KEY, TTL);
    if (cached) setResult(cached);
    else void run();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const verdictOrder: Verdict[] = ["STRONG BUY", "BUY", "ACCUMULATE", "HOLD", "TRIM", "AVOID"];

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
              <span className="font-semibold"> Action</span> = what to do given that rating + your current P/L.
              Click a row for the full agent breakdown.
            </p>
            <div className="mb-2 hidden items-center gap-3 px-3 text-[10px] uppercase tracking-wider text-subtle sm:flex">
              <span className="h-4 w-4" />
              <span className="w-14">Ticker</span>
              <span className="w-12 text-right">Weight</span>
              <span className="w-16 text-right">P/L</span>
              <span className="flex-1">Conviction</span>
              <span className="w-24">Verdict</span>
              <span className="w-24">Action</span>
            </div>
            <div className="space-y-1.5">
              {result.holdings.map((h) => (
                <HoldingRow key={h.symbol} h={h} />
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
