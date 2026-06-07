import { Layers, PieChart, Wallet } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { HoldingsLedger } from "@/components/portfolio/holdings-ledger";
import { PortfolioCharts } from "@/components/portfolio/portfolio-charts";
import { DbUnavailableBanner } from "@/components/ui/db-unavailable-banner";
import { auth } from "@/lib/auth";
import { getPortfolioWithStocks } from "@/lib/db/advisory-portfolio";
import { enrichHoldings } from "@/lib/portfolio/holdings-enrichment";
import { formatPortfolioAmount } from "@/lib/utils";

export const dynamic = "force-dynamic";

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

  const portfolio = await getPortfolioWithStocks(session.user.id);
  const { summary } = portfolio;
  const holdings = await enrichHoldings(portfolio.holdings);
  const dbUnavailable = portfolio.dbUnavailable && !portfolio.fromCache;
  const sectorCount = Object.keys(summary.sectorAllocation).length;

  const allocationData = Object.entries(summary.sectorAllocation)
    .map(([sector, value]) => ({ name: sector, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-4">
      {dbUnavailable && <DbUnavailableBanner />}
      {portfolio.fromCache && portfolio.cacheSyncedAt && (
        <p className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-100/90">
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
          accent="emerald"
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
          accent="cyan"
        />
      </div>

      {holdings.length > 0 && (
        <PortfolioCharts
          allocationData={allocationData}
          totalValue={summary.totalCostBasis}
          valueLabel="Cost basis"
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

        {holdings.length > 0 || !dbUnavailable ? (
          <HoldingsLedger
            userId={session.user.id}
            initialHoldings={holdings}
            totalCostBasis={summary.totalCostBasis}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-[var(--border)] py-10 text-center">
            <Wallet className="mx-auto h-7 w-7 text-subtle" />
            <p className="mt-2 text-sm text-muted">Cannot load portfolio from Neon</p>
          </div>
        )}
      </Card>
    </div>
  );
}
