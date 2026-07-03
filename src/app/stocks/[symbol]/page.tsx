import { notFound } from "next/navigation";
import Link from "next/link";
import { BackButton } from "@/components/stock/back-button";
import { Bot, BarChart2, Building, Target, TrendingUp } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { FinancialChart } from "@/components/stock/financial-chart";
import { Badge } from "@/components/ui/badge";
import { ChangeBadge } from "@/components/stock/change-badge";
import { PriceChartPanel } from "@/components/stock/price-chart-panel";
import { WatchlistButton } from "@/components/stock/watchlist-button";
import { LogTradeLink } from "@/components/trading/log-trade-link";
import { CachedNewsFeed } from "@/components/stock/cached-news-feed";
import { StockAvatar } from "@/components/ui/stock-avatar";
import { analyzeStock } from "@/lib/analysis/stock-analysis";
import {
  generateAiSummary,
  getPriceHistory,
  getStock,
  getTechnicalSignals,
} from "@/lib/stocks";
import { StockAnalysisPanel } from "@/components/stock/stock-analysis-panel";
import { auth } from "@/lib/auth";
import { isInWatchlist } from "@/lib/user-data";
import { formatMarketCap, formatVolume } from "@/lib/utils";
import { getSectorColor } from "@/lib/sector-colors";
import { isEtfSymbol, } from "@/lib/analysis/etf-utils";
import { getEtfMeta } from "@/lib/analysis/etf-universe";

export default async function StockDetailPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const stock = await getStock(symbol);
  if (!stock) notFound();

  const [priceHistory, technicals, analysis] = await Promise.all([
    getPriceHistory(symbol, 90),
    getTechnicalSignals(stock),
    analyzeStock(stock),
  ]);
  const aiSummary = generateAiSummary(stock);
  const session = await auth();
  const inWatchlist = session?.user?.id ? await isInWatchlist(symbol) : false;
  const sectorColor = getSectorColor(stock.sector);
  const isEtf = isEtfSymbol(symbol);
  const etfMeta = isEtf ? getEtfMeta(symbol) : null;

  const financialChart = stock.financials.years.map((year, i) => ({
    year,
    revenue: stock.financials.revenue[i],
    profit: stock.financials.netProfit[i],
  }));

  const priceRange =
    ((stock.price - stock.low52w) / (stock.high52w - stock.low52w)) * 100;

  return (
    <div className="space-y-4">
      <BackButton />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <StockAvatar symbol={stock.symbol} sector={stock.sector} size="lg" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">{stock.symbol}</h1>
              <Badge variant="info">{stock.exchange}</Badge>
              <Badge style={{ color: sectorColor, borderColor: `${sectorColor}40` }}>
                {stock.sector}
              </Badge>
            </div>
            <p className="mt-1 text-muted">{stock.name}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {session?.user && (
            <LogTradeLink
              symbol={stock.symbol}
              price={stock.price}
              exchange={stock.exchange}
              sector={stock.sector}
              variant="outline"
              label="Log trade"
            />
          )}
          <WatchlistButton
            symbol={stock.symbol}
            initialInWatchlist={inWatchlist}
            isAuthenticated={!!session?.user}
          />
        </div>
      </div>

      <Card glow className="!p-6 sm:!p-8">
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-subtle">
              Last Price
            </p>
            <p className="mt-1 font-mono text-4xl font-bold tracking-tight text-[var(--fg)] sm:text-5xl">
              {stock.price.toLocaleString()}
              <span className="ml-1 text-lg text-muted">₫</span>
            </p>
          </div>
          <ChangeBadge value={stock.changePercent} className="text-lg px-3 py-1" />
          <div className="flex gap-6 text-sm text-muted">
            <span>Vol <strong className="text-[var(--fg)]">{formatVolume(stock.volume)}</strong></span>
            <span>MCap <strong className="text-[var(--fg)]">{formatMarketCap(stock.marketCap)}</strong></span>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex justify-between text-[10px] text-subtle">
            <span>52W Low {stock.low52w.toLocaleString()}</span>
            <span>52W High {stock.high52w.toLocaleString()}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-secondary)]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500"
              style={{ width: `${Math.min(Math.max(priceRange, 5), 95)}%` }}
            />
          </div>
        </div>
      </Card>

      <StockAnalysisPanel analysis={analysis} />

      <PriceChartPanel
        symbol={stock.symbol}
        initialData={priceHistory}
        initialDays={90}
      />

      {isEtf ? (
        /* ── ETF-specific metrics ── */
        <div className="space-y-4">
          {/* ETF identity card */}
          {etfMeta && (
            <Card className="bg-gradient-to-br from-emerald-500/5 to-transparent">
              <CardTitle className="flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-emerald-500" />
                ETF Overview
              </CardTitle>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    label: "Benchmark",
                    value: etfMeta.benchmark,
                    icon: <TrendingUp className="h-4 w-4 text-emerald-500" />,
                  },
                  {
                    label: "Fund Manager",
                    value: etfMeta.manager,
                    icon: <Building className="h-4 w-4 text-blue-500" />,
                  },
                  {
                    label: "AUM (approx.)",
                    value: etfMeta.aumBnVnd != null ? `${etfMeta.aumBnVnd.toLocaleString("vi-VN")} B ₫` : "N/A",
                    icon: <BarChart2 className="h-4 w-4 text-violet-500" />,
                  },
                  {
                    label: "RSI (14)",
                    value: stock.rsi,
                    icon: <TrendingUp className="h-4 w-4 text-amber-500" />,
                  },
                ].map((m) => (
                  <div key={m.label} className="surface-muted p-4">
                    <div className="mb-1 flex items-center gap-1.5">
                      {m.icon}
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle">{m.label}</p>
                    </div>
                    <p className="font-mono text-base font-bold text-[var(--fg)]">{String(m.value)}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ETF technical stats */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "RSI (14)", value: stock.rsi },
              { label: "52W High", value: stock.high52w.toLocaleString("vi-VN") },
              { label: "52W Low", value: stock.low52w.toLocaleString("vi-VN") },
              { label: "Market Cap", value: formatMarketCap(stock.marketCap) },
            ].map((m) => (
              <div key={m.label} className="surface-muted p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle">{m.label}</p>
                <p className="mt-1 font-mono text-xl font-bold text-[var(--fg)]">{m.value}</p>
              </div>
            ))}
          </div>

          {/* ETF description */}
          <Card>
            <CardTitle>About this ETF</CardTitle>
            <p className="text-sm leading-relaxed text-muted">
              {stock.profile ||
                (etfMeta
                  ? `${etfMeta.name} is a passively-managed exchange-traded fund that tracks the ${etfMeta.benchmark} index, managed by ${etfMeta.manager}. ETFs have no individual company fundamentals (P/E, ROE, revenue growth are not applicable). Evaluate by AUM size, benchmark tracking accuracy, liquidity, and technical momentum.`
                  : "This is an ETF. It tracks an index and has no individual company fundamentals.")}
            </p>
            <div className="mt-4 rounded-xl bg-emerald-500/5 px-4 py-3 text-xs text-muted ring-1 ring-emerald-500/20">
              <strong className="text-emerald-600 dark:text-emerald-400">ETF Evaluation Guide:</strong>
              {" "}P/E, P/B, ROE, and revenue figures are not applicable to ETFs. Assess by AUM (larger = better liquidity), benchmark tracking error (lower = better), expense ratio, and technical trend against the tracked index.
            </div>
          </Card>
        </div>
      ) : (
        /* ── Regular stock metrics ── */
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "P/E", value: stock.pe > 0 ? stock.pe : "N/A" },
              { label: "P/B", value: stock.pb },
              { label: "ROE", value: `${stock.roe}%` },
              { label: "Div Yield", value: `${stock.dividendYield}%` },
              { label: "Rev Growth", value: `${stock.revenueGrowth}%` },
              { label: "RSI (14)", value: stock.rsi },
              { label: "52W High", value: stock.high52w.toLocaleString() },
              { label: "52W Low", value: stock.low52w.toLocaleString() },
            ].map((m) => (
              <div
                key={m.label}
                className="surface-muted p-4"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle">
                  {m.label}
                </p>
                <p className="mt-1 font-mono text-xl font-bold text-[var(--fg)]">{m.value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardTitle>Company Profile</CardTitle>
              <p className="text-sm leading-relaxed text-muted">{stock.profile}</p>
            </Card>

            <Card className="bg-gradient-to-br from-violet-500/5 to-transparent">
              <CardTitle>Analyst Consensus</CardTitle>
              <Badge
                variant={
                  stock.analystRating.includes("Buy")
                    ? "success"
                    : stock.analystRating.includes("Sell")
                      ? "danger"
                      : "warning"
                }
                className="text-sm px-3 py-1"
              >
                {stock.analystRating}
              </Badge>
              <div className="mt-4 flex items-center gap-3 surface-subtle p-4">
                <Target className="h-5 w-5 text-violet-500 dark:text-violet-400" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-subtle">Price Target</p>
                  <p className="font-mono text-lg font-bold text-[var(--fg)]">
                    {stock.analystTarget.toLocaleString()} ₫
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-subtle">
                Upside:{" "}
                <span className="font-mono text-success">
                  {(((stock.analystTarget - stock.price) / stock.price) * 100).toFixed(1)}%
                </span>
              </p>
            </Card>
          </div>

          <Card>
            <CardTitle>Financial Statements</CardTitle>
            <FinancialChart data={financialChart} />
          </Card>
        </>
      )}

      <Card>
        <CardTitle>Technical Indicators</CardTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {technicals.map((t) => (
            <div
              key={t.indicator}
              className="surface-muted p-4"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle">
                {t.indicator}
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-[var(--fg)]">
                {typeof t.value === "number" ? t.value.toFixed(1) : t.value}
              </p>
              <Badge
                variant={
                  t.signal === "Oversold" || t.signal === "Bullish"
                    ? "success"
                    : t.signal === "Overbought" || t.signal === "Bearish"
                      ? "danger"
                      : "default"
                }
                className="mt-2"
              >
                {t.signal}
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Suggested Entry Price ── */}
      {(() => {
        const ma20Signal = technicals.find((t) => t.indicator === "MA 20");
        const ma50Signal = technicals.find((t) => t.indicator === "MA 50");
        const ma20 = ma20Signal?.value ?? 0;
        const ma50 = ma50Signal?.value ?? 0;
        const rsi = stock.rsi;
        const price = stock.price;

        // ── Calculated fair value (not analyst consensus) ──
        // Method 1: P/E — implied EPS × target P/E (VN market avg ~14–16×)
        // Sector-adjusted target P/E: growth stocks 18×, value/banking 12×
        let fairValue = 0;
        let fairValueMethod = "";
        const pe = stock.pe;
        const pb = stock.pb;
        const growthRate = Math.max(0, Math.min(stock.revenueGrowth, 30)); // cap 0-30%

        if (pe > 0 && pe < 60) {
          const impliedEps = price / pe;
          // Growth-adjusted target P/E: base 14 + 0.4× growth points (PEG-inspired)
          const targetPe = Math.min(Math.max(14 + growthRate * 0.4, 10), 25);
          const peFairValue = impliedEps * targetPe;
          // Blend with P/B if available
          if (pb > 0 && pb < 10) {
            const impliedBv = price / pb;
            const targetPb = Math.min(Math.max(pb * (1 + growthRate / 100), 1.2), 4);
            const pbFairValue = impliedBv * targetPb;
            fairValue = Math.round((peFairValue * 0.65 + pbFairValue * 0.35) / 100) * 100;
            fairValueMethod = `P/E×${targetPe.toFixed(0)} (65%) + P/B×${targetPb.toFixed(1)} (35%)`;
          } else {
            fairValue = Math.round(peFairValue / 100) * 100;
            fairValueMethod = `P/E target ${targetPe.toFixed(0)}× · EPS ~${impliedEps.toLocaleString("vi-VN", { maximumFractionDigits: 0 })}₫`;
          }
        } else if (pb > 0 && pb < 10) {
          const impliedBv = price / pb;
          const targetPb = Math.min(Math.max(pb * 1.15, 1), 4);
          fairValue = Math.round(impliedBv * targetPb / 100) * 100;
          fairValueMethod = `P/B target ${targetPb.toFixed(1)}×`;
        }

        // Cap fair value at 2× current price to avoid wild extrapolation
        if (fairValue > price * 2) fairValue = Math.round(price * 1.5 / 100) * 100;
        // Fair value shouldn't be below current price × 0.7 (excessive discount means bad data)
        if (fairValue > 0 && fairValue < price * 0.7) fairValue = Math.round(price * 1.05 / 100) * 100;

        const target = fairValue;

        let entryLow = 0;
        let entryHigh = 0;
        let stopLoss = 0;
        let entryRationale = "";
        let entryLabel = "";
        let entryColor = "text-amber-600 dark:text-amber-400";
        let entryBg = "from-amber-500/5";

        if (rsi > 70) {
          // Overbought — wait for pullback
          entryLow = ma20 * 0.98;
          entryHigh = ma20 * 1.01;
          stopLoss = ma50 > 0 ? ma50 * 0.97 : price * 0.93;
          entryLabel = "Wait — Overbought";
          entryRationale = `RSI ${rsi.toFixed(0)} is overbought (>70). Wait for pullback to MA20 (${ma20 > 0 ? ma20.toLocaleString("vi-VN") : "—"}) before entering.`;
          entryColor = "text-red-600 dark:text-red-400";
          entryBg = "from-red-500/5";
        } else if (rsi < 35) {
          // Oversold — potential value entry at current price
          entryLow = price * 0.98;
          entryHigh = price * 1.02;
          stopLoss = stock.low52w * 0.97;
          entryLabel = "Potential Entry — Oversold";
          entryRationale = `RSI ${rsi.toFixed(0)} is oversold (<35). Current price may represent a value opportunity. Monitor for reversal confirmation.`;
          entryColor = "text-emerald-600 dark:text-emerald-400";
          entryBg = "from-emerald-500/5";
        } else if (ma20 > 0 && price > ma20) {
          // Above MA20 — moderate entry zone near MA20
          entryLow = ma20 * 0.99;
          entryHigh = price * 1.005;
          stopLoss = ma50 > 0 ? ma50 * 0.97 : ma20 * 0.95;
          entryLabel = "Moderate Entry";
          entryRationale = `Price is above MA20 with neutral RSI (${rsi.toFixed(0)}). Entry near MA20 (${ma20 > 0 ? ma20.toLocaleString("vi-VN") : "—"}) offers better risk/reward. Stop below MA50.`;
          entryColor = "text-blue-600 dark:text-blue-400";
          entryBg = "from-blue-500/5";
        } else {
          // Below MA20 — caution
          entryLow = ma20 * 0.98;
          entryHigh = ma20 * 1.01;
          stopLoss = stock.low52w * 0.97;
          entryLabel = "Caution — Below MA20";
          entryRationale = `Price is below MA20 (${ma20 > 0 ? ma20.toLocaleString("vi-VN") : "—"}). Wait for reclaim of MA20 before entering. RSI: ${rsi.toFixed(0)}.`;
          entryColor = "text-amber-600 dark:text-amber-400";
          entryBg = "from-amber-500/5";
        }

        const upside = target > 0 && price > 0 ? ((target - price) / price) * 100 : null;
        const riskReward =
          stopLoss > 0 && entryHigh > 0 && target > 0
            ? ((target - entryHigh) / (entryHigh - stopLoss)).toFixed(1)
            : null;

        return (
          <Card className={`bg-gradient-to-br ${entryBg} to-transparent`}>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-4 w-4 text-accent" />
              Suggested Entry Price
            </CardTitle>
            <div className="mt-3 space-y-4">
              {/* Signal label */}
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${entryColor}`}>{entryLabel}</span>
                <span className="text-[10px] text-subtle">· RSI {rsi.toFixed(0)}</span>
              </div>

              {/* Entry zone */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="surface-muted p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle">Entry Zone</p>
                  <p className="mt-1 font-mono text-base font-bold text-[var(--fg)]">
                    {entryLow > 0 ? entryLow.toLocaleString("vi-VN", { maximumFractionDigits: 0 }) : "—"}
                    <span className="mx-1 text-muted">–</span>
                    {entryHigh > 0 ? entryHigh.toLocaleString("vi-VN", { maximumFractionDigits: 0 }) : "—"}
                    <span className="ml-0.5 text-sm text-muted">₫</span>
                  </p>
                </div>
                <div className="surface-muted p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle">Stop Loss</p>
                  <p className="mt-1 font-mono text-base font-bold text-red-600 dark:text-red-400">
                    {stopLoss > 0 ? stopLoss.toLocaleString("vi-VN", { maximumFractionDigits: 0 }) : "—"}
                    <span className="ml-0.5 text-sm text-muted">₫</span>
                  </p>
                  {stopLoss > 0 && entryHigh > 0 && (
                    <p className="mt-0.5 text-[10px] text-muted">
                      −{(((entryHigh - stopLoss) / entryHigh) * 100).toFixed(1)}% from entry
                    </p>
                  )}
                </div>
                <div className="surface-muted p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle">Fair Value / R:R</p>
                  {target > 0 ? (
                    <>
                      <p className="mt-1 font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">
                        {target.toLocaleString("vi-VN")}
                        <span className="ml-0.5 text-sm text-muted">₫</span>
                      </p>
                      {upside != null && (
                        <p className="mt-0.5 text-[10px] text-muted">
                          {upside >= 0 ? "+" : ""}{upside.toFixed(1)}% vs current
                          {riskReward && Number(riskReward) > 0 && <span className="ml-2 font-semibold text-accent">R:R {riskReward}×</span>}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-muted">Insufficient data</p>
                  )}
                </div>
              </div>

              {/* Rationale */}
              <div className="rounded-xl bg-[var(--bg-secondary)] px-4 py-3 text-xs text-muted ring-1 ring-[var(--border)]">
                <strong className="text-[var(--fg)]">Rationale:</strong> {entryRationale}
              </div>

              {/* Fair value method */}
              {fairValueMethod && (
                <div className="rounded-xl bg-emerald-500/5 px-4 py-2.5 text-xs text-muted ring-1 ring-emerald-500/15">
                  <strong className="text-emerald-600 dark:text-emerald-400">Fair value method:</strong>{" "}
                  {fairValueMethod}
                  {growthRate > 0 && ` · Revenue growth: +${growthRate.toFixed(0)}%`}
                </div>
              )}

              {/* Key levels */}
              <div className="flex flex-wrap gap-3 text-[11px] text-muted">
                {ma20 > 0 && (
                  <span>MA20 <strong className="font-mono text-[var(--fg)]">{ma20.toLocaleString("vi-VN", { maximumFractionDigits: 0 })}</strong></span>
                )}
                {ma50 > 0 && (
                  <span>MA50 <strong className="font-mono text-[var(--fg)]">{ma50.toLocaleString("vi-VN", { maximumFractionDigits: 0 })}</strong></span>
                )}
                {pe > 0 && (
                  <span>P/E <strong className="font-mono text-[var(--fg)]">{pe.toFixed(1)}×</strong></span>
                )}
                {pb > 0 && (
                  <span>P/B <strong className="font-mono text-[var(--fg)]">{pb.toFixed(2)}×</strong></span>
                )}
                <span>52W L <strong className="font-mono text-[var(--fg)]">{stock.low52w.toLocaleString("vi-VN")}</strong></span>
                <span>52W H <strong className="font-mono text-[var(--fg)]">{stock.high52w.toLocaleString("vi-VN")}</strong></span>
              </div>

              <p className="text-[10px] text-subtle">
                ⚠ Fair value estimate based on P/E and P/B methods — not analyst consensus. Indicative only, not financial advice.
              </p>
            </div>
          </Card>
        );
      })()}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Related News</CardTitle>
          <CachedNewsFeed symbol={stock.symbol} limit={10} />
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500/5 to-cyan-500/5" glow>
          <CardTitle>
            <span className="flex items-center gap-2">
              <Bot className="h-3.5 w-3.5 text-accent" />
              AI Summary
            </span>
          </CardTitle>
          <p className="text-sm leading-relaxed text-muted">{aiSummary}</p>
          <Link
            href={`/ai-analyst?symbol=${stock.symbol}`}
            className="link-accent mt-4 inline-block text-sm"
          >
            Ask AI Analyst →
          </Link>
        </Card>
      </div>
    </div>
  );
}
