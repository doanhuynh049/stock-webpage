import { BarChart3 } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { AnalysisView } from "@/components/analysis/analysis-view";
import { analyzeUniverseBundle } from "@/lib/analysis/combined-analysis";
import { getVN100Universe, getVN30Universe } from "@/lib/analysis/index-universe";
import { auth } from "@/lib/auth";
import { getDbRecommendations } from "@/lib/db/recommendations";
import { getPortfolioWithStocks } from "@/lib/db/advisory-portfolio";
import { CACHE_TTL, pageCache } from "@/lib/page-cache";

export const revalidate = 300;

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
  const portfolio = await pageCache(
    ["analysis-portfolio", userId],
    () => getPortfolioWithStocks(userId),
    { revalidate: CACHE_TTL.analysis, tags: [`portfolio-${userId}`] },
  );
  const vn30 = getVN30Universe();
  const vn100 = getVN100Universe();

  const portfolioMeta = portfolio.holdings.map((h) => ({
    symbol: h.symbol,
    name: h.name,
    sector: h.sector,
  }));

  const [portfolioBundle, vn30Bundle, vn100Bundle, picks] = await Promise.all([
    pageCache(
      ["analysis-bundle-portfolio", userId, String(portfolioMeta.length)],
      () =>
        analyzeUniverseBundle(
          portfolioMeta.map((h) => ({
            symbol: h.symbol,
            name: h.name ?? h.symbol,
            sector: h.sector ?? "Unknown",
          })),
        ),
      { revalidate: CACHE_TTL.analysis, tags: [`analysis-${userId}`] },
    ),
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
      ["analysis-picks"],
      () => getDbRecommendations(15),
      { revalidate: CACHE_TTL.analysis, tags: ["analysis-picks"] },
    ),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Analysis"
        description="Portfolio · VN30 · VN100 — each with Fundamental, Technical, and Combined sub-panels"
        badge={
          <span className="rounded-md bg-[var(--bg-secondary)] px-2.5 py-1 text-xs ring-1 ring-[var(--border)]">
            {portfolioBundle.fundamental.length} holdings · VN30 {vn30Bundle.fundamental.length} · VN100 top {vn100Bundle.fundamental.length}
          </span>
        }
      />

      <AnalysisView
        portfolio={portfolioBundle}
        vn30={vn30Bundle}
        vn100={vn100Bundle}
        ownedSymbols={portfolio.holdings.map((h) => h.symbol)}
      />

      {picks && picks.length > 0 && (
        <Card className="!p-4">
          <CardTitle className="!text-base">Market picks (Neon)</CardTitle>
          <ul className="mt-2 space-y-1 text-sm">
            {picks.map((p, i) => (
              <li key={`${p.stock.symbol}-${i}`} className="text-muted">
                <span className="font-semibold text-accent">{p.stock.symbol}</span>
                <span className="ml-2 font-mono">{p.score}</span>
                <span className="ml-2 text-xs">{p.reasons[0]}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
