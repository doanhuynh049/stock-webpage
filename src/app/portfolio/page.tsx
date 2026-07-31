import { Layers, PieChart, Wallet } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { HoldingsLedger } from "@/components/portfolio/holdings-ledger";
import { PortfolioCharts } from "@/components/portfolio/portfolio-charts";
import { auth } from "@/lib/auth";
import { getPortfolioWithStocks } from "@/lib/db/advisory-portfolio";
import { enrichHoldings } from "@/lib/portfolio/holdings-enrichment";
import { CACHE_TTL, pageCache } from "@/lib/page-cache";
import { formatPortfolioAmount } from "@/lib/utils";

export const revalidate = 90;

export default async function PortfolioPage() {
  const session = await auth();
  if (!session?.user) {
    return (
      <EmptyState
        icon={Wallet}
        title="Portfolio"
        description="Sign in to view your holdings synced from Neon (portfolio_holding)."
      />
    );
  }

  const userId = session.user.id;
  const portfolio = await pageCache(
    ["portfolio", userId],
    () => getPortfolioWithStocks(userId),
    { revalidate: CACHE_TTL.portfolio, tags: [`portfolio-${userId}`] },
  );
  const { summary } = portfolio;
  const holdings = await pageCache(
    ["portfolio-enriched", userId, String(portfolio.holdings.length)],
    () => enrichHoldings(portfolio.holdings),
    { revalidate: CACHE_TTL.portfolio, tags: [`portfolio-${userId}`] },
  );
  const sectorCount = Object.keys(summary.sectorAllocation).length;

  const hasLiveValue = holdings.some((h) => h.currentValueK != null);
  const totalMarketValue = holdings.reduce(
    (s, h) => s + (h.currentValueK ?? h.costBasis),
    0,
  );

  const sectorMap = new Map<string, number>();
  for (const h of holdings) {
    const sector = h.sector ?? "Unknown";
    const val = h.currentValueK ?? h.costBasis;
    sectorMap.set(sector, (sectorMap.get(sector) ?? 0) + val);
  }
  const allocationData = [...sectorMap.entries()]
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-4">
      {portfolio.fromCache && portfolio.cacheSyncedAt && (
        <p className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-800 dark:text-cyan-100/90">
          Cached snapshot ({new Date(portfolio.cacheSyncedAt).toLocaleString()})
        </p>
      )}

      <PageHeader
        title="Portfolio"
        description="Holdings ledger — edit inline, auto-saves to Neon. Or add trades on Trading page."
        badge={
          <span className="rounded-md bg-[var(--bg-secondary)] px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-[var(--border)]">
            {summary.positionCount} positions
          </span>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Cost Basis"
          value={formatPortfolioAmount(summary.totalCostBasis, 0)}
          subValue="Total cost basis"
          icon={Wallet}
          accent="accent"
        />
        <StatCard
          label="Positions"
          value={String(summary.positionCount)}
          subValue="Active holdings"
          icon={PieChart}
          accent="violet"
        />
        <StatCard
          label="Sectors"
          value={String(sectorCount)}
          subValue="Sector diversification"
          icon={Layers}
          accent="neutral"
        />
      </div>

      {holdings.length > 0 && (
        <PortfolioCharts
          allocationData={allocationData}
          totalValue={hasLiveValue ? totalMarketValue : summary.totalCostBasis}
          valueLabel={hasLiveValue ? "Market value" : "Cost basis"}
          useMarketValue={hasLiveValue}
        />
      )}

      <Card className="!p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <CardTitle className="!text-base">Holdings ledger</CardTitle>
          {holdings.length > 0 && (
            <span className="font-mono text-xs text-subtle">
              {formatPortfolioAmount(summary.totalCostBasis, 0)} total
            </span>
          )}
        </div>

        <HoldingsLedger
          userId={session.user.id}
          initialHoldings={holdings}
          totalCostBasis={summary.totalCostBasis}
        />
      </Card>
    </div>
  );
}
