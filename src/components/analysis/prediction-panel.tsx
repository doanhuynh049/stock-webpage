"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SortableColumn } from "@/components/ui/sortable-column";
import { useTableSort } from "@/hooks/use-table-sort";
import { applySortDir, compareNumbers, compareStrings } from "@/lib/table-sort";
import { cn } from "@/lib/utils";
import { readLocalCache, writeLocalCache, LOCAL_CACHE_KEYS, LOCAL_CACHE_TTL } from "@/lib/client/local-storage-cache";
import { PREDICTION_HORIZONS, DEFAULT_HORIZON_DAYS, type PredictionHorizonDays } from "@/lib/analysis/prediction-config";
import type { PricePrediction, BacktestStats } from "@/lib/analysis/prediction-model";
import type { PortfolioPredictionOverview } from "@/lib/analysis/prediction-portfolio";

const LS_KEY = "vnstocks:prediction-state";

type PersistedState = { ticker: string; result: PricePrediction | null; horizonDays: PredictionHorizonDays };

function probVariant(prob: number | null): "success" | "danger" | "default" {
  if (prob == null) return "default";
  if (prob >= 0.55) return "success";
  if (prob <= 0.45) return "danger";
  return "default";
}

function HorizonSelector({
  value,
  onChange,
  disabled,
}: {
  value: PredictionHorizonDays;
  onChange: (h: PredictionHorizonDays) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1">
      {PREDICTION_HORIZONS.map((h) => (
        <button
          key={h}
          type="button"
          disabled={disabled}
          onClick={() => onChange(h)}
          className={cn(
            "rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ring-[var(--border)] transition disabled:opacity-50",
            value === h
              ? "bg-accent text-accent-fg ring-accent/30"
              : "bg-[var(--bg-secondary)] text-muted hover:bg-[var(--card)] hover:text-accent",
          )}
        >
          {h}d
        </button>
      ))}
    </div>
  );
}

function BacktestCard({ backtest, horizonDays }: { backtest: BacktestStats; horizonDays: number }) {
  return (
    <Card className="!p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <CardTitle className="!mb-0 !text-base">Backtest (walk-forward)</CardTitle>
        {backtest.insufficientSample && (
          <span title="Small sample — read with caution" className="shrink-0 text-amber-500">
            <AlertTriangle className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      {backtest.windowSampleCount === 0 ? (
        <p className="text-sm text-muted">{backtest.note}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-[10px] uppercase text-subtle">Hit rate</p>
              <p className="font-mono text-sm font-semibold text-[var(--fg)]">{backtest.hitRatePct}%</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-subtle">Calibration</p>
              <p className="font-mono text-sm font-semibold text-[var(--fg)]">
                {backtest.calibration
                  ? `${backtest.calibration.meanPredictedProbUpPct}% pred. → ${backtest.calibration.actualUpRatePct}% actual`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-subtle">Sharpe</p>
              <p className="font-mono text-sm font-semibold text-[var(--fg)]">{backtest.sharpeRatio ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-subtle">Max drawdown</p>
              <p className="font-mono text-sm font-semibold text-[var(--fg)]">
                {backtest.maxDrawdownPct != null ? `${backtest.maxDrawdownPct}%` : "—"}
              </p>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-subtle">
            {backtest.windowSampleCount} windows · {backtest.sequentialTradeCount} sequential trades · {horizonDays}-day horizon. {backtest.note}
          </p>
        </>
      )}
    </Card>
  );
}

/** Full per-ticker result — reused for both the ad-hoc lookup and an expanded portfolio-overview row. */
function PredictionDetail({ prediction }: { prediction: PricePrediction }) {
  if (prediction.insufficient_data) {
    return (
      <Card className="border border-amber-500/30 bg-amber-500/5 !p-4">
        <p className="flex items-center gap-2 text-sm text-[var(--fg)]"><AlertTriangle className="h-4 w-4 text-amber-500" /> {prediction.confidence_note}</p>
        <p className="mt-2 text-[11px] text-subtle">{prediction.disclaimer}</p>
      </Card>
    );
  }

  const prob = prediction.prob_price_up;
  const probPct = prob != null ? Math.round(prob * 1000) / 10 : null;
  const [ciLow, ciHigh] = prediction.expected_return_range_90pct_ci ?? [null, null];

  return (
    <div className="space-y-4">
      <Card glow className="!p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {prob != null && prob >= 0.5 ? (
              <TrendingUp className="h-4 w-4 text-success" />
            ) : (
              <TrendingDown className="h-4 w-4 text-danger" />
            )}
            <span className="text-base font-bold text-accent">{prediction.ticker}</span>
            <span className="text-[10px] text-subtle">{prediction.horizon_days}-day horizon</span>
          </div>
          <span className="text-[10px] text-subtle">{new Date(prediction.generated_at).toLocaleString()}</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-[10px] uppercase text-subtle">Prob. positive return</p>
            <Badge variant={probVariant(prob)} className="mt-1 font-mono text-xs">{probPct != null ? `${probPct}%` : "—"}</Badge>
          </div>
          <div>
            <p className="text-[10px] uppercase text-subtle">Expected return</p>
            <p className={cn("font-mono text-sm font-semibold", (prediction.expected_return_pct ?? 0) >= 0 ? "text-success" : "text-danger")}>
              {prediction.expected_return_pct != null ? `${prediction.expected_return_pct > 0 ? "+" : ""}${prediction.expected_return_pct}%` : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-subtle">90% CI</p>
            <p className="font-mono text-xs text-muted">
              {ciLow != null && ciHigh != null ? `${ciLow > 0 ? "+" : ""}${ciLow}% to ${ciHigh > 0 ? "+" : ""}${ciHigh}%` : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-subtle">Volatility (ann.)</p>
            <p className="font-mono text-sm font-semibold text-[var(--fg)]">
              {prediction.risk_volatility_pct != null ? `${prediction.risk_volatility_pct}%` : "—"}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-[var(--bg-secondary)] px-3 py-2 text-[11px] text-muted">
          <Info className="mt-0.5 h-3 w-3 shrink-0 text-subtle" />
          <span>
            {prediction.model_used}. Combined (technical+fundamental) score {prediction.tilt.combined_score ?? "—"}/100 applied a{" "}
            {prediction.tilt.applied_tilt_pct >= 0 ? "+" : ""}{prediction.tilt.applied_tilt_pct}pp annualized drift tilt.
          </span>
        </div>
      </Card>

      <BacktestCard backtest={prediction.backtest} horizonDays={prediction.horizon_days} />

      <p className="text-[10px] text-subtle">{prediction.confidence_note}</p>
      <p className="text-center text-[11px] text-subtle">{prediction.disclaimer}</p>
    </div>
  );
}

function OverviewRow({
  row,
  expanded,
  onToggle,
}: {
  row: PortfolioPredictionOverview["rows"][number];
  expanded: boolean;
  onToggle: () => void;
}) {
  const { prediction } = row;
  const probPct = prediction.prob_price_up != null ? Math.round(prediction.prob_price_up * 1000) / 10 : null;

  return (
    <div className="rounded-xl ring-1 ring-[var(--border)]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-secondary)]"
      >
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-subtle" /> : <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />}
        <span className="w-14 shrink-0 font-semibold text-accent">{row.symbol}</span>
        <span className="hidden w-14 shrink-0 text-right text-xs text-muted sm:block">
          {row.weightPct != null ? `${row.weightPct.toFixed(0)}%` : "—"}
        </span>
        {prediction.insufficient_data ? (
          <Badge variant="default">insufficient data</Badge>
        ) : (
          <>
            <Badge variant={probVariant(prediction.prob_price_up)}>{probPct != null ? `${probPct}% up` : "—"}</Badge>
            <span className={cn("font-mono text-xs", (prediction.expected_return_pct ?? 0) >= 0 ? "text-success" : "text-danger")}>
              {prediction.expected_return_pct != null ? `${prediction.expected_return_pct > 0 ? "+" : ""}${prediction.expected_return_pct}%` : "—"}
            </span>
            <span className="hidden text-[11px] text-subtle sm:block">
              {prediction.risk_volatility_pct != null ? `${prediction.risk_volatility_pct}% vol` : ""}
            </span>
          </>
        )}
        <span className="min-w-0 flex-1 truncate text-xs text-muted">{row.sector}</span>
      </button>
      {expanded && (
        <div className="border-t border-[var(--border)] p-3">
          <PredictionDetail prediction={prediction} />
        </div>
      )}
    </div>
  );
}

export function PredictionPanel() {
  const [horizonDays, setHorizonDays] = useState<PredictionHorizonDays>(DEFAULT_HORIZON_DAYS);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PricePrediction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [overview, setOverview] = useState<PortfolioPredictionOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const overviewRanRef = useRef(false);

  type SortKey = "symbol" | "weight" | "prob" | "return" | "volatility";
  const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>(null, "desc");
  const sortedOverviewRows = useMemo(() => {
    if (!overview || !sortKey) return overview?.rows ?? [];
    return [...overview.rows].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "symbol":
          cmp = compareStrings(a.symbol, b.symbol);
          break;
        case "weight":
          cmp = compareNumbers(a.weightPct, b.weightPct);
          break;
        case "prob":
          cmp = compareNumbers(a.prediction.prob_price_up, b.prediction.prob_price_up);
          break;
        case "return":
          cmp = compareNumbers(a.prediction.expected_return_pct, b.prediction.expected_return_pct);
          break;
        case "volatility":
          cmp = compareNumbers(a.prediction.risk_volatility_pct, b.prediction.risk_volatility_pct);
          break;
      }
      return applySortDir(cmp, sortDir);
    });
  }, [overview, sortKey, sortDir]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as PersistedState;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional post-hydration restore
        if (saved.ticker) setInput(saved.ticker);
        if (saved.result) setResult(saved.result);
        if (saved.horizonDays) setHorizonDays(saved.horizonDays);
      }
    } catch { /* ignore */ }
  }, []);

  async function runOverview(h: PredictionHorizonDays = DEFAULT_HORIZON_DAYS) {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const res = await fetch(`/api/analysis/prediction/portfolio?horizonDays=${h}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as PortfolioPredictionOverview;
      setOverview(data);
      writeLocalCache(LOCAL_CACHE_KEYS.predictionPortfolio, data);
    } catch (e) {
      setOverviewError(e instanceof Error ? e.message : "Portfolio overview failed");
    } finally {
      setOverviewLoading(false);
    }
  }

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (overviewRanRef.current) return;
    overviewRanRef.current = true;
    const cached = readLocalCache<PortfolioPredictionOverview>(LOCAL_CACHE_KEYS.predictionPortfolio, LOCAL_CACHE_TTL.predictionPortfolio);
    if (cached) setOverview(cached);
    else void runOverview();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function analyze(sym: string, h: PredictionHorizonDays = horizonDays) {
    const symbol = sym.toUpperCase().trim();
    if (!symbol) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const cacheKey = `${LOCAL_CACHE_KEYS.prediction(symbol)}-${h}`;
    const cached = readLocalCache<PricePrediction>(cacheKey, LOCAL_CACHE_TTL.prediction);
    if (cached) {
      setResult(cached);
      setLoading(false);
      try { localStorage.setItem(LS_KEY, JSON.stringify({ ticker: symbol, result: cached, horizonDays: h } satisfies PersistedState)); } catch { /* ignore */ }
      return;
    }

    try {
      const res = await fetch("/api/analysis/prediction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, horizonDays: h }),
      });
      const data = (await res.json()) as PricePrediction & { error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "Prediction failed");
      } else {
        setResult(data);
        writeLocalCache(cacheKey, data);
        try { localStorage.setItem(LS_KEY, JSON.stringify({ ticker: symbol, result: data, horizonDays: h } satisfies PersistedState)); } catch { /* ignore */ }
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="!p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="!mb-1 !text-base">Portfolio Overview</CardTitle>
            <p className="text-xs text-muted">
              Statistical (not ML) probability/return estimate for every holding — pure math, no LLM call, so it isn&apos;t capped to your top holdings.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <HorizonSelector value={horizonDays} onChange={(h) => { setHorizonDays(h); void runOverview(h); }} disabled={overviewLoading} />
            <Button variant="secondary" size="sm" onClick={() => void runOverview(horizonDays)} disabled={overviewLoading}>
              {overviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {overviewLoading ? "Computing…" : "Re-run"}
            </Button>
          </div>
        </div>

        {overviewError && (
          <p className="mt-3 flex items-center gap-2 text-sm text-red-500"><AlertTriangle className="h-4 w-4" /> {overviewError}</p>
        )}

        {overviewLoading && !overview && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin text-accent" /> Computing probability estimates for your holdings…
          </div>
        )}

        {overview && overview.holdingsCount === 0 && !overviewLoading && (
          <p className="py-6 text-center text-sm text-muted">No holdings found. Add positions on Portfolio or Trading, then re-run.</p>
        )}

        {overview && overview.rows.length > 0 && (
          <>
            <div className="mb-1.5 mt-3 hidden items-center gap-3 px-3 text-[10px] uppercase tracking-wider text-subtle sm:flex">
              <span className="h-4 w-4" />
              <SortableColumn label="Symbol" column="symbol" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="w-14" />
              <SortableColumn label="Weight" column="weight" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="w-14 justify-end" />
              <SortableColumn label="Prob. up" column="prob" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableColumn label="Return" column="return" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortableColumn label="Volatility" column="volatility" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <span className="min-w-0 flex-1" />
            </div>
            <div className="space-y-1.5">
              {sortedOverviewRows.map((row) => (
                <OverviewRow
                  key={row.symbol}
                  row={row}
                  expanded={expanded === row.symbol}
                  onToggle={() => setExpanded((prev) => (prev === row.symbol ? null : row.symbol))}
                />
              ))}
            </div>
          </>
        )}

        {overview && overview.skippedSymbols.length > 0 && (
          <p className="mt-2 text-[11px] text-subtle">
            Not analyzed (serverless-time safety cap, not a cost cap): {overview.skippedSymbols.join(", ")}
          </p>
        )}
      </Card>

      <Card className="!p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="!mb-1 !text-base">Look up any ticker</CardTitle>
            <p className="text-xs text-muted">Not limited to your holdings — probability/return estimate for any VN ticker.</p>
          </div>
          <HorizonSelector value={horizonDays} onChange={setHorizonDays} disabled={loading} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void analyze(input); }} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter ticker, e.g. FPT"
              disabled={loading}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-subtle focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            {input && !loading && (
              <button type="button" onClick={() => { setInput(""); setResult(null); setError(null); try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ } }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-[var(--fg)]">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button type="submit" disabled={loading || !input.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg shadow transition hover:opacity-90 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Analyze"}
          </button>
        </form>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {["FPT", "VCB", "VHM", "MWG", "HPG"].map((sym) => (
            <button key={sym} type="button" disabled={loading} onClick={() => { setInput(sym); void analyze(sym); }} className="rounded-md bg-[var(--bg-secondary)] px-2.5 py-1 text-[11px] font-medium text-muted ring-1 ring-[var(--border)] transition hover:bg-[var(--card)] hover:text-accent disabled:opacity-50">
              {sym}
            </button>
          ))}
        </div>
      </Card>

      {error && (
        <Card className="border border-red-500/30 bg-red-500/5">
          <p className="flex items-center gap-2 text-sm text-red-500"><AlertTriangle className="h-4 w-4" /> {error}</p>
        </Card>
      )}

      {loading && (
        <Card className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin text-accent" /> Computing probability estimate…
        </Card>
      )}

      {result && !loading && <PredictionDetail prediction={result} />}

      {!result && !loading && !error && !overview && (
        <Card className="border border-dashed border-[var(--border)] py-10 text-center">
          <Search className="mx-auto mb-2 h-8 w-8 text-subtle" />
          <p className="text-sm text-muted">Enter a stock ticker for a probabilistic return estimate</p>
        </Card>
      )}
    </div>
  );
}
