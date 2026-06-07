/** Human-readable scoring rules — mirrors stock-service BaseFundamentalScoring / BaseTechnicalAnalysis. */

export const FUNDAMENTAL_RULES = {
  title: "Fundamental score (0–100)",
  categories: [
    {
      name: "Quality (max 40)",
      rules: [
        "ROE ≥ 20% → 20 pts; 15–20% → 16–20; 10–15% → 8–16",
        "ROA ≥ 10% → 10 pts; 7–10% → 7–10; 5–7% → 4–7",
        "Net/gross margin ≥ 20% → 10 pts; 10–20% → 6–10; 5–10% → 3–6",
      ],
    },
    {
      name: "Growth (max 30)",
      rules: [
        "Revenue growth ≥ 20% → 12 pts; 10–20% → 8–12; 0–10% → 4–8",
        "Profit growth ≥ 15% → 10 pts; 5–15% → 5–10",
        "EPS growth ≥ 15% → 8 pts; 5–15% → 4–8",
      ],
    },
    {
      name: "Valuation (max 20)",
      rules: [
        "P/E ≤ 12 → +6; 12–18 → +3–6; 18–30 → 0–3; > 30 → penalty",
        "P/B ≤ 2 → +4; 2–4 → +1–4; > 4 → penalty",
        "Base score starts at 10 before P/E and P/B adjustments",
      ],
    },
    {
      name: "Stability (max 10)",
      rules: [
        "Debt/equity < 0.5 → 10 pts; 0.5–0.7 → 6–8; 0.7–1.0 → 3–6; ≥ 1.0 → 0",
      ],
    },
    {
      name: "Penalties (max −50)",
      rules: [
        "Profit growth < −10% → −15",
        "Debt/equity > 1.5 → −10",
        "P/E > 40 → −8",
      ],
    },
  ],
  formula: "Final = Quality + Growth + Valuation + Stability − Penalties (clamped 0–100)",
  dataSources: [
    "Primary: fundamental_snapshot in Neon (or data/neon-cache/fundamental-snapshots.json)",
    "Fallback: seed market data (P/E, P/B, ROE, revenue growth)",
  ],
} as const;

export const TECHNICAL_RULES = {
  title: "Technical score (0–100)",
  categories: [
    {
      name: "Trend (MA alignment)",
      rules: ["Price vs SMA20/50/200, golden/death cross patterns"],
    },
    {
      name: "Momentum",
      rules: ["RSI zones (30 oversold / 70 overbought), MACD vs signal"],
    },
    {
      name: "Volume",
      rules: ["Volume vs volume MA — confirmation of moves"],
    },
    {
      name: "Support / resistance",
      rules: ["Distance to support/resistance levels from technical_snapshot"],
    },
  ],
  combinedFormula: "Combined = round(0.45 × Technical + 0.55 × Fundamental)",
  signals: [
    "≥ 72 → ACCUMULATE",
    "62–71 → WATCH",
    "52–61 → HOLD",
    "42–51 → TRIM",
    "32–41 → AVOID",
    "< 32 → SELL",
  ],
  dataSources: [
    "Primary: technical_snapshot in Neon (or data/neon-cache/technical-snapshots.json)",
    "Fallback: computed RSI from price history",
  ],
} as const;

export const INDEX_RULES = {
  vn30: "All 30 symbols from data/vn30-stock-info.json (HOSE blue-chip index). Ranked by fundamental score.",
  vn100: "All symbols from data/vn100-stock-info.json. Top 30 shown by default (same as stock-service top-30 screen).",
  portfolio: "Your portfolio_holding symbols — fundamental breakdown per holding you own.",
} as const;
