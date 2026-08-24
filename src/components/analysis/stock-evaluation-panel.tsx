"use client";

import { useEffect, useState } from "react";
import {
  BarChart2,
  Building2,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  Loader2,
  Search,
  Shield,
  Target,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { StockEvalResult, EvalCategory } from "@/app/api/stock-eval/route";

// ─── icons per category ───────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  business: <Building2 className="h-4 w-4" />,
  financial: <BarChart2 className="h-4 w-4" />,
  valuation: <DollarSign className="h-4 w-4" />,
  risks: <Shield className="h-4 w-4" />,
  growth: <TrendingUp className="h-4 w-4" />,
  management: <Users className="h-4 w-4" />,
  timing: <Clock className="h-4 w-4" />,
  fit: <Target className="h-4 w-4" />,
};

const CATEGORY_QUESTIONS: Record<string, string[]> = {
  business: [
    "What does this company do?",
    "How does it make money?",
    "What competitive advantages does it have?",
    "Is the business model sustainable?",
  ],
  financial: [
    "Is revenue growing consistently?",
    "Is the company generating positive cash flow?",
    "Does it have too much debt?",
    "Are profit margins improving?",
  ],
  valuation: [
    "Is the stock overvalued or undervalued?",
    "What is the current P/E ratio?",
    "What is a reasonable fair value?",
  ],
  risks: [
    "What could cause this investment to fail?",
    "What are the biggest risks?",
    "Are there regulatory or legal risks?",
  ],
  growth: [
    "What are the future growth drivers?",
    "Is it expanding into new markets?",
    "How large is the addressable market?",
  ],
  management: [
    "Is the leadership team trustworthy?",
    "Does management have a strong track record?",
    "Are executives aligned with shareholders?",
  ],
  timing: [
    "Is now a good time to buy?",
    "What is the current market sentiment?",
    "Is the stock near historical highs or lows?",
  ],
  fit: [
    "Does this fit my investment strategy?",
    "Am I investing or speculating?",
    "How much downside risk can I tolerate?",
  ],
};

// ─── recommendation styling ───────────────────────────────────────────────────

function recColor(rec: string): string {
  switch (rec) {
    case "ACCUMULATE": return "text-emerald-600 dark:text-emerald-400";
    case "WATCH": return "text-blue-600 dark:text-blue-400";
    case "HOLD": return "text-amber-600 dark:text-amber-400";
    case "TRIM": return "text-orange-600 dark:text-orange-400";
    case "AVOID": return "text-red-600 dark:text-red-400";
    default: return "text-muted";
  }
}

function recBadgeVariant(rec: string): "success" | "info" | "warning" | "danger" | "default" {
  switch (rec) {
    case "ACCUMULATE": return "success";
    case "WATCH": return "info";
    case "HOLD": return "warning";
    case "TRIM": return "warning";
    case "AVOID": return "danger";
    default: return "default";
  }
}

function recBg(rec: string): string {
  switch (rec) {
    case "ACCUMULATE": return "from-emerald-500/10 to-transparent";
    case "WATCH": return "from-blue-500/10 to-transparent";
    case "HOLD": return "from-amber-500/10 to-transparent";
    case "TRIM": return "from-orange-500/10 to-transparent";
    case "AVOID": return "from-red-500/10 to-transparent";
    default: return "from-[var(--bg-secondary)] to-transparent";
  }
}

// ─── sub-components ───────────────────────────────────────────────────────────

function CategoryRow({ cat, open, onToggle }: {
  cat: EvalCategory;
  open: boolean;
  onToggle: () => void;
}) {
  const icon = CATEGORY_ICONS[cat.id] ?? <ChevronRight className="h-4 w-4" />;
  const questions = CATEGORY_QUESTIONS[cat.id] ?? [];

  return (
    <div className="rounded-xl ring-1 ring-[var(--border)] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--bg-secondary)]"
      >
        <div className="flex items-center gap-2">
          <span className="text-accent">{icon}</span>
          <span className="text-sm font-semibold text-[var(--fg)]">{cat.title}</span>
        </div>
        {open
          ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" />
          : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />
        }
      </button>

      {open && (
        <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 space-y-2">
          {questions.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {questions.map((q) => (
                <span key={q} className="rounded-full bg-[var(--card)] px-2 py-0.5 text-[10px] text-subtle ring-1 ring-[var(--border)]">
                  {q}
                </span>
              ))}
            </div>
          )}
          <p className="text-sm leading-relaxed text-[var(--fg)]">{cat.analysis}</p>
        </div>
      )}
    </div>
  );
}

// ─── main panel ───────────────────────────────────────────────────────────────

const LS_KEY = "vnstocks:stock-eval-state";

type PersistedEvalState = {
  input: string;
  result: StockEvalResult | null;
};

export function StockEvaluationPanel() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StockEvalResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set(["business"]));

  // Restore last evaluated stock from localStorage on mount. Must stay an
  // effect — localStorage is client-only, so SSR/hydration always see the
  // empty defaults; this intentionally updates only after mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as PersistedEvalState;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional post-hydration restore, see comment above
        if (saved.input) setInput(saved.input);
        if (saved.result) {
          setResult(saved.result);
          setOpenCats(new Set(["business"]));
        }
      }
    } catch { /* ignore parse errors */ }
  }, []);

  async function evaluate(sym: string) {
    const symbol = sym.toUpperCase().trim();
    if (!symbol) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setOpenCats(new Set(["business"]));

    try {
      const res = await fetch(`/api/stock-eval?symbol=${encodeURIComponent(symbol)}`);
      const data = await res.json() as StockEvalResult & { error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "Evaluation failed");
      } else {
        setResult(data);
        try {
          localStorage.setItem(LS_KEY, JSON.stringify({ input: symbol, result: data } satisfies PersistedEvalState));
        } catch { /* quota exceeded or SSR */ }
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void evaluate(input);
  }

  function toggleCat(id: string) {
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setOpenCats(new Set(result?.categories.map((c) => c.id) ?? []));
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <p className="text-sm font-semibold text-[var(--fg)]">Stock Evaluator</p>
        <p className="text-[11px] text-muted">
          Enter any VN stock ticker for an 8-category AI investment analysis
        </p>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter ticker, e.g. FPT"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] py-2.5 pl-9 pr-3 text-sm outline-none ring-0 transition placeholder:text-subtle focus:border-accent focus:ring-2 focus:ring-accent/20"
            disabled={loading}
          />
          {input && !loading && (
            <button
              type="button"
              onClick={() => { setInput(""); setResult(null); setError(null); try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ } }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-[var(--fg)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg shadow transition hover:opacity-90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Evaluate"}
        </button>
      </form>

      {/* Quick tickers */}
      <div className="flex flex-wrap gap-1.5">
        {["FPT", "VCB", "VHM", "MSN", "TCB", "HPG", "REE"].map((sym) => (
          <button
            key={sym}
            type="button"
            disabled={loading}
            onClick={() => { setInput(sym); void evaluate(sym); }}
            className="rounded-md bg-[var(--bg-secondary)] px-2.5 py-1 text-[11px] font-medium text-muted ring-1 ring-[var(--border)] transition hover:bg-[var(--card)] hover:text-accent disabled:opacity-50"
          >
            {sym}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-3">
          {/* Stock header */}
          <div className={`rounded-xl bg-gradient-to-br ${recBg(result.recommendation)} p-3 ring-1 ring-[var(--border)]`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Link href={`/stocks/${result.symbol}`} className="text-base font-bold text-accent hover:underline">
                    {result.symbol}
                  </Link>
                  <Badge variant={recBadgeVariant(result.recommendation)} className="text-[10px]">
                    {result.recommendation}
                  </Badge>
                  <span className="text-[10px] text-subtle">via {result.provider}</span>
                </div>
                <p className="text-xs text-muted">{result.name} · {result.sector}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-bold text-[var(--fg)]">
                  {result.price.toLocaleString()} ₫
                </p>
                <p className={`font-mono text-xs ${result.changePercent >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {result.changePercent >= 0 ? "+" : ""}{result.changePercent.toFixed(2)}%
                </p>
              </div>
            </div>

            {result.thesis && (
              <p className="mt-2 border-t border-[var(--border)] pt-2 text-xs italic text-muted">
                &ldquo;{result.thesis}&rdquo;
              </p>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-subtle">
              {result.categories.length} categories · confidence:{" "}
              <span className={`font-semibold ${result.confidence === "HIGH" ? "text-emerald-500" : result.confidence === "LOW" ? "text-amber-500" : "text-blue-500"}`}>
                {result.confidence}
              </span>
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={expandAll} className="text-[11px] text-accent hover:underline">
                Expand all
              </button>
              <button type="button" onClick={() => setOpenCats(new Set())} className="text-[11px] text-muted hover:underline">
                Collapse
              </button>
            </div>
          </div>

          {/* Categories */}
          <div className="space-y-2">
            {result.categories.map((cat) => (
              <CategoryRow
                key={cat.id}
                cat={cat}
                open={openCats.has(cat.id)}
                onToggle={() => toggleCat(cat.id)}
              />
            ))}
          </div>

          {/* Final decision checklist */}
          <div className="rounded-xl bg-[var(--bg-secondary)] p-3 ring-1 ring-[var(--border)]">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">
              Final Decision Checklist
            </p>
            <div className="space-y-1">
              {[
                "Do I understand this business?",
                "Why will this company be more valuable in the future?",
                "What could prove my thesis wrong?",
                "Am I comfortable holding this if it drops 30%?",
                "Would I still buy this today if I already owned it?",
              ].map((q) => (
                <label key={q} className="flex cursor-pointer items-start gap-2.5 rounded-md px-1.5 py-1 hover:bg-[var(--card)]">
                  <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-emerald-500" />
                  <span className="text-xs text-muted">{q}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Verdict banner */}
          <div className={`rounded-xl bg-gradient-to-r ${recBg(result.recommendation)} p-3 ring-1 ring-[var(--border)]`}>
            <p className="text-[10px] uppercase tracking-wider text-subtle">Verdict</p>
            <p className={`text-lg font-bold ${recColor(result.recommendation)}`}>
              {result.recommendation}
            </p>
            <p className="text-xs text-muted">
              Framework: Business → Financials → Valuation → Growth → Risks → Management → Timing → Decision
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && !error && (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center">
          <Search className="mx-auto mb-2 h-8 w-8 text-subtle" />
          <p className="text-sm text-muted">Enter a stock ticker to begin evaluation</p>
          <p className="mt-1 text-[11px] text-subtle">
            AI analyzes business, financials, valuation, risks, growth, management &amp; timing
          </p>
        </div>
      )}
    </div>
  );
}
