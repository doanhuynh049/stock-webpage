import { Target } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StrategyReviewView } from "@/components/strategy/strategy-review-view";
import { auth } from "@/lib/auth";
import { getPortfolioWithStocks } from "@/lib/db/advisory-portfolio";
import { enrichHoldings } from "@/lib/portfolio/holdings-enrichment";
import { getStrategyReview } from "@/lib/strategy/strategy-review";

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

  const portfolio = await getPortfolioWithStocks(session.user.id);
  const holdings = await enrichHoldings(portfolio.holdings);
  const review = getStrategyReview(holdings);

  return <StrategyReviewView review={review} />;
}
