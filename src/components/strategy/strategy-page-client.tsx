"use client";

import { StrategyEditor } from "@/components/strategy/strategy-editor";
import { StrategyReviewView } from "@/components/strategy/strategy-review-view";
import type { StrategyReview } from "@/lib/strategy/strategy-review";
import type { StrategyConfig } from "@/lib/strategy/strategy-types";

export function StrategyPageClient({
  review,
  config,
  defaults,
}: {
  review: StrategyReview;
  config: StrategyConfig;
  defaults: StrategyConfig;
}) {
  return (
    <div className="space-y-4">
      <StrategyEditor config={config} defaults={defaults} />
      <StrategyReviewView review={review} />
    </div>
  );
}
