"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart2,
  BarChart3,
  Building2,
  CalendarDays,
  Clock,
  ExternalLink,
  FileText,
  Info,
  Landmark,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { buildPicks, type PickItem } from "@/lib/news/hot-picks";
import type {
  AiNewsItem,
  FinancialImpact,
  NewsSummaryResponse,
  NewsSignalType,
  SectorTrend,
  StockMover,
} from "@/app/api/news/summary/route";

// ─── signal config ────────────────────────────────────────────────────────────

type SignalCfg = { label: string; Icon: React.ElementType; color: string; bg: string };

const SIGNAL_CFG: Record<NewsSignalType, SignalCfg> = {
  earnings: { label: "Earnings",  Icon: BarChart3,    color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10 ring-violet-500/25" },
  guidance: { label: "Guidance",  Icon: TrendingUp,   color: "text-blue-600 dark:text-blue-400",     bg: "bg-blue-500/10 ring-blue-500/25" },
  filing:   { label: "Filing",    Icon: FileText,     color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-500/10 ring-amber-500/25" },
  analyst:  { label: "Analyst",   Icon: BarChart2,    color: "text-cyan-600 dark:text-cyan-400",     bg: "bg-cyan-500/10 ring-cyan-500/25" },
  insider:  { label: "Insider",   Icon: UserCheck,    color: "text-pink-600 dark:text-pink-400",     bg: "bg-pink-500/10 ring-pink-500/25" },
  ma:       { label: "M&A",       Icon: Building2,    color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10 ring-orange-500/25" },
  macro:    { label: "Macro",     Icon: Landmark,     color: "text-teal-600 dark:text-teal-400",     bg: "bg-teal-500/10 ring-teal-500/25" },
  noise:    { label: "Noise",     Icon: BarChart2,    color: "text-subtle",                          bg: "bg-[var(--bg-secondary)] ring-[var(--border)]" },
};

const SURPRISE_CFG = {
  BEAT:     { label: "BEAT",    color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10 ring-emerald-500/25" },
  MISS:     { label: "MISS",    color: "text-red-600 dark:text-red-400",         bg: "bg-red-500/10 ring-red-500/25" },
  IN_LINE:  { label: "IN-LINE", color: "text-blue-600 dark:text-blue-400",       bg: "bg-blue-500/10 ring-blue-500/25" },
  UNKNOWN:  { label: "",        color: "",                                        bg: "" },
};

const MOOD_CFG = {
  Bullish: { Icon: TrendingUp,   color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", ring: "ring-emerald-500/20" },
  Bearish: { Icon: TrendingDown, color: "text-red-600 dark:text-red-400",         bg: "bg-red-500/10",     ring: "ring-red-500/20" },
  Neutral: { Icon: BarChart2,    color: "text-blue-600 dark:text-blue-400",       bg: "bg-blue-500/10",    ring: "ring-blue-500/20" },
} as const;

const DIR_CFG = {
  UP:      { Icon: TrendingUp,   color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", ring: "ring-emerald-500/20" },
  DOWN:    { Icon: TrendingDown, color: "text-red-600 dark:text-red-400",         bg: "bg-red-500/10",     ring: "ring-red-500/20" },
  NEUTRAL: { Icon: BarChart2,    color: "text-muted",                             bg: "bg-[var(--bg-secondary)]", ring: "ring-[var(--border)]" },
} as const;

function sentimentVariant(s: AiNewsItem["sentiment"]): "success" | "danger" | "info" {
  if (s === "Bullish") return "success";
  if (s === "Bearish") return "danger";
  return "info";
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Financial impact dots ────────────────────────────────────────────────────

function FinancialDots({ fi }: { fi: FinancialImpact }) {
  const dots = [
    { key: "revenue",  label: "Rev",  hit: fi.revenue },
    { key: "profit",   label: "P&L",  hit: fi.profit },
    { key: "cashFlow", label: "CF",   hit: fi.cashFlow },
    { key: "growth",   label: "Gr",   hit: fi.growth },
  ];
  const anyHit = dots.some((d) => d.hit);
  if (!anyHit) return null;
  return (
    <div className="flex items-center gap-1">
      {dots.map((d) => (
        <span
          key={d.key}
          className={`rounded px-1 py-0.5 text-[9px] font-bold ring-1 ${
            d.hit
              ? "bg-accent/10 text-accent ring-accent/25"
              : "bg-[var(--bg-secondary)] text-subtle ring-[var(--border)] opacity-40"
          }`}
        >
          {d.label}
        </span>
      ))}
    </div>
  );
}

// ─── News card ────────────────────────────────────────────────────────────────

function NewsCard({ item }: { item: AiNewsItem }) {
  const sig = SIGNAL_CFG[item.signalType] ?? SIGNAL_CFG["noise"];
  const { Icon: SigIcon } = sig;
  const surprise = SURPRISE_CFG[item.surprise];
  const impactColor =
    item.impact === "HIGH" ? "text-red-600 dark:text-red-400 bg-red-500/10 ring-red-500/30"
    : item.impact === "MEDIUM" ? "text-amber-600 dark:text-amber-400 bg-amber-500/10 ring-amber-500/30"
    : "text-muted bg-[var(--bg-secondary)] ring-[var(--border)]";

  return (
    <div
      className={`group relative overflow-hidden rounded-xl ring-1 transition-all hover:ring-[var(--border-strong)] ${
        item.isBreaking ? "ring-amber-500/30" : "ring-[var(--border)]"
      }`}
    >
      {item.isBreaking && (
        <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-amber-500" />
      )}
      <div className={`p-3 ${item.isBreaking ? "pl-4" : ""}`}>
        {/* Row 1: signal badges */}
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {/* Signal type */}
          <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 ${sig.bg} ${sig.color}`}>
            <SigIcon className="h-2.5 w-2.5" />{sig.label}
          </span>

          {/* Surprise */}
          {surprise.label && (
            <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ring-1 ${surprise.bg} ${surprise.color}`}>
              {surprise.label}
            </span>
          )}

          {/* Impact */}
          <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold ring-1 ${impactColor}`}>
            {item.impact}
          </span>

          {/* Sentiment */}
          <Badge variant={sentimentVariant(item.sentiment)} className="px-1.5 py-0.5 text-[9px]">
            {item.sentiment}
          </Badge>

          {/* Scope */}
          {item.scope !== "COMPANY" && (
            <span className="rounded-md bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[9px] text-muted ring-1 ring-[var(--border)]">
              {item.scope === "SECTOR" ? "Sector-wide" : "Market-wide"}
            </span>
          )}

          {item.isBreaking && (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-600 ring-1 ring-amber-500/30 dark:text-amber-400">
              <Zap className="h-2.5 w-2.5" />Breaking
            </span>
          )}

          <span className="ml-auto flex items-center gap-0.5 text-[10px] text-subtle">
            <Clock className="h-2.5 w-2.5" />{timeAgo(item.publishedAt)}
          </span>
        </div>

        {/* Title */}
        <p className="text-[13px] font-medium leading-snug text-[var(--fg)] group-hover:text-accent">
          {item.link ? (
            <a href={item.link} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {item.title}
              <ExternalLink className="ml-1 inline h-3 w-3 opacity-50" />
            </a>
          ) : item.title}
        </p>

        {/* AI summary */}
        {item.aiSummary && item.aiSummary !== item.title && (
          <p className="mt-1 flex items-start gap-1 text-xs text-muted">
            <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-accent opacity-70" />
            {item.aiSummary}
          </p>
        )}

        {/* Row 3: financial impact + symbols */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <FinancialDots fi={item.financialImpact} />
          <span className="text-[10px] text-subtle">{item.source}</span>

          {/* Direct symbols */}
          {item.affectedSymbols.slice(0, 3).map((sym) => (
            <Link
              key={sym}
              href={`/stocks/${sym}`}
              className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent ring-1 ring-accent/20 hover:bg-accent/20"
              onClick={(e) => e.stopPropagation()}
            >
              {sym}
            </Link>
          ))}

          {/* Cascade symbols */}
          {item.cascadeSymbols.slice(0, 3).map((sym) => (
            <Link
              key={`c-${sym}`}
              href={`/stocks/${sym}`}
              className="rounded-md bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] font-medium text-muted ring-1 ring-[var(--border)] hover:text-accent"
              title="May also be affected"
              onClick={(e) => e.stopPropagation()}
            >
              {sym} ↗
            </Link>
          ))}

          {item.affectedSymbols.length + item.cascadeSymbols.length > 6 && (
            <span className="text-[10px] text-subtle">
              +{item.affectedSymbols.length + item.cascadeSymbols.length - 6}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sector Trends ────────────────────────────────────────────────────────────

function SectorTrendsPanel({ trends }: { trends: SectorTrend[] }) {
  if (!trends.length) return null;
  const ordered = [
    ...trends.filter((t) => t.direction === "UP"),
    ...trends.filter((t) => t.direction === "DOWN"),
    ...trends.filter((t) => t.direction === "NEUTRAL"),
  ];

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">Sector outlook (news-driven)</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ordered.map((t) => {
          const cfg = DIR_CFG[t.direction];
          const { Icon } = cfg;
          return (
            <div key={t.sector} className={`flex items-start gap-2.5 rounded-xl p-2.5 ring-1 ${cfg.bg} ${cfg.ring}`}>
              <div className={`mt-0.5 shrink-0 rounded-lg p-1 ${cfg.bg} ring-1 ${cfg.ring}`}>
                <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-xs font-bold ${cfg.color}`}>{t.sector}</span>
                  <span className={`text-[9px] font-semibold uppercase ${
                    t.confidence === "HIGH" ? "text-emerald-600 dark:text-emerald-400"
                    : t.confidence === "MEDIUM" ? "text-amber-600 dark:text-amber-400"
                    : "text-muted"
                  }`}>{t.confidence}</span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-muted">{t.reason}</p>
                {t.keySymbols.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {t.keySymbols.slice(0, 4).map((sym) => (
                      <Link key={sym} href={`/stocks/${sym}`}
                        className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent ring-1 ring-accent/20 hover:bg-accent/20">
                        {sym}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Stock Movers ─────────────────────────────────────────────────────────────

function StockMoversPanel({ movers }: { movers: StockMover[] }) {
  if (!movers.length) return null;
  const ups = movers.filter((m) => m.direction === "UP");
  const downs = movers.filter((m) => m.direction === "DOWN");

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">Predicted stock movers</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ups.length > 0 && (
          <div className="space-y-1.5 rounded-xl bg-emerald-500/5 p-2.5 ring-1 ring-emerald-500/20">
            <div className="mb-1 flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Likely Up</span>
            </div>
            {ups.map((m) => (
              <div key={m.symbol} className="flex items-start gap-2">
                <Link href={`/stocks/${m.symbol}`}
                  className="shrink-0 rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25 dark:text-emerald-300">
                  {m.symbol}
                </Link>
                <span className="text-[11px] leading-snug text-muted">
                  {m.impact === "HIGH" && <span className="mr-1 rounded bg-red-500/10 px-1 py-0.5 text-[9px] font-bold text-red-500 ring-1 ring-red-500/20">HIGH</span>}
                  {m.reason}
                </span>
              </div>
            ))}
          </div>
        )}
        {downs.length > 0 && (
          <div className="space-y-1.5 rounded-xl bg-red-500/5 p-2.5 ring-1 ring-red-500/20">
            <div className="mb-1 flex items-center gap-1">
              <TrendingDown className="h-3.5 w-3.5 text-red-500" />
              <span className="text-[11px] font-bold text-red-600 dark:text-red-400">Likely Down</span>
            </div>
            {downs.map((m) => (
              <div key={m.symbol} className="flex items-start gap-2">
                <Link href={`/stocks/${m.symbol}`}
                  className="shrink-0 rounded-md bg-red-500/15 px-2 py-0.5 text-xs font-bold text-red-700 ring-1 ring-red-500/30 hover:bg-red-500/25 dark:text-red-300">
                  {m.symbol}
                </Link>
                <span className="text-[11px] leading-snug text-muted">
                  {m.impact === "HIGH" && <span className="mr-1 rounded bg-red-500/10 px-1 py-0.5 text-[9px] font-bold text-red-500 ring-1 ring-red-500/20">HIGH</span>}
                  {m.reason}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Signal legend ────────────────────────────────────────────────────────────

function SignalLegend() {
  const items: [NewsSignalType, string][] = [
    ["earnings",  "Báo cáo KQKD"],
    ["guidance",  "Dự báo tương lai"],
    ["filing",    "CBTT/Regulatory"],
    ["analyst",   "Analyst revision"],
    ["insider",   "Insider trade"],
    ["ma",        "M&A/Acquisition"],
    ["macro",     "Macro/SBV"],
  ];
  return (
    <div className="rounded-xl bg-[var(--bg-secondary)] p-3 ring-1 ring-[var(--border)]">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">Signal types (7-category framework)</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {items.map(([type, desc]) => {
          const cfg = SIGNAL_CFG[type];
          const { Icon } = cfg;
          return (
            <div key={type} className="flex items-center gap-1.5">
              <Icon className={`h-3 w-3 shrink-0 ${cfg.color}`} />
              <span className={`text-[10px] font-semibold ${cfg.color}`}>{cfg.label}</span>
              <span className="text-[10px] text-subtle truncate">— {desc}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-subtle">
        <span className="font-semibold text-muted">Checklist:</span> Tin không ảnh hưởng Rev/P&amp;L/CF/Growth → Noise. Thị trường phản ứng với <em>Surprise = Actual − Expected</em>, không phải bản thân con số.
      </p>
    </div>
  );
}

// ─── Mood banner ──────────────────────────────────────────────────────────────

function MoodBanner({ mood, summary, provider }: {
  mood: NewsSummaryResponse["marketMood"];
  summary: string;
  provider: string;
}) {
  const cfg = MOOD_CFG[mood];
  const { Icon } = cfg;
  return (
    <div className={`flex items-start gap-3 rounded-xl p-3 ring-1 ${cfg.bg} ${cfg.ring}`}>
      <div className={`mt-0.5 shrink-0 rounded-lg p-1.5 ${cfg.bg} ring-1 ${cfg.ring}`}>
        <Icon className={`h-4 w-4 ${cfg.color}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${cfg.color}`}>Market Mood: {mood}</span>
          <span className="text-[10px] text-subtle">· AI via {provider}</span>
        </div>
        {summary && <p className="mt-0.5 text-xs text-muted">{summary}</p>}
      </div>
    </div>
  );
}

// ─── Hot picks (merged from HotPicksPanel) ────────────────────────────────────

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
      <AlertTriangle className="h-4 w-4 text-subtle mx-auto" />
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

function HotPicksTab({ data }: { data: NewsSummaryResponse }) {
  const picks = buildPicks(data);
  return (
    <div className="space-y-5">
      <p className="text-[11px] text-muted">
        AI-analyzed stocks likely to increase based on current news signals. Grouped by expected time horizon.
      </p>

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
          <EmptyPicks label="No short-term bullish picks detected from current news" isRuleBased={data.isRuleBased} />
        )}
      </div>

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
          <EmptyPicks label="No long-term bullish picks detected from current news" isRuleBased={data.isRuleBased} />
        )}
      </div>

      <div className="flex items-start gap-2 rounded-xl bg-[var(--bg-secondary)] px-3 py-2.5 ring-1 ring-[var(--border)]">
        <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
        <p className="text-[10px] text-subtle">
          <strong className="text-muted">AI picks are based on news signals only</strong> — not financial advice. Always verify with technical & fundamental analysis.
          {data.isRuleBased && " (keyword analysis mode — LLM enrichment active in production)"}
        </p>
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

type TabId = "outlook" | "picks" | "hot" | "all" | "guide";

export function AiNewsSummary() {
  const [data, setData] = useState<NewsSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabId>("outlook");

  async function load(refresh = false) {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/news/summary${refresh ? "?refresh=true" : ""}`);
      if (res.ok) setData(await res.json() as NewsSummaryResponse);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }

  // Fetch-on-mount — `load()` flips its own loading flag before awaiting the
  // request, which is the standard data-fetching effect pattern, not a
  // render-state sync.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount, see comment above
  useEffect(() => { void load(); }, []);

  const highCount = data?.allItems.filter((i) => i.impact === "HIGH").length ?? 0;
  const bullCount = data?.allItems.filter((i) => i.sentiment === "Bullish").length ?? 0;
  const bearCount = data?.allItems.filter((i) => i.sentiment === "Bearish").length ?? 0;
  const outlookCount = (data?.sectorTrends.length ?? 0) + (data?.stockMovers.length ?? 0);

  // signal type breakdown counts
  const signalCounts = data
    ? (["earnings","guidance","filing","analyst","insider","ma","macro"] as const).map((t) => ({
        type: t,
        count: data.allItems.filter((i) => i.signalType === t).length,
      })).filter((s) => s.count > 0)
    : [];

  const picks = useMemo(() => (data ? buildPicks(data) : null), [data]);
  const picksCount = picks ? picks.short.length + picks.long.length : 0;

  const tabs: { id: TabId; label: string }[] = [
    { id: "outlook", label: `Outlook (${outlookCount})` },
    { id: "picks",   label: `Hot Picks (${picksCount})` },
    { id: "hot",     label: `Hot (${data?.hotItems.length ?? 0})` },
    { id: "all",     label: `All (${data?.allItems.length ?? 0})` },
    { id: "guide",   label: "Guide" },
  ];

  const displayItems = tab === "hot" ? (data?.hotItems ?? []) : (data?.allItems ?? []);

  return (
    <Card className="!p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CardTitle className="!mb-0 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-accent" />
            AI News Digest
          </CardTitle>
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

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-[var(--bg-secondary)]" />)}
        </div>
      )}

      {data && !loading && (
        <div className="space-y-3">
          {/* Rule-based mode notice */}
          {data.isRuleBased && (
            <div className="flex items-start gap-2 rounded-xl bg-blue-500/8 p-2.5 ring-1 ring-blue-500/15">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
              <p className="text-[11px] text-muted">
                <span className="font-semibold text-blue-600 dark:text-blue-400">Keyword analysis mode</span>
                {" — "}AI enrichment (sector trends, stock movers, deep signal analysis) requires LLM and is active in production. Local dev uses Vietnamese keyword detection.
              </p>
            </div>
          )}

          {/* Featured story: highest-impact item */}
          {data.hotItems[0] && !data.isRuleBased && (
            <div className={`relative overflow-hidden rounded-xl ring-1 ${data.hotItems[0].isBreaking ? "bg-amber-500/5 ring-amber-500/25" : "bg-accent/5 ring-accent/20"} p-4`}>
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-md bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                  Featured Story
                </span>
                {data.hotItems[0].isBreaking && (
                  <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-600 ring-1 ring-amber-500/30 dark:text-amber-400">
                    <Zap className="h-2.5 w-2.5" />Breaking
                  </span>
                )}
                <span className="ml-auto text-[10px] text-subtle">{timeAgo(data.hotItems[0].publishedAt)}</span>
              </div>
              <p className="text-[15px] font-semibold leading-snug text-[var(--fg)]">
                {data.hotItems[0].link ? (
                  <a href={data.hotItems[0].link} target="_blank" rel="noopener noreferrer" className="hover:text-accent hover:underline">
                    {data.hotItems[0].title}
                    <ExternalLink className="ml-1 inline h-3 w-3 opacity-50" />
                  </a>
                ) : data.hotItems[0].title}
              </p>
              {data.hotItems[0].aiSummary && data.hotItems[0].aiSummary !== data.hotItems[0].title && (
                <p className="mt-1.5 flex items-start gap-1 text-sm text-muted">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent opacity-70" />
                  {data.hotItems[0].aiSummary}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.hotItems[0].affectedSymbols.slice(0, 5).map((sym) => (
                  <Link key={sym} href={`/stocks/${sym}`}
                    className="rounded-md bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent ring-1 ring-accent/20 hover:bg-accent/20">
                    {sym}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Mood */}
          <MoodBanner mood={data.marketMood} summary={data.moodSummary} provider={data.provider} />

          {/* Stats */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              { label: "High impact", value: highCount,            color: "text-red-500" },
              { label: "Bullish",     value: bullCount,            color: "text-emerald-500" },
              { label: "Bearish",     value: bearCount,            color: "text-red-500" },
              { label: "Total",       value: data.allItems.length, color: "text-muted" },
            ].map((s) => (
              <div key={s.label} className="shrink-0 rounded-lg bg-[var(--bg-secondary)] px-3 py-1.5 ring-1 ring-[var(--border)]">
                <p className={`font-mono text-sm font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-subtle">{s.label}</p>
              </div>
            ))}
            {signalCounts.map((s) => {
              const cfg = SIGNAL_CFG[s.type];
              const { Icon } = cfg;
              return (
                <div key={s.type} className={`shrink-0 rounded-lg px-3 py-1.5 ring-1 ${cfg.bg}`}>
                  <p className={`font-mono text-sm font-bold ${cfg.color}`}>{s.count}</p>
                  <p className={`flex items-center gap-0.5 text-[10px] ${cfg.color}`}>
                    <Icon className="h-2.5 w-2.5" />{cfg.label}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Breaking alert */}
          {data.hotItems.some((i) => i.isBreaking) && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-2.5 ring-1 ring-amber-500/20">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">Breaking news may affect prices</p>
                <p className="truncate text-[10px] text-muted">
                  {data.hotItems.filter((i) => i.isBreaking).map((i) => i.title).join(" · ").slice(0, 140)}…
                </p>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex flex-wrap gap-1">
            {tabs.map((t) => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
                  tab === t.id
                    ? "bg-accent text-accent-fg shadow-sm"
                    : "text-muted hover:text-[var(--fg)] bg-[var(--bg-secondary)] ring-1 ring-[var(--border)] hover:bg-[var(--bg-secondary-hover,var(--bg-secondary))]"
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab: Outlook */}
          {tab === "outlook" && (
            <div className="space-y-4">
              {outlookCount === 0 ? (
                <p className="py-4 text-center text-sm text-muted">No trend signals detected from current news</p>
              ) : (
                <>
                  <SectorTrendsPanel trends={data.sectorTrends} />
                  <StockMoversPanel movers={data.stockMovers} />
                </>
              )}
            </div>
          )}

          {/* Tab: Hot Picks */}
          {tab === "picks" && <HotPicksTab data={data} />}

          {/* Tab: Hot / All */}
          {(tab === "hot" || tab === "all") && (
            displayItems.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted">
                {tab === "hot" ? "No high-impact news detected" : "No news available"}
              </p>
            ) : (
              <div className="space-y-2">
                {displayItems.map((item) => <NewsCard key={item.id} item={item} />)}
              </div>
            )
          )}

          {/* Tab: Guide */}
          {tab === "guide" && <SignalLegend />}
        </div>
      )}
    </Card>
  );
}
