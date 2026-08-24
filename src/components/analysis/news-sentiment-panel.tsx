"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
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
import type { NewsSentimentReport, Stance } from "@/lib/analysis/news-sentiment";
import type { NewsClassification, NewsCategory, TrustTier } from "@/lib/analysis/news-classification";
import type { PortfolioNewsOverview } from "@/lib/analysis/news-sentiment-portfolio";

const LS_KEY = "vnstocks:news-sentiment-state";

type PersistedState = { ticker: string; result: NewsSentimentReport | null };

function sentimentVariant(s: NewsClassification["sentiment"] | Stance): "success" | "danger" | "default" {
  if (s === "positive") return "success";
  if (s === "negative") return "danger";
  return "default";
}

function trustLabel(t: TrustTier): string {
  if (t === "tier1_global") return "Tier 1 (global)";
  if (t === "vn_official") return "VN official";
  return "General";
}

const STANCE_RANK: Record<Stance, number> = { positive: 1, neutral: 0, negative: -1 };

function trustVariant(t: TrustTier): "info" | "success" | "default" {
  if (t === "tier1_global") return "info";
  if (t === "vn_official") return "success";
  return "default";
}

const CATEGORY_LABELS: Record<NewsCategory, string> = {
  partnership: "Partnership",
  earnings: "Earnings",
  regulatory: "Regulatory",
  management: "Management",
  macro: "Macro",
  analyst_rating: "Analyst rating",
  other: "Other",
};

function NewsItemRow({ item }: { item: NewsClassification }) {
  return (
    <div className={cn("rounded-xl p-3 ring-1 ring-[var(--border)]", item.trust_tier !== "general" && "bg-[var(--accent-bg)]/30")}>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <Badge variant={trustVariant(item.trust_tier)}>{trustLabel(item.trust_tier)}</Badge>
        <Badge variant="default">{CATEGORY_LABELS[item.category]}</Badge>
        <Badge variant={sentimentVariant(item.sentiment)}>{item.sentiment}</Badge>
        <Badge variant="default">{item.time_horizon === "short_term" ? "Short-term" : "Long-term"}</Badge>
        <span className="text-[10px] text-subtle" title="Model confidence in this classification">
          {Math.round(item.confidence * 100)}% confidence
        </span>
      </div>
      {item.link ? (
        <a href={item.link} target="_blank" rel="noopener noreferrer" className="flex items-start gap-1.5 text-sm font-medium text-[var(--fg)] hover:text-accent hover:underline">
          {item.headline}
          <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-subtle" />
        </a>
      ) : (
        <p className="text-sm font-medium text-[var(--fg)]">{item.headline}</p>
      )}
      <p className="mt-0.5 text-[11px] text-subtle">{item.source} · {new Date(item.timestamp).toLocaleDateString()}</p>
      <p className="mt-1.5 text-xs text-muted">{item.reasoning}</p>
    </div>
  );
}

function SocialSentimentCard({ social }: { social: NonNullable<NewsSentimentReport["social_sentiment"]> }) {
  const hasPct = social.bullish_pct != null && social.bearish_pct != null;
  return (
    <Card className="!p-4">
      <CardTitle className="!mb-2 !text-base">Social Sentiment ({social.window})</CardTitle>
      {hasPct ? (
        <>
          <div className="mb-1 flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--bg-secondary)]">
            <div className="h-full bg-emerald-500" style={{ width: `${social.bullish_pct}%` }} />
            <div className="h-full bg-red-500" style={{ width: `${social.bearish_pct}%` }} />
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-emerald-500">{social.bullish_pct}% bullish</span>
            <span className="text-red-500">{social.bearish_pct}% bearish</span>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted">No sentiment-tagged posts available.</p>
      )}
      <p className={cn("mt-2 text-[11px]", social.insufficient_data ? "text-amber-500" : "text-subtle")}>
        {social.insufficient_data && "⚠ Low sample — "}{social.sample_size_note}
      </p>
      {social.buzz_change_pct != null && (
        <div className="mt-3 rounded-lg bg-[var(--bg-secondary)] px-3 py-2">
          <p className="text-xs font-semibold text-[var(--fg)]">
            Buzz vs. baseline: {social.buzz_change_pct > 0 ? "+" : ""}{social.buzz_change_pct}%
          </p>
          <p className="mt-0.5 text-[10px] text-subtle">
            Reported neutrally — a spike can mean a catalyst OR a scandal; check the news items for context. {social.methodology_note}
          </p>
        </div>
      )}
      {social.top_keywords.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {social.top_keywords.map((k) => (
            <span key={k} className="rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-[10px] text-muted ring-1 ring-[var(--border)]">{k}</span>
          ))}
        </div>
      )}
      <p className="mt-3 text-[10px] text-subtle">Source: Stocktwits only — VN tickers typically have little to no coverage on US-centric social platforms; a low post count reflects that, not bearishness.</p>
    </Card>
  );
}

/** Full per-ticker report — reused for both the ad-hoc ticker lookup and an expanded portfolio-overview row. */
function NewsSentimentDetail({ report }: { report: NewsSentimentReport }) {
  return (
    <div className="space-y-4">
      <Card glow className="!p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <span className="text-base font-bold text-accent">{report.ticker}</span>
            <span className="text-[10px] text-subtle">via {report.provider}</span>
          </div>
          <span className="text-[10px] text-subtle">{new Date(report.generatedAt).toLocaleString()}</span>
        </div>
        <p className="mt-2 text-sm text-[var(--fg)]">{report.news_sentiment_summary}</p>
      </Card>

      {report.conflicts.length > 0 && (
        <Card className="border border-amber-500/30 bg-amber-500/5 !p-4">
          <CardTitle className="!mb-2 !text-base">
            <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400"><AlertTriangle className="h-4 w-4" /> Conflicting signals</span>
          </CardTitle>
          <ul className="space-y-2">
            {report.conflicts.map((c, i) => (
              <li key={i} className="text-xs leading-relaxed text-[var(--fg)]">{c}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="!p-4">
          <CardTitle className="!mb-2 !text-base">News ({report.news_items.length})</CardTitle>
          {report.news_items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No recent news retrieved for this ticker.</p>
          ) : (
            <div className="space-y-2">
              {report.news_items.map((item, i) => (
                <NewsItemRow key={i} item={item} />
              ))}
            </div>
          )}
        </Card>

        {report.social_sentiment ? (
          <SocialSentimentCard social={report.social_sentiment} />
        ) : (
          <Card className="!p-4">
            <CardTitle className="!mb-2 !text-base">Social Sentiment</CardTitle>
            <p className="text-sm text-muted">Unavailable right now — Stocktwits couldn&apos;t be reached. News classification above is unaffected.</p>
          </Card>
        )}
      </div>

      <p className="text-center text-[11px] text-subtle">{report.disclaimer}</p>
    </div>
  );
}

function OverviewRow({
  row,
  expanded,
  onToggle,
}: {
  row: PortfolioNewsOverview["rows"][number];
  expanded: boolean;
  onToggle: () => void;
}) {
  const socialLabel =
    row.overallSocialStance == null
      ? "No social data"
      : row.report.social_sentiment
        ? `${row.report.social_sentiment.bullish_pct}% bullish (${row.report.social_sentiment.post_volume} posts)`
        : "No social data";

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
        <Badge variant={sentimentVariant(row.overallNewsStance)}>{row.overallNewsStance}</Badge>
        {row.report.conflicts.length > 0 && (
          <span title="Conflicting news/social signals — see expanded view" className="shrink-0 text-amber-500">
            <AlertTriangle className="h-3.5 w-3.5" />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-xs text-muted">{row.report.news_sentiment_summary}</span>
        <span className="hidden shrink-0 text-[11px] text-subtle sm:block">{socialLabel}</span>
      </button>
      {expanded && (
        <div className="border-t border-[var(--border)] p-3">
          <NewsSentimentDetail report={row.report} />
        </div>
      )}
    </div>
  );
}

export function NewsSentimentPanel() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NewsSentimentReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [overview, setOverview] = useState<PortfolioNewsOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const overviewRanRef = useRef(false);

  type SortKey = "symbol" | "weight" | "stance" | "social";
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
        case "stance":
          cmp = compareNumbers(STANCE_RANK[a.overallNewsStance], STANCE_RANK[b.overallNewsStance]);
          break;
        case "social":
          cmp = compareNumbers(a.report.social_sentiment?.bullish_pct, b.report.social_sentiment?.bullish_pct);
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
      }
    } catch { /* ignore */ }
  }, []);

  async function runOverview() {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const res = await fetch("/api/analysis/news-sentiment/portfolio");
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as PortfolioNewsOverview;
      setOverview(data);
      writeLocalCache(LOCAL_CACHE_KEYS.newsSentimentPortfolio, data);
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
    const cached = readLocalCache<PortfolioNewsOverview>(LOCAL_CACHE_KEYS.newsSentimentPortfolio, LOCAL_CACHE_TTL.newsSentimentPortfolio);
    if (cached) setOverview(cached);
    else void runOverview();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function analyze(sym: string) {
    const symbol = sym.toUpperCase().trim();
    if (!symbol) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const cached = readLocalCache<NewsSentimentReport>(LOCAL_CACHE_KEYS.newsSentiment(symbol), LOCAL_CACHE_TTL.newsSentiment);
    if (cached) {
      setResult(cached);
      setLoading(false);
      try { localStorage.setItem(LS_KEY, JSON.stringify({ ticker: symbol, result: cached } satisfies PersistedState)); } catch { /* ignore */ }
      return;
    }

    try {
      const res = await fetch("/api/analysis/news-sentiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const data = await res.json() as NewsSentimentReport & { error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "Analysis failed");
      } else {
        setResult(data);
        writeLocalCache(LOCAL_CACHE_KEYS.newsSentiment(symbol), data);
        try { localStorage.setItem(LS_KEY, JSON.stringify({ ticker: symbol, result: data } satisfies PersistedState)); } catch { /* ignore */ }
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
              Full news + social read for your top {overview ? Math.min(overview.holdingsCount, 10) : 10} holdings by weight. One AI
              classification pass per holding — refresh every few hours, not real-time.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void runOverview()} disabled={overviewLoading}>
            {overviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {overviewLoading ? "Analyzing…" : "Re-run"}
          </Button>
        </div>

        {overviewError && (
          <p className="mt-3 flex items-center gap-2 text-sm text-red-500"><AlertTriangle className="h-4 w-4" /> {overviewError}</p>
        )}

        {overviewLoading && !overview && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin text-accent" /> Reading news &amp; social chatter for your holdings…
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
              <SortableColumn label="Stance" column="stance" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <span className="min-w-0 flex-1" />
              <SortableColumn label="Social" column="social" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
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
            Not analyzed (top-10-by-weight cap, to bound LLM cost): {overview.skippedSymbols.join(", ")}
          </p>
        )}
      </Card>

      <Card className="!p-4">
        <CardTitle className="!mb-1 !text-base">Look up any ticker</CardTitle>
        <p className="mb-3 text-xs text-muted">
          Not limited to your holdings — reads &amp; classifies recent news + social chatter for any VN ticker.
        </p>
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
          <Loader2 className="h-4 w-4 animate-spin text-accent" /> Reading recent news &amp; social chatter…
        </Card>
      )}

      {result && !loading && <NewsSentimentDetail report={result} />}

      {!result && !loading && !error && !overview && (
        <Card className="border border-dashed border-[var(--border)] py-10 text-center">
          <Search className="mx-auto mb-2 h-8 w-8 text-subtle" />
          <p className="text-sm text-muted">Enter a stock ticker to read its recent news &amp; social tone</p>
        </Card>
      )}
    </div>
  );
}
