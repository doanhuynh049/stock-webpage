import Link from "next/link";
import { ArrowRight, SlidersHorizontal, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChangeBadge } from "@/components/stock/change-badge";
import { StockAvatar } from "@/components/ui/stock-avatar";
import type { StockPick } from "@/lib/stock-picks";

const horizonLabel = {
  short: "1–3 mo",
  medium: "3–12 mo",
} as const;

export function InvestmentPicks({
  picks,
  marketSentiment,
  criteria,
}: {
  picks: StockPick[];
  marketSentiment: string;
  criteria: string;
}) {
  if (picks.length === 0) {
    return (
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--fg)]">Investment Picks</h3>
          <Link href="/screener">
            <Button variant="outline" size="sm" className="gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Customize
            </Button>
          </Link>
        </div>
        <p className="mt-3 text-sm text-muted">
          No stocks matched our quality screen right now. Try the screener with relaxed filters.
        </p>
      </Card>
    );
  }

  return (
    <Card glow className="overflow-hidden !p-0">
      <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-bg)] ring-1 ring-[var(--accent)]/20">
              <Sparkles className="h-5 w-5 text-accent" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold tracking-tight text-[var(--fg)]">
                Investment Picks
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Ranked for the next period ·{" "}
                <span className="font-medium text-[var(--fg)]">{marketSentiment}</span> market
              </p>
            </div>
          </div>
          <Link href="/screener" className="shrink-0">
            <Button variant="outline" size="sm" className="gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Customize
              <ArrowRight className="h-3 w-3 opacity-60" />
            </Button>
          </Link>
        </div>
        <p className="mt-3 text-[11px] text-subtle">{criteria}</p>
      </div>

      <div className="divide-y divide-[var(--border)]">
        {picks.map((pick, i) => (
          <Link
            key={pick.stock.symbol}
            href={`/stocks/${pick.stock.symbol}`}
            className="group block px-5 py-4 transition-colors hover:bg-[var(--bg-secondary)] sm:px-6"
          >
            <div className="grid gap-4 lg:grid-cols-[auto_1fr_auto_auto] lg:items-center lg:gap-6">
              <div className="flex items-center gap-3 lg:gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-bg)] text-xs font-bold text-accent">
                  {i + 1}
                </span>
                <StockAvatar
                  symbol={pick.stock.symbol}
                  sector={pick.stock.sector}
                  size="md"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-[var(--fg)] group-hover:text-accent">
                      {pick.stock.symbol}
                    </span>
                    <Badge variant="info">{horizonLabel[pick.horizon]}</Badge>
                    <Badge variant="success">Score {pick.score}</Badge>
                  </div>
                  <p className="truncate text-sm text-muted">{pick.stock.name}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 lg:justify-start">
                {pick.reasons.map((r) => (
                  <span
                    key={r}
                    className="rounded-md bg-[var(--bg-secondary)] px-2 py-1 text-[10px] text-muted ring-1 ring-[var(--border)]"
                  >
                    {r}
                  </span>
                ))}
              </div>

              <div className="text-left lg:text-right">
                <p className="font-mono text-lg font-semibold text-[var(--fg)]">
                  {pick.stock.price.toLocaleString()}
                  <span className="ml-0.5 text-xs font-normal text-muted">₫</span>
                </p>
                <ChangeBadge value={pick.stock.changePercent} className="mt-1 text-xs" />
              </div>

              {pick.upsidePercent >= 5 && (
                <div className="rounded-xl bg-[var(--accent-bg)] px-3 py-2 text-left ring-1 ring-[var(--accent)]/15 lg:min-w-[100px] lg:text-right">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-subtle">
                    Target upside
                  </p>
                  <p className="font-mono text-sm font-semibold text-success">
                    +{pick.upsidePercent.toFixed(0)}%
                  </p>
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>

      <p className="border-t border-[var(--border)] px-5 py-3 text-[10px] text-subtle sm:px-6">
        Not financial advice. Open any pick for charts, fundamentals, and AI analysis.
      </p>
    </Card>
  );
}
