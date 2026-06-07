import { notFound } from "next/navigation";
import Link from "next/link";
import { Bot, Target } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { FinancialChart } from "@/components/stock/financial-chart";
import { Badge } from "@/components/ui/badge";
import { ChangeBadge } from "@/components/stock/change-badge";
import { PriceChartPanel } from "@/components/stock/price-chart-panel";
import { WatchlistButton } from "@/components/stock/watchlist-button";
import { NewsFeed } from "@/components/stock/news-feed";
import { StockAvatar } from "@/components/ui/stock-avatar";
import { analyzeStock } from "@/lib/analysis/stock-analysis";
import {
  generateAiSummary,
  getNews,
  getPriceHistory,
  getStock,
  getTechnicalSignals,
} from "@/lib/stocks";
import { StockAnalysisPanel } from "@/components/stock/stock-analysis-panel";
import { auth } from "@/lib/auth";
import { isInWatchlist } from "@/lib/user-data";
import { formatMarketCap, formatVolume } from "@/lib/utils";
import { getSectorColor } from "@/lib/sector-colors";

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
  const news = getNews(symbol);
  const aiSummary = generateAiSummary(stock);
  const session = await auth();
  const inWatchlist = session?.user?.id ? await isInWatchlist(symbol) : false;
  const sectorColor = getSectorColor(stock.sector);

  const financialChart = stock.financials.years.map((year, i) => ({
    year,
    revenue: stock.financials.revenue[i],
    profit: stock.financials.netProfit[i],
  }));

  const priceRange =
    ((stock.price - stock.low52w) / (stock.high52w - stock.low52w)) * 100;

  return (
    <div className="space-y-4">
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
        <WatchlistButton
          symbol={stock.symbol}
          initialInWatchlist={inWatchlist}
          isAuthenticated={!!session?.user}
        />
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Related News</CardTitle>
          {news.length > 0 ? (
            <NewsFeed items={news} />
          ) : (
            <p className="text-sm text-muted">No recent news for this stock.</p>
          )}
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
            href="/ai-analyst"
            className="link-accent mt-4 inline-block text-sm"
          >
            Ask AI Analyst →
          </Link>
        </Card>
      </div>
    </div>
  );
}
