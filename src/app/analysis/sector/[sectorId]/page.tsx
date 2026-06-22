import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { auth } from "@/lib/auth";
import { EmptyState } from "@/components/ui/empty-state";
import { getPortfolioWithStocks } from "@/lib/db/advisory-portfolio";
import { enrichHoldings } from "@/lib/portfolio/holdings-enrichment";
import { loadDefaultStrategyConfig } from "@/lib/strategy/strategy-config";
import { getUserStrategyConfig } from "@/lib/strategy/user-strategy";
import { getSectorById } from "@/lib/analysis/sector-universe";
import { computeSectorDetail } from "@/lib/analysis/sector-detail";
import { CACHE_TTL, pageCache } from "@/lib/page-cache";
import { SectorDetailView } from "@/components/analysis/sector-detail-view";

export const revalidate = 300;

export default async function SectorDetailPage({
  params,
}: {
  params: Promise<{ sectorId: string }>;
}) {
  const { sectorId } = await params;

  const sector = getSectorById(sectorId);
  if (!sector) notFound();

  const session = await auth();
  if (!session?.user) {
    return (
      <EmptyState
        icon={BarChart3}
        title={sector.name}
        description="Sign in to view sector analysis and your holdings."
      />
    );
  }

  const userId = session.user.id;

  const portfolio = await pageCache(
    ["portfolio", userId],
    () => getPortfolioWithStocks(userId),
    { revalidate: CACHE_TTL.portfolio, tags: [`portfolio-${userId}`] },
  );

  const symbolKey = portfolio.holdings.map((h) => h.symbol).sort().join(",");
  const enriched = portfolio.holdings.length
    ? await pageCache(
        ["portfolio-enriched", userId, symbolKey],
        () => enrichHoldings(portfolio.holdings),
        { revalidate: CACHE_TTL.portfolio, tags: [`portfolio-${userId}`] },
      )
    : [];

  const strategyConfig =
    (await getUserStrategyConfig(userId)) ?? loadDefaultStrategyConfig();

  const detail = await pageCache(
    ["sector-detail", userId, sectorId, symbolKey],
    () => computeSectorDetail(sectorId, enriched, strategyConfig.sectorTargets),
    {
      revalidate: CACHE_TTL.analysis,
      tags: [`analysis-${userId}`, `portfolio-${userId}`],
    },
  );

  if (!detail) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/analysis"
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted hover:text-[var(--fg)] hover:bg-[var(--bg-secondary)] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Analysis
        </Link>
        <span className="text-xs text-subtle">/</span>
        <span className="text-xs text-muted">Sector</span>
        <span className="text-xs text-subtle">/</span>
        <span className="text-xs font-medium text-[var(--fg)]">{sector.name}</span>
      </div>

      <SectorDetailView data={detail} />
    </div>
  );
}
