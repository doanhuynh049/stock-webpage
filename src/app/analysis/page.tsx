import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { AnalysisView } from "@/components/analysis/analysis-view";
import { analyzeUniverseBundle } from "@/lib/analysis/combined-analysis";
import { computeSectorAnalysis } from "@/lib/analysis/sector-analysis";
import { getVN100Universe, getVN30Universe } from "@/lib/analysis/index-universe";
import { auth } from "@/lib/auth";
import { getPortfolioWithStocks } from "@/lib/db/advisory-portfolio";
import { enrichHoldings } from "@/lib/portfolio/holdings-enrichment";
import { loadDefaultStrategyConfig } from "@/lib/strategy/strategy-config";
import { getUserStrategyConfig } from "@/lib/strategy/user-strategy";
import { CACHE_TTL, pageCache } from "@/lib/page-cache";

export const revalidate = 300;

function portfolioSymbolKey(
  holdings: Array<{ symbol: string }>,
): string {
  if (!holdings.length) return "empty";
  return holdings
    .map((h) => h.symbol.toUpperCase())
    .sort()
    .join(",");
}

export default async function AnalysisPage() {
  const session = await auth();
  if (!session?.user) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Analysis"
        description="Sign in to view fundamental + technical analysis for Portfolio, VN30, and VN100."
      />
    );
  }

  const userId = session.user.id;

  // Same cache key as /portfolio so holdings stay in sync
  const portfolio = await pageCache(
    ["portfolio", userId],
    () => getPortfolioWithStocks(userId),
    { revalidate: CACHE_TTL.portfolio, tags: [`portfolio-${userId}`] },
  );

  const symbolKey = portfolioSymbolKey(portfolio.holdings);
  const portfolioMeta = portfolio.holdings.map((h) => ({
    symbol: h.symbol,
    name: h.name,
    sector: h.sector,
  }));

  const enriched = portfolio.holdings.length
    ? await pageCache(
        ["portfolio-enriched", userId, symbolKey],
        () => enrichHoldings(portfolio.holdings),
        { revalidate: CACHE_TTL.portfolio, tags: [`portfolio-${userId}`] },
      )
    : [];

  const strategyConfig =
    (await getUserStrategyConfig(userId)) ?? loadDefaultStrategyConfig();

  const vn30 = getVN30Universe();
  const vn100 = getVN100Universe();
  const ownedSymbols = portfolio.holdings.map((h) => h.symbol);

  const [portfolioBundle, vn30Bundle, vn100Bundle, sectorAnalysis] =
    await Promise.all([
      portfolioMeta.length
        ? pageCache(
            ["analysis-bundle-portfolio", userId, symbolKey],
            () =>
              analyzeUniverseBundle(
                portfolioMeta.map((h) => ({
                  symbol: h.symbol,
                  name: h.name ?? h.symbol,
                  sector: h.sector ?? "Unknown",
                })),
              ),
            {
              revalidate: CACHE_TTL.analysis,
              tags: [`analysis-${userId}`, `portfolio-${userId}`],
            },
          )
        : Promise.resolve({ fundamental: [], technical: [], combined: [] }),
      pageCache(
        ["analysis-bundle-vn30"],
        () => analyzeUniverseBundle(vn30),
        { revalidate: CACHE_TTL.analysis, tags: ["analysis-vn30"] },
      ),
      pageCache(
        ["analysis-bundle-vn100"],
        () => analyzeUniverseBundle(vn100, 30),
        { revalidate: CACHE_TTL.analysis, tags: ["analysis-vn100"] },
      ),
      pageCache(
        ["analysis-sector", userId, symbolKey],
        () =>
          computeSectorAnalysis(
            enriched,
            strategyConfig.sectorTargets,
            ownedSymbols,
          ),
        {
          revalidate: CACHE_TTL.analysis,
          tags: [`analysis-${userId}`, `portfolio-${userId}`],
        },
      ),
    ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Analysis"
        description="Portfolio · Sector · VN30 · VN100 — fundamental, technical, and combined panels"
        badge={
          <span className="rounded-md bg-[var(--bg-secondary)] px-2.5 py-1 text-xs ring-1 ring-[var(--border)]">
            {portfolioBundle.fundamental.length} holdings · VN30{" "}
            {vn30Bundle.fundamental.length} · VN100 top{" "}
            {vn100Bundle.fundamental.length}
          </span>
        }
      />

      {portfolio.holdings.length > 0 && portfolioBundle.fundamental.length === 0 && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          Portfolio analysis is loading or temporarily empty — refresh the page. Holdings:{" "}
          {portfolio.holdings.length} symbols.
        </p>
      )}

      <AnalysisView
        portfolio={portfolioBundle}
        vn30={vn30Bundle}
        vn100={vn100Bundle}
        sectorAnalysis={sectorAnalysis}
        ownedSymbols={ownedSymbols}
      />
    </div>
  );
}
