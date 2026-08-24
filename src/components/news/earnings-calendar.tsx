"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import type { AiNewsItem, NewsSummaryResponse } from "@/app/api/news/summary/route";

// ─── VN Earnings Season logic ─────────────────────────────────────────────────
//
// Vietnamese listed companies MUST file quarterly KQKD by:
//   Q1  → April 30       (results for Jan–Mar)
//   Q2  → July 31        (results for Apr–Jun)  — small caps: August 14
//   Q3  → October 31     (results for Jul–Sep)
//   Q4  → January 31 next year  (preliminary)   / March 31 (audited)
//
// Major VN30 companies typically release 2–4 weeks before the deadline.

type Quarter = "Q1" | "Q2" | "Q3" | "Q4";
type SeasonStatus = "upcoming" | "active" | "peak" | "done";

interface Season {
  quarter: Quarter;
  year: number;
  resultsFor: string;        // e.g. "Jan–Mar 2026"
  deadline: Date;
  earlyWindow: Date;         // when large caps typically start
  status: SeasonStatus;
  daysUntilDeadline: number;
}

function buildSeasons(now: Date): Season[] {
  const y = now.getFullYear();
  const seasons: Array<{ q: Quarter; deadline: [number, number]; early: [number, number]; label: string }> = [
    { q: "Q1", deadline: [y, 3],  early: [y, 2],  label: `Jan–Mar ${y}` },    // Apr 30 → month index 3
    { q: "Q2", deadline: [y, 6],  early: [y, 5],  label: `Apr–Jun ${y}` },    // Jul 31 → month index 6
    { q: "Q3", deadline: [y, 9],  early: [y, 8],  label: `Jul–Sep ${y}` },    // Oct 31 → month index 9
    { q: "Q4", deadline: [y + 1, 0], early: [y, 11], label: `Oct–Dec ${y}` }, // Jan 31 next year
  ];

  return seasons.map(({ q, deadline, early, label }) => {
    const dl = new Date(deadline[0], deadline[1], 28); // last week of that month
    const ew = new Date(early[0], early[1], 10);
    const diffDays = Math.ceil((dl.getTime() - now.getTime()) / 86400000);

    let status: SeasonStatus;
    if (diffDays < 0) status = "done";
    else if (now >= ew && diffDays <= 30) status = "peak";
    else if (now >= ew) status = "active";
    else status = "upcoming";

    return {
      quarter: q,
      year: deadline[0],
      resultsFor: label,
      deadline: dl,
      earlyWindow: ew,
      status,
      daysUntilDeadline: diffDays,
    };
  });
}

const STATUS_CFG: Record<SeasonStatus, { label: string; color: string; bg: string; ring: string }> = {
  peak:     { label: "Active Now",  color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", ring: "ring-emerald-500/30" },
  active:   { label: "In Season",   color: "text-blue-600 dark:text-blue-400",       bg: "bg-blue-500/10",    ring: "ring-blue-500/30" },
  upcoming: { label: "Upcoming",    color: "text-amber-600 dark:text-amber-400",     bg: "bg-amber-500/10",   ring: "ring-amber-500/30" },
  done:     { label: "Completed",   color: "text-muted",                             bg: "bg-[var(--bg-secondary)]", ring: "ring-[var(--border)]" },
};

function fmtDate(d: Date): string {
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── Surprise badge ───────────────────────────────────────────────────────────

function SurpriseBadge({ s }: { s: AiNewsItem["surprise"] }) {
  if (s === "UNKNOWN" || !s) return null;
  const cfg =
    s === "BEAT"
      ? { label: "BEAT ↑",    cls: "text-emerald-700 bg-emerald-500/10 ring-emerald-500/30 dark:text-emerald-300" }
      : s === "MISS"
      ? { label: "MISS ↓",    cls: "text-red-700 bg-red-500/10 ring-red-500/30 dark:text-red-300" }
      : { label: "IN-LINE →", cls: "text-blue-700 bg-blue-500/10 ring-blue-500/30 dark:text-blue-300" };
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ring-1 ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ─── Earnings news item ───────────────────────────────────────────────────────

function EarningsNewsRow({ item }: { item: AiNewsItem }) {
  const isGuidance = item.signalType === "guidance";
  const sentColor = item.sentiment === "Bullish"
    ? "text-emerald-600 dark:text-emerald-400"
    : item.sentiment === "Bearish"
    ? "text-red-600 dark:text-red-400"
    : "text-muted";

  return (
    <div className="flex items-start gap-3 rounded-xl p-3 ring-1 ring-[var(--border)] transition-all hover:ring-[var(--border-strong)]">
      <div className={`mt-0.5 shrink-0 rounded-lg p-1.5 ${isGuidance ? "bg-blue-500/10 ring-1 ring-blue-500/20" : "bg-violet-500/10 ring-1 ring-violet-500/20"}`}>
        {isGuidance
          ? <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
          : <BarChart3 className="h-3.5 w-3.5 text-violet-500" />
        }
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span className={`text-[10px] font-bold uppercase ${isGuidance ? "text-blue-600 dark:text-blue-400" : "text-violet-600 dark:text-violet-400"}`}>
            {isGuidance ? "Guidance" : "Earnings"}
          </span>
          <SurpriseBadge s={item.surprise} />
          {item.impact === "HIGH" && (
            <span className="rounded bg-red-500/10 px-1 py-0.5 text-[9px] font-bold text-red-500 ring-1 ring-red-500/20">HIGH</span>
          )}
          <span className={`text-[10px] font-medium ${sentColor}`}>{item.sentiment}</span>
          <span className="ml-auto flex items-center gap-0.5 text-[10px] text-subtle">
            <Clock className="h-2.5 w-2.5" />
            {new Date(item.publishedAt).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}
          </span>
        </div>

        <p className="text-[13px] font-medium leading-snug text-[var(--fg)]">
          {item.link
            ? <a href={item.link} target="_blank" rel="noopener noreferrer" className="hover:text-accent hover:underline">{item.title}</a>
            : item.title
          }
        </p>

        {item.aiSummary && item.aiSummary !== item.title && (
          <p className="mt-1 flex items-start gap-1 text-xs text-muted">
            <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-accent opacity-60" />
            {item.aiSummary}
          </p>
        )}

        {/* Financial impact + symbols */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {/* Financial impact dots */}
          {(["revenue","profit","cashFlow","growth"] as const).map((k) => {
            const hit = item.financialImpact?.[k];
            const lbl = k === "cashFlow" ? "CF" : k === "revenue" ? "Rev" : k === "profit" ? "P&L" : "Gr";
            return hit ? (
              <span key={k} className="rounded bg-accent/10 px-1.5 py-0.5 text-[9px] font-bold text-accent ring-1 ring-accent/25">{lbl}</span>
            ) : null;
          })}
          {item.affectedSymbols.slice(0, 4).map((sym) => (
            <Link key={sym} href={`/stocks/${sym}`}
              className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent ring-1 ring-accent/20 hover:bg-accent/20">
              {sym}
            </Link>
          ))}
          {item.cascadeSymbols?.slice(0, 3).map((sym) => (
            <Link key={`c-${sym}`} href={`/stocks/${sym}`}
              className="rounded-md bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] text-muted ring-1 ring-[var(--border)] hover:text-accent"
              title="May also be affected">
              {sym} ↗
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Season row ───────────────────────────────────────────────────────────────

function SeasonRow({
  season,
  isCurrent,
  onViewEarnings,
}: {
  season: Season;
  isCurrent: boolean;
  onViewEarnings?: () => void;
}) {
  const cfg = STATUS_CFG[season.status];
  const isClickable = season.status === "peak" || season.status === "active";

  return (
    <div className={`flex items-center gap-3 rounded-xl p-3 ring-1 ${isCurrent ? `${cfg.bg} ${cfg.ring}` : "ring-[var(--border)]"}`}>
      <div className={`shrink-0 rounded-xl px-2.5 py-1 text-center ${cfg.bg} ring-1 ${cfg.ring}`}>
        <p className={`text-xs font-black ${cfg.color}`}>{season.quarter}</p>
        <p className="text-[9px] text-subtle">{season.year}</p>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--fg)]">Results for {season.resultsFor}</span>
          {isCurrent && (
            <span className={`rounded-md px-2 py-0.5 text-[9px] font-bold ring-1 ${cfg.bg} ${cfg.ring} ${cfg.color}`}>
              {cfg.label}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            Deadline: {fmtDate(season.deadline)}
          </span>
          {season.status !== "done" && (
            <span className={`font-medium ${season.daysUntilDeadline <= 14 ? "text-red-500" : season.daysUntilDeadline <= 30 ? "text-amber-500" : "text-muted"}`}>
              {season.daysUntilDeadline > 0
                ? `${season.daysUntilDeadline}d remaining`
                : "Past deadline"}
            </span>
          )}
        </div>
      </div>

      {season.status === "done" ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-muted opacity-40" />
      ) : isClickable ? (
        <button
          type="button"
          onClick={onViewEarnings}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-accent/10 px-2.5 py-1 text-[10px] font-semibold text-accent ring-1 ring-accent/20 transition-all hover:bg-accent/20 hover:ring-accent/40"
          title="View which companies have reported BEAT / MISS"
        >
          Track
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      ) : (
        <Clock className="h-4 w-4 shrink-0 text-subtle opacity-60" />
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function EarningsCalendar() {
  const [newsData, setNewsData] = useState<NewsSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"calendar" | "news">("calendar");

  useEffect(() => {
    fetch("/api/news/summary")
      .then((r) => r.ok ? r.json() as Promise<NewsSummaryResponse> : null)
      .then((d) => { if (d) setNewsData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const now = useMemo(() => new Date(), []);
  const seasons = useMemo(() => buildSeasons(now), [now]);
  const currentSeason = seasons.find((s) => s.status === "peak" || s.status === "active");

  // Filter earnings + guidance from news
  const earningsNews = newsData?.allItems.filter(
    (i) => i.signalType === "earnings" || i.signalType === "guidance"
  ) ?? [];

  const beats = earningsNews.filter((i) => i.surprise === "BEAT").length;
  const misses = earningsNews.filter((i) => i.surprise === "MISS").length;
  const guidanceItems = earningsNews.filter((i) => i.signalType === "guidance").length;

  return (
    <Card className="!p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <CardTitle className="!mb-0 flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4 text-accent" />
          Earnings Calendar
        </CardTitle>
        {currentSeason && (
          <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ring-1 ${STATUS_CFG["peak"].bg} ${STATUS_CFG["peak"].ring} ${STATUS_CFG["peak"].color}`}>
            {currentSeason.quarter} {currentSeason.year} Season Active
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-3 flex gap-1">
        {(["calendar", "news"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all ${
              tab === t
                ? "bg-accent text-accent-fg shadow-sm"
                : "text-muted hover:text-[var(--fg)] bg-[var(--bg-secondary)] ring-1 ring-[var(--border)]"
            }`}>
            {t === "calendar" ? "VN Season Calendar" : `Earnings News (${earningsNews.length})`}
          </button>
        ))}
      </div>

      {/* Calendar tab */}
      {tab === "calendar" && (
        <div className="space-y-3">
          {/* Key summary */}
          <div className="rounded-xl bg-[var(--bg-secondary)] p-3 ring-1 ring-[var(--border)]">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">VN Reporting Deadlines (UBCK/HOSE/HNX rules)</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {[
                { q: "Q1 (Jan–Mar)", date: "Deadline: April 30" },
                { q: "Q2 (Apr–Jun)", date: "Deadline: July 31" },
                { q: "Q3 (Jul–Sep)", date: "Deadline: October 31" },
                { q: "Q4 (Oct–Dec)", date: "Deadline: January 31 (preliminary) / March 31 (audited)" },
              ].map((r) => (
                <div key={r.q} className="flex flex-col">
                  <span className="font-semibold text-[var(--fg)]">{r.q}</span>
                  <span className="text-muted">{r.date}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-subtle">
              <span className="font-medium text-muted">VN30 / large caps</span> typically report 2–4 weeks before deadline.
              <span className="font-medium text-muted"> Small caps</span> may use extended deadline (+15 days).
            </p>
          </div>

          {/* Season timeline */}
          <div className="space-y-2">
            {seasons.map((s) => (
              <SeasonRow
                key={`${s.quarter}-${s.year}`}
                season={s}
                isCurrent={s === currentSeason}
                onViewEarnings={() => setTab("news")}
              />
            ))}
          </div>

          {/* What to watch */}
          <div className="rounded-xl bg-[var(--bg-secondary)] p-3 ring-1 ring-[var(--border)]">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">What to watch during earnings season</p>
            <div className="space-y-1.5">
              {[
                { Icon: TrendingUp,    color: "text-emerald-500", text: "Surprise = Actual EPS − Expected EPS → market reacts to the gap, not the number" },
                { Icon: AlertCircle,   color: "text-blue-500",    text: "Guidance revision often moves price MORE than the current-quarter result" },
                { Icon: BarChart3,     color: "text-violet-500",  text: "Revenue beat + earnings beat + raised guidance = triple positive signal" },
                { Icon: TrendingDown,  color: "text-red-500",     text: "Good quarter + lowered guidance → stock often drops (\"buy the rumour, sell the news\")" },
                { Icon: CheckCircle2,  color: "text-amber-500",   text: "Sector contagion: if VCB beats, other banks (TCB, MBB, BID) may follow" },
              ].map(({ Icon, color, text }, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${color}`} />
                  <span className="text-[11px] text-muted">{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Earnings news tab */}
      {tab === "news" && (
        <div className="space-y-3">
          {/* Season tracker header */}
          {currentSeason && (
            <div className={`rounded-xl p-3 ring-1 ${STATUS_CFG[currentSeason.status].bg} ${STATUS_CFG[currentSeason.status].ring}`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className={`text-xs font-bold uppercase tracking-wider ${STATUS_CFG[currentSeason.status].color}`}>
                    {currentSeason.quarter} {currentSeason.year} Earnings Tracker
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    Results for {currentSeason.resultsFor} · Deadline {fmtDate(currentSeason.deadline)}
                    {currentSeason.daysUntilDeadline > 0 && (
                      <span className={`ml-1 font-semibold ${currentSeason.daysUntilDeadline <= 14 ? "text-red-500" : "text-amber-500"}`}>
                        ({currentSeason.daysUntilDeadline}d left)
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs">
                  {beats > 0 && (
                    <span className="flex items-center gap-0.5 font-bold text-emerald-600 dark:text-emerald-400">
                      <TrendingUp className="h-3 w-3" /> {beats} BEAT
                    </span>
                  )}
                  {misses > 0 && (
                    <span className="flex items-center gap-0.5 font-bold text-red-600 dark:text-red-400">
                      <TrendingDown className="h-3 w-3" /> {misses} MISS
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {loading && (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-[var(--bg-secondary)]" />)}
            </div>
          )}

          {!loading && earningsNews.length === 0 && (
            <div className="rounded-xl bg-[var(--bg-secondary)] p-6 text-center ring-1 ring-[var(--border)]">
              <BarChart3 className="mx-auto h-8 w-8 text-subtle opacity-40" />
              <p className="mt-2 text-sm text-muted">No earnings or guidance news in current feed</p>
              <p className="mt-1 text-xs text-subtle">Refresh the AI Digest to load the latest news</p>
            </div>
          )}

          {!loading && earningsNews.length > 0 && (
            <>
              {/* Quick stats */}
              <div className="flex gap-2">
                {[
                  { label: "Earnings", value: earningsNews.filter((i) => i.signalType === "earnings").length, color: "text-violet-500" },
                  { label: "Guidance", value: guidanceItems, color: "text-blue-500" },
                  { label: "Beats",    value: beats,         color: "text-emerald-500" },
                  { label: "Misses",   value: misses,        color: "text-red-500" },
                ].map((s) => (
                  <div key={s.label} className="shrink-0 rounded-lg bg-[var(--bg-secondary)] px-3 py-1.5 ring-1 ring-[var(--border)]">
                    <p className={`font-mono text-sm font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-subtle">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Beats first, then misses, then guidance */}
              {[
                { label: "Earnings Beats", items: earningsNews.filter((i) => i.surprise === "BEAT"), color: "text-emerald-600 dark:text-emerald-400" },
                { label: "Earnings Misses", items: earningsNews.filter((i) => i.surprise === "MISS"), color: "text-red-600 dark:text-red-400" },
                { label: "Guidance Updates", items: earningsNews.filter((i) => i.signalType === "guidance"), color: "text-blue-600 dark:text-blue-400" },
                { label: "Other Earnings", items: earningsNews.filter((i) => i.signalType === "earnings" && i.surprise !== "BEAT" && i.surprise !== "MISS"), color: "text-muted" },
              ].map(({ label, items, color }) =>
                items.length > 0 ? (
                  <div key={label} className="space-y-2">
                    <p className={`text-[11px] font-bold uppercase tracking-wider ${color}`}>{label}</p>
                    {items.map((item) => <EarningsNewsRow key={item.id} item={item} />)}
                  </div>
                ) : null
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
