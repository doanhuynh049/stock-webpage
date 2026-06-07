import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Globe,
  TrendingUp,
  Users,
} from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { MoverList } from "@/components/stock/mover-list";
import { NewsFeed } from "@/components/stock/news-feed";
import { SectorHeatmap } from "@/components/stock/sector-heatmap";
import { StockTable } from "@/components/stock/stock-table";
import { ChangeBadge } from "@/components/stock/change-badge";
import { StockAvatar } from "@/components/ui/stock-avatar";
import { InvestmentPicks } from "@/components/stock/investment-picks";
import {
  getAllStocks,
  getMarketSnapshot,
  getNews,
  getTopMovers,
} from "@/lib/stocks";
import { getStockPicks } from "@/lib/stock-picks";
import { getWatchlistWithStocks } from "@/lib/user-data";
import { formatVolume } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const market = await getMarketSnapshot();
  const [{ gainers, losers }, stocks, watchlist, picks] = await Promise.all([
    getTopMovers(5),
    getAllStocks(),
    getWatchlistWithStocks(),
    getStockPicks(5),
  ]);
  const news = getNews().slice(0, 5);
  const vnindex = market.indices.find((i) => i.symbol === "VNINDEX")!;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Market Dashboard"
        description={`Vietnam stock market — ${market.session} session, updated ${formatDistanceToNow(new Date(market.lastUpdated), { addSuffix: true })}`}
        badge={
          <Badge
            variant={
              market.sentiment === "Bullish"
                ? "success"
                : market.sentiment === "Bearish"
                  ? "danger"
                  : "warning"
            }
            className="px-3 py-1 text-xs"
          >
            {market.sentiment} · {market.sentimentScore}%
          </Badge>
        }
      />

      <Card glow className="relative overflow-hidden !p-0">
        <div className="hero-gradient p-6 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-subtle">
                VN-Index
              </p>
              <p className="mt-2 font-mono text-5xl font-bold tracking-tight text-[var(--fg)] sm:text-6xl">
                {vnindex.value.toLocaleString()}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <ChangeBadge value={vnindex.changePercent} className="text-base" />
                <span className="text-sm text-muted">
                  {vnindex.change >= 0 ? "+" : ""}
                  {vnindex.change.toFixed(1)} pts today
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:gap-6">
              {market.indices.slice(1).map((idx) => (
                <div key={idx.symbol} className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle">
                    {idx.symbol}
                  </p>
                  <p className="font-mono text-lg font-bold text-[var(--fg)]">
                    {idx.value.toLocaleString()}
                  </p>
                  <ChangeBadge value={idx.changePercent} className="mt-1 text-xs" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Volume"
          value={formatVolume(market.stats.totalVolume)}
          subValue="shares matched"
          icon={BarChart3}
          accent="emerald"
        />
        <StatCard
          label="Matched Value"
          value={`${market.stats.totalValue.toLocaleString()} tỷ`}
          subValue="VND billion"
          icon={Activity}
          accent="cyan"
        />
        <StatCard
          label="Foreign Net Buy"
          value={`${market.stats.foreignNetBuy.toLocaleString()} tỷ`}
          icon={Globe}
          accent="violet"
        />
        <StatCard
          label="Adv / Dec"
          value={`${market.stats.advancing} / ${market.stats.declining}`}
          subValue={`${market.stats.unchanged} unchanged`}
          icon={Users}
          accent="amber"
        />
      </div>

      <InvestmentPicks
        picks={picks.picks}
        marketSentiment={picks.marketSentiment}
        criteria={picks.criteria}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Top Gainers</CardTitle>
          <MoverList stocks={gainers} type="gainers" />
        </Card>
        <Card>
          <CardTitle>Top Losers</CardTitle>
          <MoverList stocks={losers} type="losers" />
        </Card>
      </div>

      <Card>
        <CardTitle>Sector Performance</CardTitle>
        <SectorHeatmap sectors={market.sectors} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardTitle>Market News</CardTitle>
          <NewsFeed items={news} />
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle
            action={
              watchlist.isAuthenticated && watchlist.items.length > 0 ? (
                <Link href="/watchlist" className="link-accent text-[10px]">
                  View all
                </Link>
              ) : undefined
            }
          >
            Watchlist
          </CardTitle>
          {watchlist.isAuthenticated && watchlist.items.length > 0 ? (
            <div className="space-y-2">
              {watchlist.items.slice(0, 5).map((item) =>
                item.stock ? (
                  <Link
                    key={item.symbol}
                    href={`/stocks/${item.symbol}`}
                    className="interactive-row flex items-center gap-3 px-3 py-2.5"
                  >
                    <StockAvatar symbol={item.symbol} sector={item.stock.sector} size="sm" />
                    <div className="flex-1">
                      <div className="font-semibold text-[var(--fg)]">{item.symbol}</div>
                      <div className="font-mono text-xs text-muted">
                        {item.stock.price.toLocaleString()} ₫
                      </div>
                    </div>
                    <ChangeBadge value={item.stock.changePercent} />
                  </Link>
                ) : null,
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center">
              <TrendingUp className="mx-auto h-8 w-8 text-subtle" />
              <p className="mt-3 text-sm text-muted">
                {"dbUnavailable" in watchlist && watchlist.dbUnavailable
                  ? "Database temporarily unreachable. Refresh in a moment."
                  : watchlist.isAuthenticated
                    ? "Add stocks to track price moves"
                    : "Sign in to build your watchlist"}
              </p>
              {!watchlist.isAuthenticated && (
                <Link href="/login" className="link-accent mt-3 inline-block text-sm">
                  Sign in →
                </Link>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardTitle
          action={
            <Link
              href="/screener"
              className="link-accent flex items-center gap-1 text-[10px] font-medium"
            >
              Screener <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          Market Movers
        </CardTitle>
        <StockTable stocks={stocks.slice(0, 10)} />
      </Card>
    </div>
  );
}
