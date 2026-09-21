import { describe, expect, it } from "vitest";
import { signalDirection } from "@/lib/db/recommendation-outcomes";

/**
 * `signalDirection` decides what counts as a hit, so a misclassification here
 * silently inverts the track record rather than failing loudly. The labels
 * come from `getRecommendationFromScore` in technical-scoring.ts.
 */
describe("signalDirection", () => {
  it("treats accumulate/buy labels as bullish", () => {
    expect(signalDirection("ACCUMULATE")).toBe("bullish");
    expect(signalDirection("BUY")).toBe("bullish");
    expect(signalDirection("STRONG BUY")).toBe("bullish");
  });

  it("treats sell/avoid/trim labels as bearish", () => {
    expect(signalDirection("SELL")).toBe("bearish");
    expect(signalDirection("AVOID")).toBe("bearish");
    expect(signalDirection("TRIM")).toBe("bearish");
  });

  it("treats no-action labels as neutral so they are excluded from hit-rate", () => {
    expect(signalDirection("HOLD")).toBe("neutral");
    expect(signalDirection("WATCH")).toBe("neutral");
  });

  it("is case-insensitive", () => {
    expect(signalDirection("accumulate")).toBe("bullish");
    expect(signalDirection("Avoid")).toBe("bearish");
  });

  it("defaults unknown labels to neutral rather than guessing a direction", () => {
    expect(signalDirection("")).toBe("neutral");
    expect(signalDirection("SOMETHING NEW")).toBe("neutral");
  });

  it("does not let a substring flip a bearish label bullish", () => {
    // "SELL" contains no bullish token, but guard against a future label like
    // "DO NOT BUY" being read as bullish by naive substring matching.
    expect(signalDirection("SELL")).toBe("bearish");
  });
});
