import { describe, expect, it } from "vitest";
import { calculateFundamentalBreakdown, calculateFundamentalScore } from "./fundamental-scoring";

describe("calculateFundamentalBreakdown", () => {
  it("returns all-zero breakdown for empty inputs", () => {
    const b = calculateFundamentalBreakdown({});
    expect(b.qualityScore).toBe(0);
    expect(b.growthScore).toBe(0);
    // valuationScore has a base of 10 even with no PE/PB data
    expect(b.valuationScore).toBe(10);
    expect(b.stabilityScore).toBe(5);
    expect(b.penalties).toBe(0);
    expect(b.finalScore).toBe(15);
  });

  it("rewards high ROE/ROA/margins with a high quality score", () => {
    const b = calculateFundamentalBreakdown({ roe: 25, roa: 12, netProfitMargin: 25 });
    expect(b.qualityScore).toBe(40); // capped at max
  });

  it("rewards strong growth metrics", () => {
    const b = calculateFundamentalBreakdown({ revenueGrowth: 25, profitGrowth: 20, epsGrowth: 20 });
    expect(b.growthScore).toBe(30); // capped at max
  });

  it("penalizes cheap valuation less than expensive valuation", () => {
    const cheap = calculateFundamentalBreakdown({ peRatio: 8, pbRatio: 1 });
    const expensive = calculateFundamentalBreakdown({ peRatio: 50, pbRatio: 6 });
    expect(cheap.valuationScore).toBeGreaterThan(expensive.valuationScore);
  });

  it("applies penalties for profit decline, high leverage, and expensive PE", () => {
    const b = calculateFundamentalBreakdown({
      profitGrowth: -20,
      debtToEquity: 2,
      peRatio: 50,
    });
    expect(b.penalties).toBe(15 + 10 + 8);
  });

  it("clamps the final score to [0, 100]", () => {
    const worst = calculateFundamentalBreakdown({
      profitGrowth: -50,
      debtToEquity: 3,
      peRatio: 60,
    });
    expect(worst.finalScore).toBeGreaterThanOrEqual(0);

    const best = calculateFundamentalBreakdown({
      roe: 30,
      roa: 15,
      netProfitMargin: 30,
      revenueGrowth: 30,
      profitGrowth: 30,
      epsGrowth: 30,
      peRatio: 8,
      pbRatio: 1,
      debtToEquity: 0.1,
    });
    expect(best.finalScore).toBeLessThanOrEqual(100);
  });
});

describe("calculateFundamentalScore", () => {
  it("matches the finalScore from the full breakdown", () => {
    const inputs = { roe: 18, peRatio: 15, debtToEquity: 0.6 };
    expect(calculateFundamentalScore(inputs)).toBe(
      calculateFundamentalBreakdown(inputs).finalScore,
    );
  });
});
