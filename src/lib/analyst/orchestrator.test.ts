import { describe, expect, it } from "vitest";
import { WEIGHTS, clamp, confidenceFrom, verdictFromScore } from "./orchestrator";
import type { AgentId, AgentReport } from "./types";

function makeAgent(id: AgentId, score: number): AgentReport {
  return {
    id,
    title: id,
    score,
    stance: "Neutral",
    headline: "",
    bullets: [],
    metrics: [],
    source: "rule",
  };
}

describe("orchestrator WEIGHTS", () => {
  it("sums to 1 (decision engine blend must not over/under-weight)", () => {
    const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("has a weight for every AgentId", () => {
    const ids: AgentId[] = ["financial", "valuation", "technical", "risk", "macro", "news"];
    for (const id of ids) {
      expect(WEIGHTS[id]).toBeGreaterThan(0);
    }
  });
});

describe("clamp", () => {
  it("clamps below range", () => {
    expect(clamp(-5, 0, 100)).toBe(0);
  });
  it("clamps above range", () => {
    expect(clamp(150, 0, 100)).toBe(100);
  });
  it("passes through values within range", () => {
    expect(clamp(42, 0, 100)).toBe(42);
  });
});

describe("verdictFromScore", () => {
  it("returns STRONG BUY at the top of the range", () => {
    expect(verdictFromScore(90, 0)).toBe("STRONG BUY");
    expect(verdictFromScore(78, 0)).toBe("STRONG BUY");
  });
  it("returns BUY just under STRONG BUY", () => {
    expect(verdictFromScore(70, 0)).toBe("BUY");
    expect(verdictFromScore(66, 0)).toBe("BUY");
  });
  it("returns ACCUMULATE in the mid-upper band", () => {
    expect(verdictFromScore(60, 0)).toBe("ACCUMULATE");
    expect(verdictFromScore(56, 0)).toBe("ACCUMULATE");
  });
  it("returns HOLD in the middle band", () => {
    expect(verdictFromScore(50, 0)).toBe("HOLD");
    expect(verdictFromScore(45, 0)).toBe("HOLD");
  });
  it("returns AVOID below 45 when materially overvalued", () => {
    expect(verdictFromScore(40, -15)).toBe("AVOID");
  });
  it("returns TRIM below 45 but not materially overvalued, and score >= 38", () => {
    expect(verdictFromScore(40, -5)).toBe("TRIM");
    expect(verdictFromScore(40, null)).toBe("TRIM");
  });
  it("returns AVOID when score drops under 38 regardless of valuation", () => {
    expect(verdictFromScore(30, null)).toBe("AVOID");
  });
});

describe("confidenceFrom", () => {
  it("returns HIGH when agents agree and fundamentals exist", () => {
    const agents = [makeAgent("financial", 70), makeAgent("valuation", 72), makeAgent("technical", 68)];
    expect(confidenceFrom(agents, true)).toBe("HIGH");
  });
  it("does not return HIGH without fundamentals even if agents agree", () => {
    const agents = [makeAgent("financial", 70), makeAgent("valuation", 72), makeAgent("technical", 68)];
    expect(confidenceFrom(agents, false)).not.toBe("HIGH");
  });
  it("returns LOW when agents disagree strongly", () => {
    const agents = [makeAgent("financial", 90), makeAgent("valuation", 10), makeAgent("technical", 50)];
    expect(confidenceFrom(agents, true)).toBe("LOW");
  });
});
