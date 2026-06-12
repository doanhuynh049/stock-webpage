import { Bell, Star } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { WatchlistSection } from "@/components/watchlist/watchlist-section";
import { getVN30Universe } from "@/lib/analysis/index-universe";
import { getWatchlistWithStocks } from "@/lib/user-data";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const watchlist = await getWatchlistWithStocks();
  const vn30 = getVN30Universe();

  if (!watchlist.isAuthenticated) {
    return (
      <EmptyState
        icon={Star}
        title="Your Watchlist"
        description="Save favorite tickers and get price alerts checked during morning and afternoon market sessions."
      />
    );
  }

  const watched = new Set(watchlist.items.map((w) => w.symbol.toUpperCase()));
  const notWatched = vn30.filter((s) => !watched.has(s.symbol.toUpperCase()));
  const suggestions = notWatched.map((s) => ({
    symbol: s.symbol,
    name: s.name ?? s.symbol,
    sector: s.sector ?? "",
  }));

  return (
    <div className="space-y-8">
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

      <WatchlistSection initialItems={watchlist.items} suggestions={suggestions} />

      <Card>
        <CardTitle>
          <span className="flex items-center gap-2">
            <Bell className="h-3.5 w-3.5" />
            Alert Types
          </span>
        </CardTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { type: "Price Target", desc: "Notify when price hits your target" },
            { type: "RSI Oversold", desc: "Alert when RSI drops below 30" },
            { type: "Volume Spike", desc: "Volume exceeds 2× 20-day average" },
          ].map((alert) => (
            <div key={alert.type} className="surface-muted p-4">
              <div className="text-sm font-semibold text-[var(--fg)]">{alert.type}</div>
              <div className="mt-1 text-xs text-muted">{alert.desc}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[10px] text-subtle">
          Alerts evaluated at morning (9:00) and afternoon (14:45) sessions
        </p>
      </Card>

    </div>
  );
}
