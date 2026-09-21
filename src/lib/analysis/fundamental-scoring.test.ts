import { describe, expect, it } from "vitest";
import {
  calculateFundamentalBreakdown,
  calculateFundamentalScore,
  countFundamentalInputs,
  TOTAL_FUNDAMENTAL_INPUTS,
} from "./fundamental-scoring";

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

describe("enrichment fields", () => {
  it("uses roic for quality only when roe is absent", () => {
    const withRoic = calculateFundamentalBreakdown({ roic: 22 });
    expect(withRoic.qualityScore).toBeGreaterThan(0);

    // A present ROE wins — adding ROIC alongside it must not shift the score.
    const roeOnly = calculateFundamentalBreakdown({ roe: 18 });
    const roeAndRoic = calculateFundamentalBreakdown({ roe: 18, roic: 5 });
    expect(roeAndRoic.qualityScore).toBe(roeOnly.qualityScore);
  });

  it("uses currentRatio for stability only when debtToEquity is absent", () => {
    // Unknown leverage previously scored a flat 5 regardless of liquidity.
    expect(calculateFundamentalBreakdown({}).stabilityScore).toBe(5);
    expect(calculateFundamentalBreakdown({ currentRatio: 2.5 }).stabilityScore).toBe(8);
    expect(calculateFundamentalBreakdown({ currentRatio: 0.8 }).stabilityScore).toBe(1);

    // Liquidity never outranks a known capital structure.
    const deOnly = calculateFundamentalBreakdown({ debtToEquity: 0.3 });
    const deAndCr = calculateFundamentalBreakdown({ debtToEquity: 0.3, currentRatio: 0.8 });
    expect(deAndCr.stabilityScore).toBe(deOnly.stabilityScore);
  });

  it("prefers the 3-year EPS series over the YoY proxy", () => {
    // Deliberately opposite signals: a strong single year against weak 3y.
    const yoyOnly = calculateFundamentalBreakdown({ epsGrowth: 20 });
    const prefers3y = calculateFundamentalBreakdown({ epsGrowth: 20, epsGrowth3y: 2 });
    expect(prefers3y.growthScore).toBeLessThan(yoyOnly.growthScore);
  });

  it("still uses the YoY proxy when no 3-year value is stored", () => {
    const a = calculateFundamentalBreakdown({ epsGrowth: 20 });
    const b = calculateFundamentalBreakdown({ epsGrowth: 20, epsGrowth3y: null });
    expect(b.growthScore).toBe(a.growthScore);
  });
});

describe("countFundamentalInputs", () => {
  it("counts zero for empty inputs", () => {
    expect(countFundamentalInputs({})).toBe(0);
  });

  it("ignores null and undefined but counts a real zero", () => {
    // A genuine 0% ROE is data; null is absence. Conflating them is the bug
    // this whole coverage concept exists to prevent.
    expect(countFundamentalInputs({ roe: 0, roa: null, peRatio: undefined })).toBe(1);
  });

  it("counts every input when all are present", () => {
    const full = {
      roe: 18, roa: 9, peRatio: 12, pbRatio: 1.8, revenueGrowth: 14,
      profitGrowth: 11, epsGrowth: 10, debtToEquity: 0.5,
      netProfitMargin: 15, grossProfitMargin: 30,
    };
    expect(countFundamentalInputs(full)).toBe(TOTAL_FUNDAMENTAL_INPUTS);
  });

  it("reflects the no-snapshot fallback, which supplies only four inputs", () => {
    // stock-analysis.ts's stockToFundamentals passes roe/pe/pb/revenueGrowth
    // and hardcodes the other six to null — the reason a snapshot-less stock
    // is structurally capped around 52 and must be flagged, not ranked.
    const fallback = { roe: 18, peRatio: 12, pbRatio: 1.8, revenueGrowth: 14 };
    expect(countFundamentalInputs(fallback)).toBe(4);

    const capped = calculateFundamentalBreakdown(fallback).finalScore;
    expect(capped).toBeLessThan(60);
  });
});
