"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock,
  Loader2,
  Search,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { readLocalCache, writeLocalCache } from "@/lib/client/local-storage-cache";
import type { AgentReport, InvestmentReport, Stance, Verdict } from "@/lib/analyst/types";

const CACHE_KEY = "analyst-report";

const AGENT_PIPELINE = [
  "Company / Financials",
  "Valuation",
  "Technical",
  "News & Sentiment",
  "Risk",
  "Macro / Market",
  "Decision Engine",
];

// ─── small presentational helpers ────────────────────────────────────────────

function stanceBadge(stance: Stance) {
  const v = stance === "Bullish" ? "success" : stance === "Bearish" ? "danger" : "warning";
  return <Badge variant={v}>{stance}</Badge>;
}

function verdictTone(verdict: Verdict): { variant: "success" | "danger" | "warning" | "info"; } {
  if (verdict === "STRONG BUY" || verdict === "BUY" || verdict === "ACCUMULATE") return { variant: "success" };
  if (verdict === "HOLD") return { variant: "info" };
  if (verdict === "TRIM") return { variant: "warning" };
  return { variant: "danger" };
}

function scoreColor(score: number): string {
  if (score >= 60) return "bg-emerald-500";
  if (score >= 45) return "bg-amber-500";
  return "bg-red-500";
}

function toneClass(tone?: "good" | "bad" | "neutral"): string {
  if (tone === "good") return "text-emerald-500";
  if (tone === "bad") return "text-red-500";
  return "text-[var(--fg)]";
}

function k(v: number | null): string {
  if (v == null) return "—";
  return `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K`;
}

function Stars({ n }: { n: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn("h-5 w-5", i <= n ? "fill-amber-400 text-amber-400" : "text-[var(--border-strong)]")}
        />
      ))}
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-secondary)]">
      <div className={cn("h-full rounded-full transition-all", scoreColor(score))} style={{ width: `${score}%` }} />
    </div>
  );
}

// ─── agent card ──────────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: AgentReport }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-[var(--fg)]">{agent.title}</h4>
        {stanceBadge(agent.stance)}
      </div>

      <div className="flex items-center gap-3">
        <span className="font-mono text-lg font-bold">{agent.score}</span>
        <div className="flex-1">
          <ScoreBar score={agent.score} />
        </div>
      </div>

      <p className="text-xs font-medium text-muted">{agent.headline}</p>

      {agent.metrics.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {agent.metrics.map((m) => (
            <div key={m.label} className="rounded-lg bg-[var(--bg-secondary)] px-2.5 py-1.5">
              <p className="text-[10px] uppercase tracking-wider text-subtle">{m.label}</p>
              <p className={cn("font-mono text-sm font-semibold", toneClass(m.tone))}>{m.value}</p>
            </div>
          ))}
        </div>
      )}

      <ul className="space-y-1">
        {agent.bullets.map((b, i) => (
          <li key={i} className="flex gap-1.5 text-xs leading-relaxed text-muted">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ─── main ────────────────────────────────────────────────────────────────────

export function AnalystReport({ initialSymbol }: { initialSymbol?: string }) {
  const [symbol, setSymbol] = useState(initialSymbol ?? "");
  const [report, setReport] = useState<InvestmentReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const didInit = useRef(false);

  // Restore last report from localStorage on mount (external-store hydration),
  // or auto-run when a symbol was passed via the URL.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    const cached = readLocalCache<InvestmentReport>(CACHE_KEY, Infinity);
    if (cached && !initialSymbol) {
      setReport(cached);
      setSymbol(cached.symbol);
    }
    if (initialSymbol && !didInit.current) {
      didInit.current = true;
      void analyze(initialSymbol);
    }
    return () => {
      if (stepTimer.current) clearInterval(stepTimer.current);
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  async function analyze(sym: string) {
    const clean = sym.toUpperCase().trim();
    if (!clean) return;
    setLoading(true);
    setError(null);
    setStep(0);
    stepTimer.current = setInterval(() => {
      setStep((s) => Math.min(s + 1, AGENT_PIPELINE.length - 1));
    }, 550);

    try {
      const res = await fetch("/api/analyst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: clean }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as InvestmentReport;
      setReport(data);
      writeLocalCache(CACHE_KEY, data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      if (stepTimer.current) clearInterval(stepTimer.current);
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Query bar */}
      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void analyze(symbol);
          }}
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <Input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="Enter a ticker (e.g. FPT, HPG, VCB) for a full multi-agent report"
              className="pl-9"
              autoCapitalize="characters"
            />
          </div>
          <Button type="submit" disabled={loading || !symbol.trim()} className="sm:w-40">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Analyzing…" : "Analyze"}
          </Button>
        </form>

        {loading && (
          <div className="mt-4 flex flex-wrap gap-2">
            {AGENT_PIPELINE.map((label, i) => (
              <span
                key={label}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors",
                  i < step
                    ? "bg-[var(--accent-bg)] text-[var(--success)]"
                    : i === step
                      ? "bg-[var(--accent)] text-accent-fg"
                      : "bg-[var(--bg-secondary)] text-subtle",
                )}
              >
                {i < step ? <CheckCircle2 className="h-3 w-3" /> : i === step ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {label}
              </span>
            ))}
          </div>
        )}
      </Card>

      {error && (
        <Card className="border border-red-500/30 bg-red-500/5">
          <p className="flex items-center gap-2 text-sm text-red-500">
            <AlertTriangle className="h-4 w-4" /> {error}
          </p>
        </Card>
      )}

      {report && !loading && <ReportBody report={report} />}

      {!report && !loading && !error && (
        <Card className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="hero-gradient rounded-2xl p-4 ring-1 ring-[var(--border)]">
            <BrainCircuit className="h-8 w-8 text-accent" />
          </div>
          <p className="text-sm font-medium text-[var(--fg)]">Professional multi-agent stock analysis</p>
          <p className="max-w-md text-xs text-muted">
            Six specialist agents (Company, Valuation, Technical, News, Risk, Macro) run in parallel,
            then a decision engine produces a rated investment report with a buy zone and target.
          </p>
        </Card>
      )}
    </div>
  );
}

function ReportBody({ report }: { report: InvestmentReport }) {
  const vt = verdictTone(report.verdict);
  const v = report.valuation;
  const bullish = report.verdict === "STRONG BUY" || report.verdict === "BUY" || report.verdict === "ACCUMULATE";
  const timingWarning = bullish && !report.timingConfirmed;
  return (
    <div className="space-y-6 animate-fade-up">
      {/* Verdict header */}
      <Card glow>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-xl font-bold">{report.symbol}</h2>
              <Badge variant={vt.variant} className="px-2.5 py-1 text-xs font-semibold">{report.verdict}</Badge>
              <Badge variant={report.timingConfirmed ? "success" : "warning"}>
                {report.timingConfirmed ? "Timing confirmed" : "Timing not confirmed"}
              </Badge>
            </div>
            <p className="truncate text-sm text-muted">{report.name} · {report.sector}</p>
            <p className="mt-1 font-mono text-sm">
              {report.price.toLocaleString()} ₫{" "}
              <span className={report.changePercent >= 0 ? "text-emerald-500" : "text-red-500"}>
                ({report.changePercent >= 0 ? "+" : ""}{report.changePercent.toFixed(2)}%)
              </span>
            </p>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <Stars n={report.stars} />
            <p className="font-mono text-2xl font-bold">{report.overallScore}<span className="text-sm text-subtle">/100</span></p>
            <Badge variant="default">Confidence: {report.confidence}</Badge>
          </div>
        </div>

        <p className="mt-4 rounded-xl bg-[var(--bg-secondary)] p-4 text-sm leading-relaxed text-[var(--fg)]">
          {report.thesis}
        </p>

        {timingWarning && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This {report.verdict} is driven by fundamentals/valuation — the Technical agent hasn&apos;t confirmed a
              turn yet. Consider phasing in gradually or waiting for the chart to improve (price back above the
              50-day average, RSI recovering) rather than adding in size now.
            </span>
          </p>
        )}
      </Card>

      {/* Trade levels */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <LevelTile label="Buy Zone" value={report.buyZoneLow && report.buyZoneHigh ? `${k(report.buyZoneLow)}–${k(report.buyZoneHigh)}` : "—"} />
        <LevelTile label="Fair Value" value={k(v.intrinsicValue)} />
        <LevelTile label="Target" value={k(report.targetPrice)} tone="good" />
        <LevelTile label="Stop-Loss" value={k(report.stopLoss)} tone="bad" />
      </div>

      {/* Reasons / Risks */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>Why Buy</CardTitle>
          <ul className="space-y-2">
            {report.reasons.map((r, i) => (
              <li key={i} className="flex gap-2 text-sm text-[var(--fg)]">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle>Risks & Watch-outs</CardTitle>
          <ul className="space-y-2">
            {report.risks.map((r, i) => (
              <li key={i} className="flex gap-2 text-sm text-[var(--fg)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Valuation detail */}
      <Card>
        <CardTitle action={<Badge variant="info"><TrendingUp className="mr-1 inline h-3 w-3" />Valuation</Badge>}>
          Intrinsic Value
        </CardTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <LevelTile label="Intrinsic Value" value={k(v.intrinsicValue)} />
          <LevelTile label="Current Price" value={k(v.currentPrice)} />
          <LevelTile
            label="Margin of Safety"
            value={v.marginOfSafety != null ? `${v.marginOfSafety >= 0 ? "+" : ""}${v.marginOfSafety.toFixed(0)}%` : "—"}
            tone={v.marginOfSafety != null ? (v.marginOfSafety >= 0 ? "good" : "bad") : undefined}
          />
          <LevelTile label="P/E · PEG" value={`${v.pe ? v.pe.toFixed(1) : "—"} · ${v.peg ?? "—"}`} />
        </div>
        <p className="mt-3 text-xs text-muted">{v.method}</p>
      </Card>

      {/* Agent grid */}
      <div>
        <CardTitle>Agent Breakdown</CardTitle>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {report.agents.map((a) => (
            <AgentCard key={a.id} agent={a} />
          ))}
        </div>
      </div>

      <p className="text-center text-[11px] text-subtle">
        Generated {new Date(report.generatedAt).toLocaleString()} · thesis via {report.provider} ·
        Educational use only — not financial advice.
      </p>
    </div>
  );
}

function LevelTile({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl bg-[var(--bg-secondary)] p-3 ring-1 ring-[var(--border)]">
      <p className="text-[10px] uppercase tracking-wider text-subtle">{label}</p>
      <p className={cn("mt-1 font-mono text-lg font-bold", tone === "good" ? "text-emerald-500" : tone === "bad" ? "text-red-500" : "text-[var(--fg)]")}>
        {value}
      </p>
    </div>
  );
}
