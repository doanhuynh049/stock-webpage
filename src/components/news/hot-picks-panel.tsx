"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Clock,
  CalendarDays,
  AlertCircle,
} from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import type { NewsSummaryResponse, StockMover, AiNewsItem } from "@/app/api/news/summary/route";

// Short-term signals: news with an immediate catalyst
const SHORT_TERM_SIGNALS = new Set(["earnings", "filing", "analyst", "insider"]);
// Longer-term signals: macro, sector, guidance
const LONG_TERM_SIGNALS = new Set(["macro", "guidance", "ma"]);

type PickItem = {
  symbol: string;
  name?: string;
  reason: string;
  impact: "HIGH" | "MEDIUM";
  horizon: "short" | "long";
  signalType?: string;
  newsTitle?: string;
  newsLink?: string;
};

function classifyHorizon(
  mover: StockMover,
  relatedNews: AiNewsItem[],
): "short" | "long" {
  const news = relatedNews.find(
    (n) =>
      n.affectedSymbols.includes(mover.symbol) ||
      n.cascadeSymbols.includes(mover.symbol),
  );
  if (!news) return "short";
  if (LONG_TERM_SIGNALS.has(news.signalType)) return "long";
  if (SHORT_TERM_SIGNALS.has(news.signalType)) return "short";
  return "short";
}

function buildPicks(data: NewsSummaryResponse): { short: PickItem[]; long: PickItem[] } {
  const picks: PickItem[] = [];
  const seenSymbols = new Set<string>();

  function addPick(p: PickItem) {
    if (seenSymbols.has(p.symbol)) return;
    seenSymbols.add(p.symbol);
    picks.push(p);
  }

  // 1. LLM stock movers (only present in non-rule-based mode)
  for (const m of data.stockMovers.filter((m) => m.direction === "UP")) {
    const horizon = classifyHorizon(m, data.allItems);
    const related = data.allItems.find(
      (n) => n.affectedSymbols.includes(m.symbol) || n.cascadeSymbols.includes(m.symbol),
    );
    addPick({
      symbol: m.symbol,
      name: m.name,
      reason: m.reason,
      impact: m.impact,
      horizon,
      signalType: related?.signalType,
      newsTitle: related?.title,
      newsLink: related?.link,
    });
  }

  // 2. Sector trends with keySymbols (both LLM and rule-based)
  for (const trend of data.sectorTrends.filter((t) => t.direction === "UP")) {
    for (const sym of trend.keySymbols.slice(0, 3)) {
      addPick({
        symbol: sym,
        reason: trend.reason,
        impact: trend.confidence === "HIGH" ? "HIGH" : "MEDIUM",
        horizon: "long",
        signalType: "macro",
        newsTitle: `${trend.sector} sector trend`,
      });
    }
  }

  // 3. All items (both hotItems + allItems) — bullish with symbols
  //    This is the primary path in rule-based mode where stockMovers is always []
  const itemsToScan = [
    ...data.hotItems,
    ...data.allItems.filter((n) => n.sentiment === "Bullish" && n.impact !== "LOW"),
  ];
  for (const item of itemsToScan) {
    if (item.sentiment !== "Bullish") continue;
    const syms = [...item.affectedSymbols, ...item.cascadeSymbols].slice(0, 4);
    if (!syms.length) continue;
    const horizon: "short" | "long" = LONG_TERM_SIGNALS.has(item.signalType) ? "long" : "short";
    for (const sym of syms) {
      addPick({
        symbol: sym,
        reason: item.aiSummary && item.aiSummary !== item.title ? item.aiSummary : item.title,
        impact: item.impact === "HIGH" ? "HIGH" : "MEDIUM",
        horizon,
        signalType: item.signalType,
        newsTitle: item.title,
        newsLink: item.link,
      });
    }
  }

  const short = picks.filter((p) => p.horizon === "short").slice(0, 8);
  const long = picks.filter((p) => p.horizon === "long").slice(0, 8);
  return { short, long };
}

function PickCard({ pick }: { pick: PickItem }) {
  const isHigh = pick.impact === "HIGH";
  return (
    <div className="flex items-start gap-3 rounded-xl ring-1 ring-[var(--border)] p-3 hover:bg-[var(--bg-secondary)] transition-colors">
      <div className="mt-0.5 shrink-0 rounded-lg bg-emerald-500/10 p-1.5 ring-1 ring-emerald-500/25">
        <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/stocks/${pick.symbol}`}
            className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-500/25 hover:bg-emerald-500/20 dark:text-emerald-300"
          >
            {pick.symbol}
          </Link>
          {pick.name && (
            <span className="text-[10px] text-subtle truncate max-w-[120px]">{pick.name}</span>
          )}
          {isHigh && (
            <span className="rounded-md bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-600 ring-1 ring-red-500/25 dark:text-red-400">
              HIGH
            </span>
          )}
          {pick.signalType && (
            <span className="rounded-md bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[9px] text-subtle ring-1 ring-[var(--border)] capitalize">
              {pick.signalType}
            </span>
          )}
        </div>
        <p className="text-[12px] leading-snug text-muted">{pick.reason}</p>
        {pick.newsTitle && pick.newsLink && (
          <a
            href={pick.newsLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-accent hover:underline line-clamp-1"
          >
            {pick.newsTitle}
          </a>
        )}
      </div>
    </div>
  );
}

function EmptyPicks({ label, isRuleBased }: { label: string; isRuleBased?: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-4 text-center space-y-1">
      <AlertCircle className="h-4 w-4 text-subtle mx-auto" />
      <p className="text-sm text-muted">{label}</p>
      {isRuleBased && (
        <p className="text-[10px] text-subtle">
          Keyword mode active — LLM enrichment (Groq/Gemini) produces richer picks. Check{" "}
          <strong className="text-muted">/settings/ai</strong> to configure an API key.
        </p>
      )}
    </div>
  );
}

export function HotPicksPanel() {
  const [data, setData] = useState<NewsSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(refresh = false) {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/news/summary${refresh ? "?refresh=true" : ""}`);
      if (res.ok) setData(await res.json() as NewsSummaryResponse);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { void load(); }, []);

  const picks = data ? buildPicks(data) : null;
  const totalPicks = (picks?.short.length ?? 0) + (picks?.long.length ?? 0);

  return (
    <Card className="!p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CardTitle className="!mb-0 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-emerald-500" />
            AI Hot Picks
          </CardTitle>
          {data && (
            <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
              {totalPicks} picks
            </span>
          )}
          {data && (
            <span className="rounded-md bg-[var(--bg-secondary)] px-2 py-0.5 text-[10px] text-subtle ring-1 ring-[var(--border)]">
              {new Date(data.generatedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted ring-1 ring-[var(--border)] transition hover:bg-[var(--bg-secondary)] disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <p className="mb-3 text-[11px] text-muted">
        AI-analyzed stocks likely to increase based on current news signals. Grouped by expected time horizon.
      </p>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          Analyzing news for hot picks…
        </div>
      )}

      {picks && !loading && (
        <div className="space-y-5">
          {/* Short-term: 1-5 days */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <div className="rounded-lg bg-blue-500/10 p-1 ring-1 ring-blue-500/20">
                <Clock className="h-3.5 w-3.5 text-blue-500" />
              </div>
              <p className="text-xs font-semibold text-[var(--fg)]">Short-term</p>
              <span className="text-[10px] text-subtle">1–5 days · catalysts: earnings, filings, analyst upgrades</span>
            </div>
            {picks.short.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {picks.short.map((p) => (
                  <PickCard key={p.symbol} pick={p} />
                ))}
              </div>
            ) : (
              <EmptyPicks label="No short-term bullish picks detected from current news" isRuleBased={data?.isRuleBased} />
            )}
          </div>

          {/* Long-term: 1-3 months */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <div className="rounded-lg bg-violet-500/10 p-1 ring-1 ring-violet-500/20">
                <CalendarDays className="h-3.5 w-3.5 text-violet-500" />
              </div>
              <p className="text-xs font-semibold text-[var(--fg)]">Long-term</p>
              <span className="text-[10px] text-subtle">1–3 months · drivers: macro trends, M&A, guidance</span>
            </div>
            {picks.long.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {picks.long.map((p) => (
                  <PickCard key={p.symbol} pick={p} />
                ))}
              </div>
            ) : (
              <EmptyPicks label="No long-term bullish picks detected from current news" isRuleBased={data?.isRuleBased} />
            )}
          </div>

          {/* Disclaimer */}
          <div className="flex items-start gap-2 rounded-xl bg-[var(--bg-secondary)] px-3 py-2.5 ring-1 ring-[var(--border)]">
            <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <p className="text-[10px] text-subtle">
              <strong className="text-muted">AI picks are based on news signals only</strong> — not financial advice. Always verify with technical & fundamental analysis. Past news catalysts do not guarantee price increases.
              {data?.isRuleBased && " (keyword analysis mode — LLM enrichment active in production)"}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
