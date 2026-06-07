import Link from "next/link";
import { Bell, Plus, Star } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ChangeBadge } from "@/components/stock/change-badge";
import { StockAvatar } from "@/components/ui/stock-avatar";
import { RemoveWatchlistButton } from "@/components/watchlist/remove-watchlist-button";
import { DbUnavailableBanner } from "@/components/ui/db-unavailable-banner";
import { getWatchlistWithStocks } from "@/lib/user-data";
import { getAllStocks } from "@/lib/stocks";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const watchlist = await getWatchlistWithStocks();
  const allStocks = await getAllStocks();

  if (!watchlist.isAuthenticated) {
    return (
      <EmptyState
        icon={Star}
        title="Your Watchlist"
        description="Save favorite tickers and get price alerts checked during morning and afternoon market sessions."
      />
    );
  }

  const notWatched = allStocks.filter(
    (s) => !watchlist.items.some((w) => w.symbol === s.symbol),
  );

  const dbUnavailable = Boolean(
    "dbUnavailable" in watchlist
      ? (watchlist as { dbUnavailable?: boolean }).dbUnavailable
      : false,
  );

  return (
    <div className="space-y-8">
      {dbUnavailable && <DbUnavailableBanner />}
      <PageHeader
        title="Watchlist"
        description="Track your favorite Vietnamese stocks with session-based alerts"
        badge={
          <span className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-secondary)] px-3 py-1.5 text-xs font-medium text-muted ring-1 ring-[var(--border)]">
            <Star className="h-3 w-3 text-amber-400" />
            {watchlist.items.length} stocks
          </span>
        }
      />

      {watchlist.items.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {watchlist.items.map((item) =>
            item.stock ? (
              <Card
                key={item.symbol}
                className="glass-card-hover group relative overflow-hidden transition-all"
              >
                <div className="flex items-start justify-between">
                  <Link
                    href={`/stocks/${item.symbol}`}
                    className="flex items-center gap-3"
                  >
                    <StockAvatar
                      symbol={item.symbol}
                      sector={item.stock.sector}
                    />
                    <div>
                      <div className="font-bold text-[var(--fg)] group-hover:text-accent">
                        {item.symbol}
                      </div>
                      <div className="text-xs text-muted">{item.stock.name}</div>
                    </div>
                  </Link>
                  <RemoveWatchlistButton symbol={item.symbol} />
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="font-mono text-2xl font-bold text-[var(--fg)]">
                      {item.stock.price.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-subtle">₫</p>
                  </div>
                  <ChangeBadge value={item.stock.changePercent} />
                </div>
                <div className="mt-3 text-[10px] text-subtle">
                  {item.stock.sector} · {item.stock.exchange}
                </div>
              </Card>
            ) : null,
          )}
        </div>
      ) : (
        <Card>
          <div className="py-16 text-center">
            <Star className="mx-auto h-10 w-10 text-subtle" />
            <p className="mt-4 text-sm text-muted">Your watchlist is empty</p>
            <p className="mt-1 text-xs text-subtle">
              Browse stocks below or add from any stock detail page
            </p>
          </div>
        </Card>
      )}

      <Card>
        <CardTitle>
          <span className="flex items-center gap-2">
            <Bell className="h-3.5 w-3.5" />
            Alert Types
          </span>
        </CardTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { type: "Price Target", desc: "Notify when price hits your target", color: "emerald" },
            { type: "RSI Oversold", desc: "Alert when RSI drops below 30", color: "cyan" },
            { type: "Volume Spike", desc: "Volume exceeds 2× 20-day average", color: "violet" },
          ].map((alert) => (
            <div
              key={alert.type}
              className="surface-muted p-4"
            >
              <div className="text-sm font-semibold text-[var(--fg)]">{alert.type}</div>
              <div className="mt-1 text-xs text-muted">{alert.desc}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[10px] text-subtle">
          Alerts evaluated at morning (9:00) and afternoon (14:45) sessions
        </p>
      </Card>

      {notWatched.length > 0 && (
        <Card>
          <CardTitle>
            <span className="flex items-center gap-2">
              <Plus className="h-3.5 w-3.5" />
              Discover Stocks
            </span>
          </CardTitle>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {notWatched.slice(0, 9).map((s) => (
              <Link
                key={s.symbol}
                href={`/stocks/${s.symbol}`}
                className="interactive-row flex items-center gap-3 px-3 py-2.5 ring-1 ring-[var(--border)] hover:ring-[var(--accent)]/25"
              >
                <StockAvatar symbol={s.symbol} sector={s.sector} size="sm" />
                <div className="flex-1">
                  <div className="font-semibold text-[var(--fg)]">{s.symbol}</div>
                  <div className="text-[10px] text-subtle">{s.sector}</div>
                </div>
                <ChangeBadge value={s.changePercent} />
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
