import { Target } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StrategyPageClient } from "@/components/strategy/strategy-page-client";
import { auth } from "@/lib/auth";
import { getPortfolioWithStocks } from "@/lib/db/advisory-portfolio";
import { enrichHoldings } from "@/lib/portfolio/holdings-enrichment";
import { loadDefaultStrategyConfig } from "@/lib/strategy/strategy-config";
import { getStrategyReview } from "@/lib/strategy/strategy-review";
import { getUserStrategyConfig } from "@/lib/strategy/user-strategy";

export default async function StrategyReviewPage() {
  const session = await auth();
  if (!session?.user) {
    return (
      <EmptyState
        icon={Target}
        title="Strategy Review"
        description="Sign in to compare your portfolio against the Core–Satellite investment framework."
      />
    );
  }

  const [portfolio, config] = await Promise.all([
    getPortfolioWithStocks(session.user.id),
    getUserStrategyConfig(session.user.id),
  ]);
  const holdings = await enrichHoldings(portfolio.holdings);
  const review = getStrategyReview(holdings, config);
  const defaults = loadDefaultStrategyConfig();

  return (
    <StrategyPageClient review={review} config={config} defaults={defaults} />
  );
}
