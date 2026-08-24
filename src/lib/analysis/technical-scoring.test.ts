import { describe, expect, it } from "vitest";
import {
  TECHNICAL_TIMING_THRESHOLD,
  calculateTechnicalScore,
  combinedScore,
  getRecommendationFromScore,
  scoreRating,
  type TechnicalIndicators,
} from "./technical-scoring";

describe("calculateTechnicalScore", () => {
  it("returns the neutral baseline (50) when no indicators are provided", () => {
    expect(calculateTechnicalScore(null, 100)).toBe(50);
  });

  it("scores higher when price is in a strong uptrend above rising MAs", () => {
    const tech: TechnicalIndicators = { sma20: 100, sma50: 90 };
    const score = calculateTechnicalScore(tech, 105);
    expect(score).toBeGreaterThan(50);
  });

  it("scores lower when price is in a downtrend below falling MAs", () => {
    const tech: TechnicalIndicators = { sma20: 100, sma50: 110 };
    const score = calculateTechnicalScore(tech, 95);
    expect(score).toBeLessThan(50);
  });

  it("clamps the result to [0, 100]", () => {
    const tech: TechnicalIndicators = {
      sma20: 100,
      sma50: 110,
      supportLevel: 100,
      resistanceLevel: 120,
      rsi: 80,
      macd: -1,
      macdSignal: 1,
      volume: 100,
      volumeMa: 1000,
    };
    const score = calculateTechnicalScore(tech, 90);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("rewards a volume spike (ratio >= 1.5x)", () => {
    const base: TechnicalIndicators = {};
    const withSpike: TechnicalIndicators = { volume: 200, volumeMa: 100 };
    expect(calculateTechnicalScore(withSpike, 100)).toBeGreaterThan(
      calculateTechnicalScore(base, 100),
    );
  });
});

describe("combinedScore", () => {
  it("defaults to a 60/40 technical/fundamental blend", () => {
    expect(combinedScore(80, 60)).toBe(Math.round(80 * 0.6 + 60 * 0.4));
  });

  it("normalizes weights that do not sum to 1", () => {
    // 2:2 ratio should behave like an equal 50/50 split
    expect(combinedScore(100, 0, 2, 2)).toBe(50);
  });

  it("falls back to the 60/40 default when weights sum to zero", () => {
    expect(combinedScore(100, 0, 0, 0)).toBe(60);
  });
});

describe("scoreRating", () => {
  it("labels bands correctly", () => {
    expect(scoreRating(80)).toBe("Excellent");
    expect(scoreRating(65)).toBe("Good");
    expect(scoreRating(50)).toBe("Fair");
    expect(scoreRating(20)).toBe("Poor");
  });
});

describe("getRecommendationFromScore", () => {
  it("recommends ACCUMULATE for a strong score near support with good risk/reward", () => {
    const tech: TechnicalIndicators = { supportLevel: 95, resistanceLevel: 120, sma50: 90, rsi: 50 };
    const rec = getRecommendationFromScore(70, 60, 65, tech, 96);
    expect(rec).toBe("ACCUMULATE");
  });

  it("recommends SELL when support is broken", () => {
    const tech: TechnicalIndicators = { supportLevel: 100 };
    const rec = getRecommendationFromScore(30, 30, 30, tech, 90);
    expect(rec).toBe("SELL");
  });

  it("recommends AVOID when combined score is weak", () => {
    const tech: TechnicalIndicators = {};
    const rec = getRecommendationFromScore(45, 40, 50, tech, 100);
    expect(rec).toBe("AVOID");
  });

  it("recommends AVOID when technical score is below the timing threshold", () => {
    const tech: TechnicalIndicators = {};
    const rec = getRecommendationFromScore(55, TECHNICAL_TIMING_THRESHOLD - 1, 60, tech, 100);
    expect(rec).toBe("AVOID");
  });
});
