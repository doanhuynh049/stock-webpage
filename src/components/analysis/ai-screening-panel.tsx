"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, RotateCcw, Sparkles } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  readLocalCache,
  writeLocalCache,
  LOCAL_CACHE_KEYS,
  LOCAL_CACHE_TTL,
} from "@/lib/client/local-storage-cache";
import { DEFAULT_SCREENING_WEIGHTS, type ScreeningWeights } from "@/lib/analysis/ai-screening-config";
import type { ScreeningReport, ScreeningReportRow } from "@/lib/analysis/ai-screening-llm";

type WeightField = { key: keyof ScreeningWeights; label: string; hint: string };

const WEIGHT_FIELDS: WeightField[] = [
  { key: "roe", label: "ROE", hint: "Return on equity" },
  { key: "revenueCagr", label: "Revenue growth", hint: "YoY — proxy for CAGR (no multi-year series stored)" },
  { key: "epsGrowth3y", label: "EPS growth", hint: "YoY — proxy for 3y EPS growth" },
  { key: "debtToEquity", label: "Debt/Equity (inv.)", hint: "Lower ratio scores higher" },
  { key: "fcf", label: "FCF", hint: "Not tracked in this DB — always neutral (50)" },
  { key: "peg", label: "PEG (inv.)", hint: "Lower ratio scores higher" },
];

function scoreColor(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function scoreVariant(score: number): "success" | "warning" | "danger" {
  if (score >= 70) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

function SubScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5" title={`${label}: ${value}/100`}>
      <span className="w-14 shrink-0 text-[10px] uppercase tracking-wide text-subtle">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
        <div className={cn("h-full rounded-full", scoreColor(value))} style={{ width: `${value}%` }} />
      </div>
      <span className="w-6 shrink-0 text-right font-mono text-[10px]">{value}</span>
    </div>
  );
}

function ScreeningRow({ row, rank }: { row: ScreeningReportRow; rank: number }) {
  const [open, setOpen] = useState(false);
  const ai = row.ai;

  return (
    <div className="rounded-xl ring-1 ring-[var(--border)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-secondary)]"
      >
        <span className="w-5 shrink-0 text-right text-xs text-subtle">{rank}</span>
        <span className="w-16 shrink-0 font-semibold text-accent">{row.symbol}</span>
        <span className="hidden w-32 shrink-0 truncate text-xs text-muted sm:block">{row.sector}</span>
        <div className="flex min-w-[140px] flex-1 items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
            <div className={cn("h-full rounded-full", scoreColor(row.quantScore))} style={{ width: `${row.quantScore}%` }} />
          </div>
          <Badge variant={scoreVariant(row.quantScore)}>{row.quantScore}/100</Badge>
        </div>
        <span className="min-w-0 flex-[2] truncate text-xs text-[var(--fg)]">{ai?.reason ?? "—"}</span>
        {row.hardFilter.dataUnavailable.length > 0 && (
          <span
            className="hidden shrink-0 text-[10px] text-amber-500 sm:inline"
            title={`Data unavailable: ${row.hardFilter.dataUnavailable.join(", ")}`}
          >
            ⚠ {row.hardFilter.dataUnavailable.length} unavailable
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-3 border-t border-[var(--border)] px-3 py-3">
          <div className="grid gap-1.5 sm:grid-cols-2">
            <SubScoreBar label="ROE" value={row.subScores.roe} />
            <SubScoreBar label="CAGR" value={row.subScores.cagr} />
            <SubScoreBar label="EPS gr." value={row.subScores.epsGrowth} />
            <SubScoreBar label="Debt" value={row.subScores.debt} />
            <SubScoreBar label="FCF" value={row.subScores.fcf} />
            <SubScoreBar label="PEG" value={row.subScores.peg} />
          </div>
          <div className="grid gap-2 text-[11px] text-muted sm:grid-cols-3">
            <span>ROE: {row.metrics.roe != null ? `${row.metrics.roe.toFixed(1)}%` : "data unavailable"}</span>
            <span>Revenue growth: {row.metrics.revenueCagr != null ? `${row.metrics.revenueCagr.toFixed(1)}%` : "data unavailable"}</span>
            <span>EPS growth: {row.metrics.epsGrowth3y != null ? `${row.metrics.epsGrowth3y.toFixed(1)}%` : "data unavailable"}</span>
            <span>D/E: {row.metrics.debtToEquity != null ? row.metrics.debtToEquity.toFixed(2) : "data unavailable"}</span>
            <span>PEG: {row.metrics.peg != null ? row.metrics.peg.toFixed(2) : "data unavailable"}</span>
            <span>FCF: data unavailable (not tracked)</span>
          </div>
          {ai && ai.flags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {ai.flags.map((f, i) => (
                <Badge key={i} variant="info">{f}</Badge>
              ))}
            </div>
          )}
          {ai && (
            <p className="text-[10px] text-subtle">
              Reason source: {ai.reasonSource === "llm" ? "AI explanation" : "rule-based fallback (AI reason failed validation or was unavailable)"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function AiScreeningPanel() {
  const [universe, setUniverse] = useState<"vn30" | "vn100">("vn100");
  const [weights, setWeights] = useState<ScreeningWeights>(DEFAULT_SCREENING_WEIGHTS);
  const [report, setReport] = useState<ScreeningReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ranRef = useRef(false);

  async function run(u: "vn30" | "vn100" = universe, w: ScreeningWeights = weights) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analysis/ai-screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ universe: u, weights: w, limit: 20 }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as ScreeningReport;
      setReport(data);
      setWeights(data.weights); // server normalizes weights to sum to 1
      writeLocalCache(LOCAL_CACHE_KEYS.aiScreening, data);
      writeLocalCache(LOCAL_CACHE_KEYS.aiScreeningWeights, data.weights);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Screening failed");
    } finally {
      setLoading(false);
    }
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    const cachedWeights = readLocalCache<ScreeningWeights>(LOCAL_CACHE_KEYS.aiScreeningWeights, LOCAL_CACHE_TTL.aiScreeningWeights);
    if (cachedWeights) setWeights(cachedWeights);
    const cached = readLocalCache<ScreeningReport>(LOCAL_CACHE_KEYS.aiScreening, LOCAL_CACHE_TTL.aiScreening);
    if (cached) {
      setReport(cached);
      setUniverse(cached.universe);
    } else {
      void run(universe, cachedWeights ?? weights);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const weightSum = WEIGHT_FIELDS.reduce((s, f) => s + (weights[f.key] || 0), 0);

  return (
    <div className="space-y-4">
      <Card className="!p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="!mb-1 !text-base">AI Screening Rule — Level 2</CardTitle>
            <p className="text-xs text-muted">
              Hard filter + weighted quant score (rule-based, no AI) narrows the universe to a shortlist; AI only
              explains the score — it never invents a metric or changes the rank.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-lg ring-1 ring-[var(--border)]">
              {(["vn30", "vn100"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUniverse(u)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-semibold",
                    universe === u ? "bg-accent text-accent-fg" : "text-[var(--fg)] opacity-60 hover:opacity-100",
                  )}
                >
                  {u.toUpperCase()}
                </button>
              ))}
            </div>
            <Button variant="secondary" size="sm" onClick={() => void run()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {loading ? "Screening…" : "Run Screening"}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="!p-4">
        <div className="mb-2 flex items-center justify-between">
          <CardTitle className="!mb-0 !text-base">Weights</CardTitle>
          <div className="flex items-center gap-2">
            <span className={cn("text-[11px]", Math.abs(weightSum - 1) > 0.001 ? "text-amber-500" : "text-subtle")}>
              Sum: {(weightSum * 100).toFixed(0)}% {Math.abs(weightSum - 1) > 0.001 ? "(auto-normalized on run)" : ""}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setWeights(DEFAULT_SCREENING_WEIGHTS)}>
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {WEIGHT_FIELDS.map((f) => (
            <div key={f.key}>
              <Label className="!mb-1">{f.label}</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={weights[f.key]}
                onChange={(e) =>
                  setWeights((w) => ({ ...w, [f.key]: Math.max(0, Number(e.target.value) || 0) }))
                }
                className="!py-1.5 text-xs"
                title={f.hint}
              />
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-subtle">
          Weights are normalized to sum to 100% automatically. Formula: Score = Σ(weight × normalized 0–100 sub-score).
        </p>
      </Card>

      {error && (
        <Card className="border border-red-500/30 bg-red-500/5">
          <p className="flex items-center gap-2 text-sm text-red-500">
            <AlertTriangle className="h-4 w-4" /> {error}
          </p>
        </Card>
      )}

      {loading && !report && (
        <Card className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          Running hard filter + weighted scoring across the universe…
        </Card>
      )}

      {report && (
        <Card className="!p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="!mb-0 !text-base">
              Shortlist — {report.rows.length} of {report.passedHardFilter} passed hard filter
              ({report.totalScreened} screened)
            </CardTitle>
            <span className="flex items-center gap-1 text-[11px] text-subtle">
              <Sparkles className="h-3 w-3 text-accent" /> {report.provider}
            </span>
          </div>
          {report.rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">
              No candidates passed the hard filter (ROE ≥ 15%, Debt/Equity ≤ 2.0, min. liquidity).
            </p>
          ) : (
            <div className="space-y-1.5">
              {report.rows.map((row, i) => (
                <ScreeningRow key={row.symbol} row={row} rank={i + 1} />
              ))}
            </div>
          )}
          <p className="mt-3 text-center text-[11px] text-subtle">
            Generated {new Date(report.generatedAt).toLocaleString()} · Educational use only — not financial advice.
          </p>
        </Card>
      )}
    </div>
  );
}
